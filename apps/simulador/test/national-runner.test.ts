import assert from 'node:assert/strict';
import test from 'node:test';
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
