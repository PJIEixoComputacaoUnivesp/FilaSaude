import assert from 'node:assert/strict';
import test from 'node:test';
import { NationalSchedule } from '../src/national-scheduler.ts';
import type { SimulatorUnit } from '../src/units.ts';

const units: SimulatorUnit[] = [
  {
    id: '1111111',
    name: 'Unidade A',
    municipalityCode: '3550308',
    city: 'SÃ£o Paulo',
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

test('gera agenda determinística e independente por unidade', () => {
  const options = {
    seed: 'national-test',
    intervalSeconds: 10,
    units,
    startedAt: 0,
  };
  const first = new NationalSchedule(options);
  const second = new NationalSchedule(options);
  const firstItems = [first.next()!, first.next()!];
  const secondItems = [second.next()!, second.next()!];

  assert.deepEqual(firstItems, secondItems);
  assert.notEqual(firstItems[0]!.scheduledAt, firstItems[1]!.scheduledAt);
  assert.deepEqual(firstItems.map((item) => item.occurrence), [0, 0]);
});

test('reagenda a unidade a partir do próprio evento', () => {
  const schedule = new NationalSchedule({
    seed: 'national-test',
    intervalSeconds: 10,
    units: [units[0]!],
    startedAt: 0,
  });
  const first = schedule.next()!;
  schedule.scheduleNext(first);
  const second = schedule.next()!;

  assert.equal(second.unit.id, first.unit.id);
  assert.equal(second.occurrence, 1);
  assert.ok(second.scheduledAt > first.scheduledAt);
});
