import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { sendSnapshot } from '../src/transport.ts';
import { SimulationState } from '../src/simulation.ts';

const apiUrl = process.env.SIMULATOR_INTEGRATION_API_URL;
const sourceSecret = process.env.SIMULATOR_SOURCE_SECRET;
const unitCnes = process.env.SIMULATOR_INTEGRATION_UNIT_CNES;
const sourceId = process.env.SIMULATOR_SOURCE_ID ?? 'occupancy-feed';
const integrationEnabled = Boolean(apiUrl && sourceSecret && unitCnes);

test('envia um snapshot do simulador para a API em execução', {
  skip: !integrationEnabled,
}, async () => {
  const state = new SimulationState(randomUUID());
  state.setOccupied(unitCnes!, 'observation', 1);
  const snapshot = state.snapshotFor({
    id: unitCnes!,
    name: 'Integration test unit',
    municipalityCode: '',
    city: '',
    state: '',
    latitude: null,
    longitude: null,
  });

  const result = await sendSnapshot(snapshot, {
    apiUrl: apiUrl!,
    sourceId,
    sourceSecret: sourceSecret!,
  });

  assert.equal(result.status, 202);
  assert.equal(result.attempts, 1);
});
