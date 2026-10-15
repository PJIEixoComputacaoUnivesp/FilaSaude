import assert from 'node:assert/strict';
import test from 'node:test';
import { sendSnapshot } from '../src/transport.ts';
import type { OccupancySnapshot } from '../src/simulation.ts';

const apiUrl = process.env.SIMULATOR_INTEGRATION_API_URL;
const sourceSecret = process.env.SIMULATOR_SOURCE_SECRET;
const unitCnes = process.env.SIMULATOR_INTEGRATION_UNIT_CNES;
const sourceId = process.env.SIMULATOR_SOURCE_ID ?? 'occupancy-feed';
const integrationEnabled = Boolean(apiUrl && sourceSecret && unitCnes);

test('envia um snapshot do simulador para a API em execução', {
  skip: !integrationEnabled,
}, async () => {
  const snapshot: OccupancySnapshot = {
    eventId: '01M500ZZZZZZZZZZZZZZZZZZZZ',
    type: 'occupancy.snapshot.v1',
    unitCnes: unitCnes!,
    occurredAt: new Date(Date.now() - 1000).toISOString(),
    observedAt: new Date().toISOString(),
    categories: [{ code: 'observation', capacity: 20, occupied: 1 }],
  };

  const result = await sendSnapshot(snapshot, {
    apiUrl: apiUrl!,
    sourceId,
    sourceSecret: sourceSecret!,
  });

  assert.equal(result.status, 202);
  assert.equal(result.attempts, 1);
});
