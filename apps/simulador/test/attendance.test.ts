import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ATTENDANCE_PROFILE_CODES,
  activeSlots,
  dailyPeriod,
  initialStock,
  profileFor,
  stepAttendance,
  type AttendanceProfile,
  type AttendanceScenario,
  type AttendanceStock,
} from '../src/attendance.ts';
import { SimulationState } from '../src/simulation.ts';
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
const profile: AttendanceProfile = {
  code: 'medium',
  serviceSlots: 4,
  averageServiceMinutes: 20,
  arrivalsPerHour: 9,
};

function run(
  scenario: AttendanceScenario,
  steps: number,
  start: AttendanceStock = { waiting: 0, inService: 0 },
  stepSeconds = 120,
) {
  let stock = start;
  const history = [];
  for (let occurrence = 1; occurrence <= steps; occurrence += 1) {
    const result = stepAttendance(stock, {
      seed: 'demo-seed',
      unitCnes: unit.id,
      occurrence,
      stepSeconds,
      profile,
      scenario,
    });
    history.push({ before: stock, ...result });
    stock = result.stock;
  }
  return { stock, history };
}

test('conserva os estoques em cada passo e respeita a capacidade ativa', () => {
  for (const scenario of ['normal', 'demand-surge', 'capacity-reduction'] as const) {
    const { history } = run(scenario, 500);
    const slots = activeSlots(profile, scenario);
    for (const { before, stock, transitions } of history) {
      assert.equal(stock.waiting, before.waiting + transitions.arrivals - transitions.started);
      assert.equal(
        stock.inService,
        before.inService + transitions.started - transitions.completed,
      );
      assert.ok(transitions.completed <= before.inService);
      assert.ok(transitions.started <= before.waiting + transitions.arrivals);
      assert.ok(stock.waiting >= 0);
      assert.ok(stock.inService >= 0);
      assert.ok(stock.inService <= slots);
    }
  }
});

test('a espera cresce sem teto quando a demanda supera a capacidade', () => {
  const surge = run('demand-surge', 2_000);
  const reduced = run('capacity-reduction', 2_000);

  assert.ok(surge.stock.waiting > 100, `espera final ${surge.stock.waiting}`);
  assert.ok(reduced.stock.waiting > surge.stock.waiting);
});

test('a fila escoa quando a capacidade permite', () => {
  // Medium profile: 12 attendances per hour against 9 arrivals, so about 3 per
  // hour leave the queue; 3,000 steps of 2 minutes are 100 hours.
  const { stock } = run('normal', 3_000, { waiting: 200, inService: 4 });

  assert.ok(stock.waiting < 20, `espera final ${stock.waiting}`);
});

test('só inicia atendimentos de quem está esperando ou acabou de chegar', () => {
  const { history } = run('normal', 1, { waiting: 0, inService: 0 }, 1);

  assert.equal(history[0]!.transitions.completed, 0);
  assert.equal(history[0]!.transitions.started, history[0]!.transitions.arrivals);
});

test('começa dentro dos postos ativos de cada cenário', () => {
  for (let index = 0; index < 60; index += 1) {
    const cnes = String(1_000_000 + index);
    const cnesProfile = profileFor('demo-seed', cnes);
    const stock = initialStock('demo-seed', cnes, cnesProfile, 'capacity-reduction');
    assert.ok(stock.inService <= activeSlots(cnesProfile, 'capacity-reduction'));
  }

  const state = new SimulationState('demo-seed', {
    attendance: true,
    attendanceScenario: 'capacity-reduction',
  });
  const { attendance } = state.snapshotFor(unit, new Date());
  assert.ok(attendance!.inService <= attendance!.serviceSlots);
});

test('distribui os perfis sintéticos por CNES e seed', () => {
  const codes = new Set<string>();
  for (let index = 0; index < 60; index += 1) {
    const cnes = String(1_000_000 + index);
    assert.deepEqual(profileFor('demo-seed', cnes), profileFor('demo-seed', cnes));
    codes.add(profileFor('demo-seed', cnes).code);
    const stock = initialStock('demo-seed', cnes, profileFor('demo-seed', cnes));
    assert.ok(stock.inService <= profileFor('demo-seed', cnes).serviceSlots);
  }
  assert.deepEqual([...codes].sort(), [...ATTENDANCE_PROFILE_CODES].sort());
});

test('usa o dia de Brasília como período semiaberto', () => {
  assert.deepEqual(dailyPeriod(new Date('2026-10-23T02:59:59.999Z')), {
    start: '2026-10-22T00:00:00-03:00',
    end: '2026-10-23T00:00:00-03:00',
  });
  assert.deepEqual(dailyPeriod(new Date('2026-10-23T03:00:00.000Z')), {
    start: '2026-10-23T00:00:00-03:00',
    end: '2026-10-24T00:00:00-03:00',
  });
  assert.deepEqual(dailyPeriod(new Date('2026-12-31T23:00:00.000Z')), {
    start: '2026-12-31T00:00:00-03:00',
    end: '2027-01-01T00:00:00-03:00',
  });
});

test('mantém o snapshot v1 quando o atendimento está desligado', () => {
  const snapshot = new SimulationState('demo-seed').snapshotFor(unit, new Date());

  assert.equal(snapshot.type, 'occupancy.snapshot.v1');
  assert.equal('attendance' in snapshot, false);
});

test('acumula concluídos no período e zera na virada do dia', () => {
  const state = new SimulationState('demo-seed', { attendance: true, stepSeconds: 600 });
  const start = Date.parse('2026-10-23T00:00:00.000Z');
  let previous = state.snapshotFor(unit, new Date(start));
  let total = 0;

  assert.equal(previous.type, 'occupancy.snapshot.v2');
  assert.equal(previous.attendance!.serviceSlots, profileFor('demo-seed', unit.id).serviceSlots);
  assert.equal(previous.attendance!.completed.count, 0);
  for (let occurrence = 1; occurrence <= 30; occurrence += 1) {
    state.advanceUnit(unit, occurrence);
    const snapshot = state.snapshotFor(unit, new Date(start + occurrence * 600_000));
    const completed = snapshot.attendance!.completed;
    if (completed.periodStart === previous.attendance!.completed.periodStart) {
      assert.ok(completed.count >= previous.attendance!.completed.count);
    } else {
      assert.equal(completed.periodStart, '2026-10-23T00:00:00-03:00');
      assert.ok(completed.count <= snapshot.attendance!.inService + total);
    }
    total = completed.count;
    previous = snapshot;
  }
  assert.equal(previous.attendance!.completed.periodEnd, '2026-10-24T00:00:00-03:00');
});

test('reenviar o mesmo snapshot não altera o total concluído', () => {
  const state = new SimulationState('demo-seed', { attendance: true });
  const now = new Date('2026-10-23T15:00:00.000Z');
  state.snapshotFor(unit, now);
  for (let occurrence = 1; occurrence <= 20; occurrence += 1) {
    state.advanceUnit(unit, occurrence);
  }

  const first = state.snapshotFor(unit, now);
  const again = state.snapshotFor(unit, now);
  assert.equal(again.attendance!.completed.count, first.attendance!.completed.count);
  assert.deepEqual(again.attendance, first.attendance);
});

test('reinício com a mesma seed reproduz a mesma sequência', () => {
  const sequence = () => {
    const state = new SimulationState('demo-seed', {
      attendance: true,
      attendanceScenario: 'demand-surge',
    });
    const values = [];
    for (let occurrence = 0; occurrence < 50; occurrence += 1) {
      if (occurrence > 0) state.advanceUnit(unit, occurrence);
      values.push(
        state.snapshotFor(unit, new Date(Date.UTC(2026, 9, 23, 12, occurrence))).attendance,
      );
    }
    return values;
  };

  assert.deepEqual(sequence(), sequence());
});

test('o fluxo não altera os leitos gerados pela mesma seed', () => {
  const beds = new SimulationState('demo-seed');
  const withAttendance = new SimulationState('demo-seed', { attendance: true });
  const now = new Date('2026-10-23T15:00:00.000Z');
  for (let occurrence = 1; occurrence <= 10; occurrence += 1) {
    beds.advanceUnit(unit, occurrence);
    withAttendance.advanceUnit(unit, occurrence);
  }

  assert.deepEqual(
    withAttendance.snapshotFor(unit, now).categories,
    beds.snapshotFor(unit, now).categories,
  );
});
