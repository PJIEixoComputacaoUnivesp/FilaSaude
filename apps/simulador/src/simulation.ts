import { createHash } from 'node:crypto';
import type { SimulatorUnit } from './units.ts';

export const SIMULATOR_SNAPSHOT_TYPE = 'occupancy.snapshot.v1' as const;
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

export interface OccupancySnapshot {
  eventId: string;
  type: typeof SIMULATOR_SNAPSHOT_TYPE;
  unitCnes: string;
  occurredAt: string;
  observedAt: string;
  categories: SimulationCategory[];
}

interface CategoryState {
  capacity: number;
  occupied: number;
}

interface UnitState {
  categories: Map<SimulationCategoryCode, CategoryState>;
}

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export class SimulationState {
  private readonly units = new Map<string, UnitState>();
  private sequence = 0;
  private readonly seed: string;

  constructor(seed: string) {
    if (!seed.trim()) throw new Error('seed deve ser preenchida.');
    this.seed = seed;
  }

  snapshotFor(unit: SimulatorUnit, now = new Date()): OccupancySnapshot {
    const observedAt = new Date(now.getTime());
    const occurredAt = new Date(now.getTime() - 1000);
    const state = this.ensureUnit(unit.id);
    const sequence = this.sequence;
    this.sequence += 1;

    return {
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
  }

  advance(units: readonly SimulatorUnit[], cycle: number): void {
    if (!Number.isInteger(cycle) || cycle < 0) {
      throw new Error('cycle deve ser um inteiro não negativo.');
    }

    for (const unit of units) {
      const state = this.ensureUnit(unit.id);
      for (const code of SIMULATION_CATEGORY_CODES) {
        const category = state.categories.get(code)!;
        const change = deterministicInteger(
          `${this.seed}:${unit.id}:${code}:${cycle}`,
          -2,
          2,
        );
        category.occupied = Math.max(
          0,
          Math.min(category.capacity, category.occupied + change),
        );
      }
    }
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

  /** Sets every category of the unit to about this share of its capacity. */
  setRatio(unitCnes: string, ratio: number): void {
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      throw new Error('ratio deve estar entre 0 e 1.');
    }

    for (const category of this.ensureUnit(unitCnes).categories.values()) {
      category.occupied = Math.round(category.capacity * ratio);
    }
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

    const state = { categories };
    this.units.set(unitCnes, state);
    return state;
  }
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
