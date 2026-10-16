import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.ts';

test('lê ocupações iniciais do cenário', () => {
  const config = loadConfig([
    '--set-occupied',
    '1234567:observation:13,7654321:inpatient:4',
  ], {});

  assert.deepEqual(config.occupancyOverrides, [
    { unitCnes: '1234567', category: 'observation', occupied: 13 },
    { unitCnes: '7654321', category: 'inpatient', occupied: 4 },
  ]);
});

test('rejeita ocupação inicial com formato inválido', () => {
  assert.throws(
    () => loadConfig(['--set-occupied', '1234567:unknown:2'], {}),
    /set-occupied deve usar/,
  );
});
