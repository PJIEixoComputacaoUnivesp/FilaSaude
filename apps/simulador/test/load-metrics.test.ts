import assert from 'node:assert/strict';
import test from 'node:test';
import { LoadMetrics } from '../src/load-metrics.ts';
import { SnapshotTransportHttpError } from '../src/transport.ts';

test('agrega respostas, retries e percentis de latência', () => {
  const metrics = new LoadMetrics();
  metrics.recordGenerated();
  metrics.recordResult({ attempts: 2, status: 202 }, 10);
  metrics.recordGenerated();
  metrics.recordResult({ attempts: 1, status: 429 }, 20);
  metrics.recordGenerated();
  metrics.recordError(new Error('timeout'));

  assert.deepEqual(metrics.snapshot(), {
    generated: 3,
    accepted: 1,
    rejected: 1,
    failed: 1,
    retries: 1,
    responses: { '202': 1, '429': 1, network_error: 1 },
    latencyMs: { count: 2, p50: 10, p95: 20, p99: 20 },
  });
});

test('distingue rejeição HTTP de falha de rede', () => {
  const metrics = new LoadMetrics();
  metrics.recordGenerated();
  metrics.recordError(new SnapshotTransportHttpError(403));

  assert.deepEqual(metrics.snapshot(), {
    generated: 1,
    accepted: 0,
    rejected: 1,
    failed: 0,
    retries: 0,
    responses: { '403': 1 },
    latencyMs: { count: 0, p50: 0, p95: 0, p99: 0 },
  });
});
