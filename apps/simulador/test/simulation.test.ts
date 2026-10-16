import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SIMULATION_CATEGORY_CODES,
  SimulationState,
} from '../src/simulation.ts';
import type { SimulatorUnit } from '../src/units.ts';

const unit: SimulatorUnit = {
  id: '1234567',
  name: 'Unidade Central',
  municipalityCode: '3550308',
  city: 'São Paulo',
  state: 'SP',
  latitude: -23.55,
  longitude: -46.63,
};
const now = new Date('2026-10-15T12:00:00.000Z');

test('gera snapshots reproduzíveis para o mesmo seed e instante', () => {
  const first = new SimulationState('demo-seed').snapshotFor(unit, now);
  const second = new SimulationState('demo-seed').snapshotFor(unit, now);

  assert.deepEqual(first, second);
  assert.match(first.eventId, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.equal(first.type, 'occupancy.snapshot.v1');
  assert.equal(first.unitCnes, unit.id);
  assert.deepEqual(
    first.categories.map((category) => category.code),
    SIMULATION_CATEGORY_CODES,
  );
  for (const category of first.categories) {
    assert.ok(category.capacity > 0);
    assert.ok(category.occupied >= 0);
    assert.ok(category.occupied <= category.capacity);
  }
});

test('mantém estado independente por unidade e permite ajuste manual', () => {
  const state = new SimulationState('demo-seed');
  const otherUnit = { ...unit, id: '7654321' };
  const original = state.snapshotFor(unit, now);
  state.setOccupied(unit.id, 'observation', 0);

  const changed = state.snapshotFor(unit, now);
  const other = state.snapshotFor(otherUnit, now);
  assert.equal(changed.categories[0].occupied, 0);
  assert.notDeepEqual(changed.categories, original.categories);
  assert.notDeepEqual(other.categories, changed.categories);
});

test('evolui a ocupação de forma determinística e limitada à capacidade', () => {
  const first = new SimulationState('demo-seed');
  const second = new SimulationState('demo-seed');

  first.snapshotFor(unit, now);
  second.snapshotFor(unit, now);
  first.advance([unit], 1);
  second.advance([unit], 1);

  assert.deepEqual(
    first.snapshotFor(unit, now).categories,
    second.snapshotFor(unit, now).categories,
  );
  assert.throws(() => first.advance([unit], -1), /inteiro não negativo/);
});

test('gera eventId diferente para snapshots sucessivos', () => {
  const state = new SimulationState('demo-seed');
  const first = state.snapshotFor(unit, now);
  const second = state.snapshotFor(unit, now);

  assert.notEqual(first.eventId, second.eventId);
});

test('rejeita ocupação acima da capacidade', () => {
  const state = new SimulationState('demo-seed');
  const snapshot = state.snapshotFor(unit, now);
  const capacity = snapshot.categories[0].capacity;

  assert.throws(
    () => state.setOccupied(unit.id, 'observation', capacity + 1),
    /não pode ser maior que capacity/,
  );
});
