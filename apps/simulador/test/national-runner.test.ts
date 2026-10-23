import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { signSnapshot } from '../src/signing.ts';
import { NationalLoadRunner } from '../src/national-runner.ts';
import { SimulationState } from '../src/simulation.ts';
import type { SimulatorConfig } from '../src/config.ts';
import type { SimulatorUnit } from '../src/units.ts';

const units: SimulatorUnit[] = [
  {
    id: '1111111',
    name: 'Unidade A',
    municipalityCode: '3550308',
    city: 'São Paulo',
    state: 'SP',
    latitude: null,
    longitude: null,
  },
  {
    id: '2222222',
    name: 'Unidade B',
    municipalityCode: '3304557',
    city: 'Rio de Janeiro',
    state: 'RJ',
    latitude: null,
    longitude: null,
  },
];

const config: SimulatorConfig = {
  apiUrl: 'http://localhost:3000',
  sourceId: 'occupancy-feed-001',
  sourceIds: ['occupancy-feed-001', 'occupancy-feed-002'],
  sourceSecret: 'test-secret',
  state: null,
  municipalityCode: null,
  city: null,
  latitude: null,
  longitude: null,
  radiusKm: 25,
  maxUnits: Number.MAX_SAFE_INTEGER,
  unitCnes: [],
  seed: 'national-test',
  intervalSeconds: 1,
  occupancyOverrides: [],
  scenario: 'national',
  nationalEventScenario: 'normal',
  delaySeconds: 0,
  durationSeconds: 2,
  concurrency: 2,
  reportIntervalSeconds: 1,
  allowLoadTest: true,
  allowNonlocalTarget: false,
  attendance: false,
  attendanceScenario: 'normal',
};

test('envia unidades nacionais com fontes e métricas determinísticas', async () => {
  let elapsed = 0;
  const sources = new Set<string>();
  const reports: number[] = [];
  const runner = new NationalLoadRunner(
    config,
    units,
    new SimulationState(config.seed),
    {
      now: () => new Date(2026, 0, 1, 0, 0, 0, elapsed),
      sleep: async (milliseconds) => {
        elapsed += milliseconds;
      },
      send: async (_snapshot, sourceId) => {
        sources.add(sourceId);
        return { attempts: 1, status: 202 };
      },
      onReport: (report) => reports.push(report.generated),
    },
  );

  const report = await runner.run();

  assert.equal(report.accepted, report.generated);
  assert.equal(report.failed, 0);
  assert.equal(report.seed, 'national-test');
  assert.equal(report.units, units.length);
  assert.deepEqual(report.sourceIds, config.sourceIds);
  assert.ok(report.durationSeconds >= 0);
  assert.ok(report.generated >= units.length);
  assert.ok(sources.size >= 1);
  assert.ok(reports.length >= 1);
});

test('reenvia o primeiro evento de cada unidade no comportamento duplicate', async () => {
  const sent: string[] = [];
  let elapsed = 0;
  const runner = new NationalLoadRunner(
    { ...config, durationSeconds: 1, nationalEventScenario: 'duplicate' },
    [units[0]!],
    new SimulationState(config.seed),
    {
      now: () => new Date(2026, 0, 1, 0, 0, 0, elapsed),
      sleep: async (milliseconds) => {
        elapsed += milliseconds;
      },
      send: async (snapshot) => {
        sent.push(snapshot.eventId);
        return { attempts: 1, status: 202 };
      },
    },
  );

  const report = await runner.run();

  assert.equal(report.generated, 2);
  assert.deepEqual(sent, [sent[0], sent[0]]);
});

test('mantém execução contínua até receber cancelamento', async () => {
  let elapsed = 0;
  const controller = new AbortController();
  const runner = new NationalLoadRunner(
    { ...config, durationSeconds: 0 },
    [units[0]!],
    new SimulationState(config.seed),
    {
      now: () => new Date(2026, 0, 1, 0, 0, 0, elapsed),
      sleep: async (milliseconds) => {
        elapsed += milliseconds;
        controller.abort();
      },
      send: async () => ({ attempts: 1, status: 202 }),
    },
  );

  const report = await runner.run(controller.signal);

  assert.equal(report.failed, 0);
  assert.equal(report.units, 1);
});

test('assina os eventos nacionais com o segredo da respectiva fonte', async () => {
  let elapsed = 0;
  const secrets = {
    'occupancy-feed-001': 'a'.repeat(32),
    'occupancy-feed-002': 'b'.repeat(32),
  };
  const sources = new Set<string>();
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (_url: URL, options: RequestInit) => {
      const headers = new Headers(options.headers);
      const sourceId = headers.get('X-Webhook-Source') as keyof typeof secrets;
      const timestamp = headers.get('X-Webhook-Timestamp')!;
      sources.add(sourceId);
      assert.equal(
        headers.get('X-Webhook-Signature'),
        `sha256=${signSnapshot(secrets[sourceId], timestamp, String(options.body))}`,
      );
      return new Response('', { status: 202 });
    },
  );
  try {
    const manyUnits = Array.from({ length: 20 }, (_, index) => ({
      ...units[0]!,
      id: String(1000000 + index),
    }));
    const runner = new NationalLoadRunner(
      { ...config, sourceSecret: null, sourceSecrets: secrets },
      manyUnits,
      new SimulationState(config.seed),
      {
        now: () => new Date(2026, 0, 1, 0, 0, 0, elapsed),
        sleep: async (ms) => {
          elapsed += ms;
        },
      },
    );
    const report = await runner.run();
    assert.equal(report.failed, 0);
    assert.equal(report.accepted, report.generated);
    assert.deepEqual([...sources].sort(), Object.keys(secrets));
  } finally {
    fetchMock.mock.restore();
  }
});
