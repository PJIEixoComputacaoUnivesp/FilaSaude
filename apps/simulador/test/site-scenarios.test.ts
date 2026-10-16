import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, type SimulationScenario, type SimulatorConfig } from '../src/config.ts';
import { fetchSiteScenario } from '../src/control.ts';
import { SimulationRunner } from '../src/runner.ts';
import { SimulationState, type OccupancySnapshot } from '../src/simulation.ts';
import type { SimulatorUnit } from '../src/units.ts';

const unit: SimulatorUnit = {
  id: '1234567',
  name: 'Unidade A',
  municipalityCode: '3550308',
  city: 'São Paulo',
  state: 'SP',
  latitude: -23.55,
  longitude: -46.63,
};

function configFor(scenario: SimulationScenario): SimulatorConfig {
  return {
    ...loadConfig(['--unit-cnes', unit.id], {}),
    sourceSecret: 'test-secret',
    scenario,
    intervalSeconds: 30,
  };
}

async function cycles(
  scenario: SimulationScenario,
  count: number,
): Promise<OccupancySnapshot[]> {
  const controller = new AbortController();
  const sent: OccupancySnapshot[] = [];
  let waits = 0;
  const runner = new SimulationRunner(
    configFor(scenario),
    [unit],
    new SimulationState('site-test'),
    {
      now: () => new Date('2026-10-15T12:10:00.000Z'),
      sleep: async () => {
        waits += 1;
        if (waits >= count) controller.abort();
      },
      send: async (snapshot) => {
        sent.push(snapshot);
        return { attempts: 1, status: 202 };
      },
    },
  );
  await runner.run(controller.signal);
  return sent;
}

function ratio(snapshot: OccupancySnapshot): number {
  const capacity = snapshot.categories.reduce((sum, item) => sum + item.capacity, 0);
  const occupied = snapshot.categories.reduce((sum, item) => sum + item.occupied, 0);
  return occupied / capacity;
}

test('surge raises the occupancy every cycle up to the high level', async () => {
  const sent = await cycles('surge', 12);

  assert.ok(ratio(sent[1]) > ratio(sent[0]));
  // It never goes down (a category already above the ceiling stays there).
  for (let index = 1; index < sent.length; index += 1) {
    assert.ok(ratio(sent[index]) >= ratio(sent[index - 1]));
  }
  assert.ok(ratio(sent[sent.length - 1]) >= 0.85);
});

test('outage sends nothing', async () => {
  assert.equal((await cycles('outage', 2)).length, 0);
});

test('replay repeats each snapshot and adds a late one', async () => {
  const sent = await cycles('replay', 1);

  assert.equal(sent.length, 3);
  assert.equal(sent[0].eventId, sent[1].eventId);
  assert.ok(Date.parse(sent[2].observedAt) < Date.parse(sent[0].observedAt));
});

test('follows the site: a new choice starts a cycle before the interval ends', async () => {
  const controller = new AbortController();
  const choices: SimulationScenario[] = ['normal', 'normal', 'outage'];
  const sleeps: number[] = [];
  const changes: SimulationScenario[] = [];
  let sends = 0;
  const runner = new SimulationRunner(
    configFor('normal'),
    [unit],
    new SimulationState('site-test'),
    {
      controlPollMs: 10_000,
      readScenario: async () => choices.shift() ?? 'outage',
      onScenarioChanged: (scenario) => changes.push(scenario),
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        if (sleeps.length >= 4) controller.abort();
      },
      send: async () => {
        sends += 1;
        return { attempts: 1, status: 202 };
      },
    },
  );

  await runner.run(controller.signal);

  // One normal cycle, then the switch to outage after 20 s: no more sends.
  assert.equal(sends, 1);
  assert.deepEqual(changes, ['outage']);
  assert.deepEqual(sleeps.slice(0, 2), [10_000, 10_000]);
  assert.equal(runner.currentScenario, 'outage');
});

test('a failed read keeps the current scenario', async () => {
  const controller = new AbortController();
  const runner = new SimulationRunner(
    configFor('showcase'),
    [unit],
    new SimulationState('site-test'),
    {
      readScenario: async () => {
        throw new Error('API fora do ar');
      },
      sleep: async () => controller.abort(),
      send: async () => ({ attempts: 1, status: 202 }),
    },
  );

  await runner.run(controller.signal);

  assert.equal(runner.currentScenario, 'showcase');
});

test('reads the site scenario, and null when the demonstration is off', async () => {
  const ok = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

  assert.equal(
    await fetchSiteScenario('http://api', undefined, ok({ data: { scenario: 'surge' } })),
    'surge',
  );
  assert.equal(
    await fetchSiteScenario('http://api', undefined, ok({ data: { scenario: 'unknown' } })),
    null,
  );
  assert.equal(await fetchSiteScenario('http://api', undefined, ok({}, 404)), null);
  await assert.rejects(fetchSiteScenario('http://api', undefined, ok({}, 503)));
});
