import { createHash } from 'node:crypto';

export const ATTENDANCE_SCENARIOS = [
  'normal',
  'demand-surge',
  'capacity-reduction',
] as const;
export type AttendanceScenario = (typeof ATTENDANCE_SCENARIOS)[number];

export const ATTENDANCE_PROFILE_CODES = ['small', 'medium', 'large'] as const;
export type AttendanceProfileCode = (typeof ATTENDANCE_PROFILE_CODES)[number];

/**
 * Synthetic operating profile of a unit. These are demonstration hypotheses,
 * not the real size or staffing of any CNES unit.
 */
export interface AttendanceProfile {
  code: AttendanceProfileCode;
  /** Simultaneous attendances the unit can sustain. */
  serviceSlots: number;
  /** Average duration of one attendance, in minutes. */
  averageServiceMinutes: number;
  /** Average arrivals per hour in the normal scenario. */
  arrivalsPerHour: number;
}

// Normal arrivals use 75% of each profile's throughput
// (serviceSlots * 60 / averageServiceMinutes), so the queue drains on average.
const PROFILES: Record<AttendanceProfileCode, AttendanceProfile> = {
  small: { code: 'small', serviceSlots: 2, averageServiceMinutes: 20, arrivalsPerHour: 4.5 },
  medium: { code: 'medium', serviceSlots: 4, averageServiceMinutes: 20, arrivalsPerHour: 9 },
  large: { code: 'large', serviceSlots: 8, averageServiceMinutes: 20, arrivalsPerHour: 18 },
};

const DEMAND_SURGE_FACTOR = 1.6;
const CAPACITY_REDUCTION_FACTOR = 0.5;
const MAXIMUM_POISSON_MEAN = 30;

/** Stocks of people at one instant. */
export interface AttendanceStock {
  waiting: number;
  inService: number;
}

/** Transitions applied in one step, in the order they happen. */
export interface AttendanceTransitions {
  completed: number;
  arrivals: number;
  started: number;
}

export interface AttendanceStepInput {
  seed: string;
  unitCnes: string;
  occurrence: number;
  stepSeconds: number;
  profile: AttendanceProfile;
  scenario: AttendanceScenario;
}

export function profileFor(seed: string, unitCnes: string): AttendanceProfile {
  const index = Math.floor(
    uniform(`${seed}:${unitCnes}:attendance:profile`) * ATTENDANCE_PROFILE_CODES.length,
  );
  return PROFILES[ATTENDANCE_PROFILE_CODES[index]!];
}

/** Starts within the active slots, so no unit begins over its capacity. */
export function initialStock(
  seed: string,
  unitCnes: string,
  profile: AttendanceProfile,
  scenario: AttendanceScenario = 'normal',
): AttendanceStock {
  const slots = activeSlots(profile, scenario);
  return {
    waiting: integerBetween(`${seed}:${unitCnes}:attendance:waiting`, 0, slots),
    inService: integerBetween(`${seed}:${unitCnes}:attendance:in-service`, 0, slots),
  };
}

export function activeSlots(profile: AttendanceProfile, scenario: AttendanceScenario): number {
  if (scenario !== 'capacity-reduction') return profile.serviceSlots;
  return Math.max(1, Math.round(profile.serviceSlots * CAPACITY_REDUCTION_FACTOR));
}

export function arrivalsPerHour(
  profile: AttendanceProfile,
  scenario: AttendanceScenario,
): number {
  return scenario === 'demand-surge'
    ? profile.arrivalsPerHour * DEMAND_SURGE_FACTOR
    : profile.arrivalsPerHour;
}

/**
 * Advances the stocks by one step: attendances in progress finish first and
 * free their slots, then people arrive, then waiting people start being
 * attended while there are free slots. The queue has no ceiling.
 *
 *   waiting   = waiting before + arrivals - started
 *   inService = inService before + started - completed
 */
export function stepAttendance(
  stock: AttendanceStock,
  input: AttendanceStepInput,
): { stock: AttendanceStock; transitions: AttendanceTransitions } {
  const key = `${input.seed}:${input.unitCnes}:attendance:${input.occurrence}`;
  const stepMinutes = input.stepSeconds / 60;

  // Independent random durations (exponential model), rather than rounding a
  // fixed fraction of the stock. The seed still reproduces each experiment.
  const completionChance = -Math.expm1(-stepMinutes / input.profile.averageServiceMinutes);
  let completed = 0;
  for (let slot = 0; slot < stock.inService; slot += 1) {
    if (uniform(`${key}:completed:${slot}`) < completionChance) completed += 1;
  }

  const arrivalMean = (arrivalsPerHour(input.profile, input.scenario) * stepMinutes) / 60;
  const arrivals = poisson(arrivalMean, uniform(`${key}:arrivals`));

  const inServiceAfterCompletions = stock.inService - completed;
  const freeSlots = Math.max(
    0,
    activeSlots(input.profile, input.scenario) - inServiceAfterCompletions,
  );
  const started = Math.min(stock.waiting + arrivals, freeSlots);

  return {
    stock: {
      waiting: stock.waiting + arrivals - started,
      inService: inServiceAfterCompletions + started,
    },
    transitions: { completed, arrivals, started },
  };
}

/**
 * Start (inclusive) and end (exclusive) of the Brasília calendar day that
 * contains `instant`. Brazil has had no daylight saving time since 2019, so a
 * fixed UTC-03:00 offset is used for every unit.
 */
export function dailyPeriod(instant: Date): { start: string; end: string } {
  const offsetMilliseconds = 3 * 60 * 60 * 1000;
  const local = new Date(instant.getTime() - offsetMilliseconds);
  const day = local.toISOString().slice(0, 10);
  const next = new Date(Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return { start: `${day}T00:00:00-03:00`, end: `${next}T00:00:00-03:00` };
}

// Inverse transform sampling. Means above the cap use a normal approximation,
// which avoids underflow of exp(-mean) for long steps.
function poisson(mean: number, value: number): number {
  if (mean <= 0) return 0;
  if (mean > MAXIMUM_POISSON_MEAN) {
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * inverseNormal(value)));
  }

  let count = 0;
  let probability = Math.exp(-mean);
  let cumulative = probability;
  while (value > cumulative && probability > 0) {
    count += 1;
    probability *= mean / count;
    cumulative += probability;
  }
  return count;
}

// Abramowitz and Stegun 26.2.23 (absolute error below 4.5e-4).
function inverseNormal(value: number): number {
  const clamped = Math.min(1 - 1e-9, Math.max(1e-9, value));
  const t = Math.sqrt(-2 * Math.log(clamped < 0.5 ? clamped : 1 - clamped));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
    (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return clamped < 0.5 ? -z : z;
}

function integerBetween(seed: string, minimum: number, maximum: number): number {
  return minimum + Math.floor(uniform(seed) * (maximum - minimum + 1));
}

function uniform(seed: string): number {
  return createHash('sha256').update(seed).digest().readUInt32BE(0) / 0x1_0000_0000;
}
