import assert from 'node:assert/strict';
import test from 'node:test';
import { SimulationState } from '../src/simulation.ts';
import { SimulationRunner } from '../src/runner.ts';
import type { SimulatorConfig } from '../src/config.ts';
import type { SimulatorUnit } from '../src/units.ts';

const config: SimulatorConfig = {
  apiUrl: 'http://localhost:3000',
  sourceId: 'occupancy-feed',
  sourceSecret: 'test-secret',
  state: 'SP',
  municipalityCode: '3550308',
  city: null,
  latitude: null,
  longitude: null,
  radiusKm: 25,
  maxUnits: 2,
  unitCnes: [],
  seed: 'runner-test',
  intervalSeconds: 30,
  occupancyOverrides: [],
  scenario: 'normal',
  delaySeconds: 0,
  followSite: false,
};

const units: SimulatorUnit[] = [
  {
    id: '1234567',
    name: 'Unidade A',
    municipalityCode: '3550308',
    city: 'São Paulo',
    state: 'SP',
    latitude: -23.55,
    longitude: -46.63,
  },
  {
    id: '7654321',
    name: 'Unidade B',
    municipalityCode: '3550308',
    city: 'São Paulo',
    state: 'SP',
    latitude: -23.56,
    longitude: -46.64,
  },
];

test('envia um snapshot por unidade e avança o estado entre ciclos', async () => {
  const controller = new AbortController();
  const sent: string[] = [];
  const waits: number[] = [];
  const runner = new SimulationRunner(config, units, new SimulationState(config.seed), {
    now: () => new Date('2026-10-15T12:00:00.000Z'),
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      controller.abort();
    },
    send: async (snapshot) => {
      sent.push(snapshot.unitCnes);
      return { attempts: 1, status: 202 };
    },
  });

  await runner.run(controller.signal);

  assert.deepEqual(sent, ['1234567', '7654321']);
  assert.deepEqual(waits, [30_000]);
});

test('não envia novos snapshots depois do cancelamento', async () => {
  const controller = new AbortController();
  controller.abort();
  let sends = 0;
  const runner = new SimulationRunner(config, units, new SimulationState(config.seed), {
    send: async () => {
      sends += 1;
      return { attempts: 1, status: 202 };
    },
  });

  await runner.run(controller.signal);

  assert.equal(sends, 0);
});

test('interrompe a espera entre ciclos quando o sinal é abortado', async () => {
  const controller = new AbortController();
  let sleepAborted = false;
  const runner = new SimulationRunner(config, [units[0]], new SimulationState(config.seed), {
    sleep: async (_milliseconds, signal) =>
      new Promise<void>((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            sleepAborted = true;
            resolve();
          },
          { once: true },
        );
        queueMicrotask(() => controller.abort());
      }),
    send: async () => ({ attempts: 1, status: 202 }),
  });

  await runner.run(controller.signal);

  assert.equal(sleepAborted, true);
});

test('reenvia o mesmo snapshot no cenário duplicate', async () => {
  const controller = new AbortController();
  const sent: string[] = [];
  const runner = new SimulationRunner(
    { ...config, scenario: 'duplicate' },
    [units[0]],
    new SimulationState(config.seed),
    {
      sleep: async () => controller.abort(),
      send: async (snapshot) => {
        sent.push(snapshot.eventId);
        return { attempts: 1, status: 202 };
      },
    },
  );

  await runner.run(controller.signal);

  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]);
});

test('gera timestamps atrasados no cenário delayed', async () => {
  const controller = new AbortController();
  let observedAt = '';
  const now = new Date('2026-10-15T12:00:00.000Z');
  const runner = new SimulationRunner(
    { ...config, scenario: 'delayed', delaySeconds: 600 },
    [units[0]],
    new SimulationState(config.seed),
    {
      now: () => now,
      sleep: async () => controller.abort(),
      send: async (snapshot) => {
        observedAt = snapshot.observedAt;
        return { attempts: 1, status: 202 };
      },
    },
  );

  await runner.run(controller.signal);

  assert.equal(observedAt, '2026-10-15T11:50:00.000Z');
});
