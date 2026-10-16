import {
  SnapshotTransportHttpError,
  type SnapshotTransportResult,
} from './transport.ts';

const MAX_LATENCY_SAMPLES = 10_000;

export interface LoadReport {
  durationSeconds: number;
  seed: string;
  units: number;
  sourceIds: string[];
  generated: number;
  accepted: number;
  rejected: number;
  failed: number;
  retries: number;
  responses: Record<string, number>;
  latencyMs: {
    count: number;
    p50: number;
    p95: number;
    p99: number;
  };
}

export type LoadMetricsReport = Omit<
  LoadReport,
  'durationSeconds' | 'seed' | 'units' | 'sourceIds'
>;

export class LoadMetrics {
  private generated = 0;
  private accepted = 0;
  private rejected = 0;
const MAX_LATENCY_SAMPLES = 10_000;

export class LoadMetrics {
  private generated = 0;
  private accepted = 0;
  private rejected = 0;
  private failed = 0;
  private retries = 0;
  private readonly responses = new Map<string, number>();
  private readonly latencies = new Array<number>(MAX_LATENCY_SAMPLES);
  private latencyCount = 0;
  private latencyOffset = 0;

  recordGenerated(): void {
    this.generated += 1;
  }

  recordResult(result: SnapshotTransportResult, latencyMs: number): void {
    this.accepted += result.status >= 200 && result.status < 300 ? 1 : 0;
    this.rejected += result.status >= 400 && result.status < 500 ? 1 : 0;
    this.failed += result.status >= 500 ? 1 : 0;
    this.retries += Math.max(0, result.attempts - 1);
    this.recordResponse(result.status.toString());
    this.latencies[this.latencyOffset] = latencyMs;
    this.latencyOffset = (this.latencyOffset + 1) % MAX_LATENCY_SAMPLES;
    this.latencyCount = Math.min(this.latencyCount + 1, MAX_LATENCY_SAMPLES);
  }

  recordError(error: unknown): void {
    if (error instanceof SnapshotTransportHttpError) {
      this.rejected += error.status >= 400 && error.status < 500 ? 1 : 0;
      this.failed += error.status >= 500 ? 1 : 0;
      this.recordResponse(error.status.toString());
      return;
    }

    this.failed += 1;
    const key = error instanceof Error ? 'network_error' : 'unknown_error';
    this.recordResponse(key);
  }

  snapshot(): LoadMetricsReport {
    const latencies = this.latencies
      .slice(0, this.latencyCount)
      .sort((left, right) => left - right);
    return {
      generated: this.generated,
      accepted: this.accepted,
      rejected: this.rejected,
      failed: this.failed,
      retries: this.retries,
      responses: Object.fromEntries(this.responses),
      latencyMs: {
        count: latencies.length,
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
      },
    };
  }

  private recordResponse(key: string): void {
    this.responses.set(key, (this.responses.get(key) ?? 0) + 1);
  }
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1);
  return values[index]!;
}
