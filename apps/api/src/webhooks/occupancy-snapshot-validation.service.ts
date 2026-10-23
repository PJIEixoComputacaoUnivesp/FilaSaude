import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  OCCUPANCY_ATTENDANCE_SNAPSHOT_TYPE,
  OCCUPANCY_CATEGORY_CODES,
  OCCUPANCY_SNAPSHOT_TYPES,
  type OccupancySnapshot,
} from './occupancy-snapshot.types.js';

const EVENT_ID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const CNES_PATTERN = /^\d{7}$/;
export const OCCUPANCY_SNAPSHOT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

@Injectable()
export class OccupancySnapshotValidationService {
  validate(payload: unknown, now = new Date()): OccupancySnapshot {
    const fields: string[] = [];
    if (!isRecord(payload)) {
      throw invalidPayload(['body']);
    }

    const attendanceAllowed =
      payload.type === OCCUPANCY_ATTENDANCE_SNAPSHOT_TYPE;
    addUnknownFields(fields, payload, [
      'eventId',
      'type',
      'unitCnes',
      'occurredAt',
      'observedAt',
      'categories',
      ...(attendanceAllowed ? ['attendance'] : []),
    ]);
    requireString(payload, 'eventId', fields, EVENT_ID_PATTERN);
    if (!OCCUPANCY_SNAPSHOT_TYPES.includes(payload.type as never)) {
      fields.push('type');
    }
    requireString(payload, 'unitCnes', fields, CNES_PATTERN);
    requireDateTime(payload, 'occurredAt', fields);
    requireDateTime(payload, 'observedAt', fields);

    if (!Array.isArray(payload.categories) || payload.categories.length === 0) {
      fields.push('categories');
    } else {
      const codes = new Set<string>();
      payload.categories.forEach((category, index) => {
        const path = `categories[${index}]`;
        if (!isRecord(category)) {
          fields.push(path);
          return;
        }
        addUnknownFields(
          fields,
          category,
          ['code', 'capacity', 'occupied'],
          path,
        );
        if (
          typeof category.code !== 'string' ||
          !OCCUPANCY_CATEGORY_CODES.includes(category.code as never) ||
          codes.has(category.code)
        ) {
          fields.push(`${path}.code`);
        } else {
          codes.add(category.code);
        }
        if (!isNonNegativeInteger(category.capacity)) {
          fields.push(`${path}.capacity`);
        }
        if (
          !isNonNegativeInteger(category.occupied) ||
          (isNonNegativeInteger(category.capacity) &&
            category.occupied > category.capacity)
        ) {
          fields.push(`${path}.occupied`);
        }
      });
    }

    if (attendanceAllowed && 'attendance' in payload) {
      validateAttendance(payload.attendance, payload.occurredAt, fields);
    }

    if (
      typeof payload.occurredAt === 'string' &&
      typeof payload.observedAt === 'string' &&
      isValidDateTime(payload.occurredAt) &&
      isValidDateTime(payload.observedAt) &&
      new Date(payload.occurredAt) > new Date(payload.observedAt)
    ) {
      fields.push('occurredAt');
      fields.push('observedAt');
    }

    if (
      typeof payload.observedAt === 'string' &&
      isValidDateTime(payload.observedAt) &&
      new Date(payload.observedAt).getTime() >
        now.getTime() + OCCUPANCY_SNAPSHOT_FUTURE_TOLERANCE_MS
    ) {
      fields.push('observedAt');
    }

    if (fields.length > 0) throw invalidPayload([...new Set(fields)]);
    return payload as unknown as OccupancySnapshot;
  }
}

function invalidPayload(fields: string[]): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'invalid_occupancy_snapshot',
    message: 'O snapshot não atende ao contrato de ocupação.',
    fields,
  });
}

/**
 * Every field is optional, but the object needs at least one: absence means
 * "not informed", so `null` and an empty object are rejected. The completed
 * period is half-open and must contain occurredAt.
 */
function validateAttendance(
  attendance: unknown,
  occurredAt: unknown,
  fields: string[],
): void {
  if (!isRecord(attendance) || Object.keys(attendance).length === 0) {
    fields.push('attendance');
    return;
  }
  addUnknownFields(
    fields,
    attendance,
    ['waiting', 'inService', 'serviceSlots', 'completed'],
    'attendance',
  );
  for (const field of ['waiting', 'inService'] as const) {
    if (field in attendance && !isNonNegativeInteger(attendance[field])) {
      fields.push(`attendance.${field}`);
    }
  }
  if (
    'serviceSlots' in attendance &&
    (!isNonNegativeInteger(attendance.serviceSlots) ||
      attendance.serviceSlots < 1)
  ) {
    fields.push('attendance.serviceSlots');
  }
  if (!('completed' in attendance)) return;

  const completed = attendance.completed;
  if (!isRecord(completed)) {
    fields.push('attendance.completed');
    return;
  }
  addUnknownFields(
    fields,
    completed,
    ['count', 'periodStart', 'periodEnd'],
    'attendance.completed',
  );
  if (!isNonNegativeInteger(completed.count)) {
    fields.push('attendance.completed.count');
  }
  requireDateTime(completed, 'periodStart', fields, 'attendance.completed');
  requireDateTime(completed, 'periodEnd', fields, 'attendance.completed');
  if (
    typeof completed.periodStart !== 'string' ||
    typeof completed.periodEnd !== 'string' ||
    !isValidDateTime(completed.periodStart) ||
    !isValidDateTime(completed.periodEnd)
  ) {
    return;
  }

  const start = Date.parse(completed.periodStart);
  const end = Date.parse(completed.periodEnd);
  if (start >= end) {
    fields.push('attendance.completed.periodEnd');
  } else if (typeof occurredAt === 'string' && isValidDateTime(occurredAt)) {
    const occurred = Date.parse(occurredAt);
    if (occurred < start || occurred >= end) {
      fields.push('attendance.completed.periodStart');
      fields.push('attendance.completed.periodEnd');
    }
  }
}

function requireString(
  payload: Record<string, unknown>,
  field: string,
  fields: string[],
  pattern: RegExp,
): void {
  if (typeof payload[field] !== 'string' || !pattern.test(payload[field])) {
    fields.push(field);
  }
}

function requireDateTime(
  payload: Record<string, unknown>,
  field: string,
  fields: string[],
  prefix?: string,
): void {
  if (typeof payload[field] !== 'string' || !isValidDateTime(payload[field])) {
    fields.push(prefix ? `${prefix}.${field}` : field);
  }
}

function isValidDateTime(value: string): boolean {
  if (!ISO_DATE_TIME_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    return false;
  }

  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function addUnknownFields(
  fields: string[],
  value: Record<string, unknown>,
  allowed: string[],
  prefix?: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fields.push(prefix ? `${prefix}.${key}` : key);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
