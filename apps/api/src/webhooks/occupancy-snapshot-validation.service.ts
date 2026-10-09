import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  OCCUPANCY_CATEGORY_CODES,
  OCCUPANCY_SNAPSHOT_TYPE,
  type OccupancySnapshot,
} from './occupancy-snapshot.types.js';

const EVENT_ID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const CNES_PATTERN = /^\d{7}$/;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

@Injectable()
export class OccupancySnapshotValidationService {
  validate(payload: unknown): OccupancySnapshot {
    const fields: string[] = [];
    if (!isRecord(payload)) {
      throw invalidPayload(['body']);
    }

    addUnknownFields(fields, payload, [
      'eventId',
      'type',
      'unitCnes',
      'occurredAt',
      'observedAt',
      'categories',
    ]);
    requireString(payload, 'eventId', fields, EVENT_ID_PATTERN);
    if (payload.type !== OCCUPANCY_SNAPSHOT_TYPE) fields.push('type');
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

    if (fields.length > 0) throw invalidPayload([...new Set(fields)]);
    return payload as unknown as OccupancySnapshot;
  }
}

function invalidPayload(fields: string[]): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'invalid_occupancy_snapshot',
    message: 'O snapshot não atende ao contrato v1.',
    fields,
  });
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
): void {
  if (typeof payload[field] !== 'string' || !isValidDateTime(payload[field])) {
    fields.push(field);
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
