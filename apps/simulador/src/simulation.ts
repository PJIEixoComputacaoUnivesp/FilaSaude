import { createHash } from 'node:crypto';
import {
  activeSlots,
  dailyPeriod,
  initialStock,
  profileFor,
  stepAttendance,
  type AttendanceProfile,
  type AttendanceScenario,
  type AttendanceStock,
} from './attendance.ts';
import type { SimulatorUnit } from './units.ts';

export const SIMULATOR_SNAPSHOT_TYPE = 'occupancy.snapshot.v1' as const;
export const SIMULATOR_ATTENDANCE_SNAPSHOT_TYPE = 'occupancy.snapshot.v2' as const;
const DEFAULT_STEP_SECONDS = 120;
export const SIMULATION_CATEGORY_CODES = [
  'observation',
  'stabilization',
  'inpatient',
] as const;

export type SimulationCategoryCode = (typeof SIMULATION_CATEGORY_CODES)[number];

export interface SimulationCategory {
  code: SimulationCategoryCode;
  capacity: number;
  occupied: number;
}

export interface CompletedAttendances {
  count: number;
  periodStart: string;
  periodEnd: string;
}

export interface AttendanceSnapshot {
  waiting: number;
  inService: number;
  serviceSlots: number;
  installedServiceSlots: number;
  services: string[];
  completed: CompletedAttendances;
}

export interface OccupancySnapshot {
  eventId: string;
  type: typeof SIMULATOR_SNAPSHOT_TYPE | typeof SIMULATOR_ATTENDANCE_SNAPSHOT_TYPE;
  unitCnes: string;
  occurredAt: string;
  observedAt: string;
  categories: SimulationCategory[];
  attendance?: AttendanceSnapshot;
}

export interface SimulationOptions {
  /** Sends `occupancy.snapshot.v2` with the attendance stocks. */
  attendance?: boolean;
  attendanceScenario?: AttendanceScenario;
  /** Nominal duration of one step, normally the configured interval. */
  stepSeconds?: number;
}

interface CategoryState {
  capacity: number;
  occupied: number;
}

interface AttendanceState {
  profile: AttendanceProfile;
  stock: AttendanceStock;
  /** Completions since the last snapshot, not yet assigned to a period. */
  pendingCompleted: number;
  periodStart: string | null;
  periodEnd: string | null;
  completedInPeriod: number;
}

interface UnitState {
  categories: Map<SimulationCategoryCode, CategoryState>;
  attendance: AttendanceState;
}

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export class SimulationState {
  private readonly units = new Map<string, UnitState>();
  private sequence = 0;
  private readonly seed: string;
  private readonly attendance: boolean;
  private readonly attendanceScenario: AttendanceScenario;
  private readonly stepSeconds: number;

  constructor(seed: string, options: SimulationOptions = {}) {
    if (!seed.trim()) throw new Error('seed deve ser preenchida.');
    const stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
      throw new Error('stepSeconds deve ser um número positivo.');
    }
    this.seed = seed;
    this.attendance = options.attendance ?? false;
    this.attendanceScenario = options.attendanceScenario ?? 'normal';
    this.stepSeconds = stepSeconds;
  }

  snapshotFor(unit: SimulatorUnit, now = new Date()): OccupancySnapshot {
    const observedAt = new Date(now.getTime());
    const occurredAt = new Date(now.getTime() - 1000);
    const state = this.ensureUnit(unit.id);
    const sequence = this.sequence;
    this.sequence += 1;

    const snapshot: OccupancySnapshot = {
      eventId: createEventId(this.seed, unit.id, sequence, observedAt),
      type: SIMULATOR_SNAPSHOT_TYPE,
      unitCnes: unit.id,
      occurredAt: occurredAt.toISOString(),
      observedAt: observedAt.toISOString(),
      categories: SIMULATION_CATEGORY_CODES.map((code) => ({
        code,
        ...state.categories.get(code)!,
      })),
    };
    if (!this.attendance) return snapshot;

    return {
      ...snapshot,
      type: SIMULATOR_ATTENDANCE_SNAPSHOT_TYPE,
      attendance: reportAttendance(
        state.attendance,
        activeSlots(state.attendance.profile, this.attendanceScenario),
        occurredAt,
      ),
    };
  }

  advance(units: readonly SimulatorUnit[], cycle: number): void {
    if (!Number.isInteger(cycle) || cycle < 0) {
      throw new Error('cycle deve ser um inteiro não negativo.');
    }

    for (const unit of units) this.advanceUnit(unit, cycle);
  }

  advanceUnit(unit: SimulatorUnit, occurrence: number): void {
    if (!Number.isInteger(occurrence) || occurrence < 0) {
      throw new Error('occurrence deve ser um inteiro não negativo.');
    }

    const state = this.ensureUnit(unit.id);
    for (const code of SIMULATION_CATEGORY_CODES) {
      const category = state.categories.get(code)!;
      const change = deterministicInteger(
        `${this.seed}:${unit.id}:${code}:${occurrence}`,
        -2,
        2,
      );
      category.occupied = Math.max(
        0,
        Math.min(category.capacity, category.occupied + change),
      );
    }

    if (!this.attendance) return;
    const next = stepAttendance(state.attendance.stock, {
      seed: this.seed,
      unitCnes: unit.id,
      occurrence,
      stepSeconds: this.stepSeconds,
      profile: state.attendance.profile,
      scenario: this.attendanceScenario,
    });
    state.attendance.stock = next.stock;
    state.attendance.pendingCompleted += next.transitions.completed;
  }

  setOccupied(
    unitCnes: string,
    code: SimulationCategoryCode,
    occupied: number,
  ): void {
    if (!Number.isSafeInteger(occupied) || occupied < 0) {
      throw new Error('occupied deve ser um inteiro não negativo.');
    }

    const category = this.ensureUnit(unitCnes).categories.get(code)!;
    if (occupied > category.capacity) {
      throw new Error('occupied não pode ser maior que capacity.');
    }
    category.occupied = occupied;
  }

  private ensureUnit(unitCnes: string): UnitState {
    const existing = this.units.get(unitCnes);
    if (existing) return existing;

    const categories = new Map<SimulationCategoryCode, CategoryState>();
    for (const code of SIMULATION_CATEGORY_CODES) {
      const capacity = deterministicInteger(
        `${this.seed}:${unitCnes}:${code}:capacity`,
        capacityRange(code)[0],
        capacityRange(code)[1],
      );
      const occupied = deterministicInteger(
        `${this.seed}:${unitCnes}:${code}:occupied`,
        0,
        capacity,
      );
      categories.set(code, { capacity, occupied });
    }

    const profile = profileFor(this.seed, unitCnes);
    const state: UnitState = {
      categories,
      attendance: {
        profile,
        stock: initialStock(this.seed, unitCnes, profile, this.attendanceScenario),
        pendingCompleted: 0,
        periodStart: null,
        periodEnd: null,
        completedInPeriod: 0,
      },
    };
    this.units.set(unitCnes, state);
    return state;
  }
}

// A completion is counted in the period of the first snapshot that reports it,
// using occurredAt. The count is cumulative within the period, so resending a
// snapshot never adds to it, and it restarts at the next period.
function reportAttendance(
  state: AttendanceState,
  serviceSlots: number,
  occurredAt: Date,
): AttendanceSnapshot {
  const period = dailyPeriod(occurredAt);
  if (state.periodStart !== period.start) {
    state.periodStart = period.start;
    state.periodEnd = period.end;
    state.completedInPeriod = 0;
  }
  state.completedInPeriod += state.pendingCompleted;
  state.pendingCompleted = 0;

  return {
    waiting: state.stock.waiting,
    inService: state.stock.inService,
    serviceSlots,
    installedServiceSlots: state.profile.serviceSlots,
    services: state.profile.code === 'small'
      ? ['general-care', 'nursing', 'observation']
      : ['general-care', 'nursing', 'observation', 'stabilization'],
    completed: {
      count: state.completedInPeriod,
      periodStart: period.start,
      periodEnd: period.end,
    },
  };
}

function capacityRange(code: SimulationCategoryCode): [number, number] {
  switch (code) {
    case 'observation':
      return [20, 60];
    case 'stabilization':
      return [4, 12];
    case 'inpatient':
      return [8, 24];
  }
}

function deterministicInteger(seed: string, minimum: number, maximum: number): number {
  const digest = createHash('sha256').update(seed).digest();
  const value = digest.readUInt32BE(0) / 0x1_0000_0000;
  return minimum + Math.floor(value * (maximum - minimum + 1));
}

function createEventId(
  seed: string,
  unitCnes: string,
  sequence: number,
  observedAt: Date,
): string {
  const timestamp = encodeBase32(BigInt(observedAt.getTime()), 10);
  const digest = createHash('sha256')
    .update(`${seed}:${unitCnes}:${sequence}:${observedAt.getTime()}`)
    .digest();
  let random = 0n;
  for (const byte of digest.subarray(0, 10)) random = (random << 8n) | BigInt(byte);
  return `${timestamp}${encodeBase32(random, 16)}`;
}

function encodeBase32(value: bigint, length: number): string {
  let remaining = value;
  let encoded = '';
  for (let index = 0; index < length; index += 1) {
    encoded = ULID_ALPHABET[Number(remaining & 31n)] + encoded;
    remaining >>= 5n;
  }
  return encoded;
}
