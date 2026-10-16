import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, type SimulatorConfig } from '../src/config.ts';
import { SimulationRunner } from '../src/runner.ts';
import { isSilent, showcaseRoles } from '../src/showcase.ts';
import { SimulationState, type OccupancySnapshot } from '../src/simulation.ts';
import type { SimulatorUnit } from '../src/units.ts';

const units: SimulatorUnit[] = ['1000006', '1000005', '1000004', '1000003', '1000002', '1000001', '1000007'].map(
  (id) => ({
    id,
    name: `Unidade ${id}`,
    municipalityCode: '3550308',
    city: 'São Paulo',
    state: 'SP',
    latitude: -23.55,
    longitude: -46.63,
  }),
);

const config: SimulatorConfig = {
  ...loadConfig(['--unit-cnes', units.map((unit) => unit.id).join(',')], {}),
  sourceSecret: 'test-secret',
  scenario: 'showcase',
};

function ratioOf(snapshot: OccupancySnapshot): number {
  const capacity = snapshot.categories.reduce((sum, item) => sum + item.capacity, 0);
  const occupied = snapshot.categories.reduce((sum, item) => sum + item.occupied, 0);
  return occupied / capacity;
}

async function runCycle(now: Date): Promise<OccupancySnapshot[]> {
  const controller = new AbortController();
  const sent: OccupancySnapshot[] = [];
  const runner = new SimulationRunner(config, units, new SimulationState(config.seed), {
    now: () => now,
    sleep: async () => controller.abort(),
    send: async (snapshot) => {
      sent.push(snapshot);
      return { attempts: 1, status: 202 };
    },
  });
  await runner.run(controller.signal);
  return sent;
}

test('atribui os papéis do showcase em ordem de CNES', () => {
  const roles = showcaseRoles(units);

  assert.deepEqual(roles.get('1000001'), { kind: 'fixed', ratio: 0.9 });
  assert.deepEqual(roles.get('1000004'), { kind: 'intermittent' });
  assert.equal(roles.has('1000007'), false);
});

test('alterna janelas de confirmação e silêncio alinhadas ao relógio', () => {
  assert.equal(isSilent(new Date('2026-10-15T12:10:00.000Z')), false);
  assert.equal(isSilent(new Date('2026-10-15T12:40:00.000Z')), true);
});

test('mantém faixas fixas, duplica, atrasa e silencia conforme o papel', async () => {
  const sent = await runCycle(new Date('2026-10-15T12:40:00.000Z'));
  const byUnit = (id: string) => sent.filter((snapshot) => snapshot.unitCnes === id);

  assert.ok(ratioOf(byUnit('1000001')[0]) >= 0.85);
  const moderate = ratioOf(byUnit('1000002')[0]);
  assert.ok(moderate >= 0.6 && moderate < 0.85);
  assert.ok(ratioOf(byUnit('1000003')[0]) < 0.6);
  assert.equal(byUnit('1000004').length, 0);

  const duplicate = byUnit('1000005');
  assert.equal(duplicate.length, 2);
  assert.equal(duplicate[0].eventId, duplicate[1].eventId);

  // No past value yet on the first cycle, so no late event.
  assert.equal(byUnit('1000006').length, 1);

  assert.equal(byUnit('1000007').length, 1);
});

test('a unidade intermitente volta a enviar fora da janela de silêncio', async () => {
  const sent = await runCycle(new Date('2026-10-15T12:10:00.000Z'));

  assert.equal(sent.filter((snapshot) => snapshot.unitCnes === '1000004').length, 1);
});

test('o evento atrasado reenvia um valor que a unidade teve de fato', async () => {
  const controller = new AbortController();
  const sent: OccupancySnapshot[] = [];
  let now = new Date('2026-10-15T12:10:00.000Z');
  const runner = new SimulationRunner(config, units, new SimulationState(config.seed), {
    now: () => now,
    sleep: async () => {
      // The next cycle runs ten minutes later; stop after it.
      if (now.getTime() > Date.parse('2026-10-15T12:10:00.000Z')) controller.abort();
      now = new Date(now.getTime() + 10 * 60_000);
    },
    send: async (snapshot) => {
      sent.push(snapshot);
      return { attempts: 1, status: 202 };
    },
  });

  await runner.run(controller.signal);

  const late = sent.filter((snapshot) => snapshot.unitCnes === '1000006');
  assert.equal(late.length, 3);
  const [first, , delayed] = late;
  assert.equal(delayed.observedAt, first.observedAt);
  assert.deepEqual(delayed.categories, first.categories);
  assert.notEqual(delayed.eventId, first.eventId);
});
