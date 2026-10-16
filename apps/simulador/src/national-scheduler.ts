import { createHash } from 'node:crypto';
import type { SimulatorUnit } from './units.ts';

export interface NationalScheduleItem {
  unit: SimulatorUnit;
  occurrence: number;
  scheduledAt: number;
}

export interface NationalScheduleOptions {
  seed: string;
  intervalSeconds: number;
  units: readonly SimulatorUnit[];
  startedAt: number;
}

export class NationalSchedule {
  private readonly seed: string;
  private readonly intervalMilliseconds: number;
  private readonly queue: NationalScheduleItem[];

  constructor(options: NationalScheduleOptions) {
    this.seed = options.seed;
    this.intervalMilliseconds = options.intervalSeconds * 1000;
    this.queue = options.units.map((unit) => ({
      unit,
      occurrence: 0,
      scheduledAt:
        options.startedAt + deterministicOffset(`${options.seed}:${unit.id}:0`, this.intervalMilliseconds),
    }));
  }

  next(): NationalScheduleItem | undefined {
    if (this.queue.length === 0) return undefined;

    let nextIndex = 0;
    for (let index = 1; index < this.queue.length; index += 1) {
      const current = this.queue[index]!;
      const next = this.queue[nextIndex]!;
      if (
        current.scheduledAt < next.scheduledAt ||
        (current.scheduledAt === next.scheduledAt && current.unit.id < next.unit.id)
      ) {
        nextIndex = index;
      }
    }

    return this.queue.splice(nextIndex, 1)[0];
  }

  scheduleNext(item: NationalScheduleItem): void {
    const occurrence = item.occurrence + 1;
    this.queue.push({
      unit: item.unit,
      occurrence,
      scheduledAt:
        item.scheduledAt +
        this.intervalMilliseconds / 2 +
        deterministicOffset(
          `${this.seed}:${item.unit.id}:${occurrence}`,
          Math.max(1, this.intervalMilliseconds),
        ),
    });
  }
}

function deterministicOffset(seed: string, maximum: number): number {
  if (maximum <= 0) return 0;
  return createHash('sha256').update(seed).digest().readUInt32BE(0) % maximum;
}
