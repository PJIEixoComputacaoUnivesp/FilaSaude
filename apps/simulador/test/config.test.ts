import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, parseArguments } from '../src/config.ts';

test('lê configuração por argumentos e aplica valores padrão', () => {
  const config = loadConfig([
    '--city',
    'São Paulo',
    '--unit-cnes',
    '7654321,1234567,7654321',
  ], {});

  assert.equal(config.city, 'São Paulo');
  assert.deepEqual(config.unitCnes, ['1234567', '7654321']);
  assert.equal(config.radiusKm, 25);
  assert.equal(config.maxUnits, 10);
  assert.equal(config.intervalSeconds, 120);
  assert.deepEqual(config.sourceIds, ['occupancy-feed']);
  assert.equal(config.nationalEventScenario, 'normal');
});

test('configura o cenário nacional com proteção e limites padrão', () => {
  const config = loadConfig(
    ['--scenario', 'national', '--allow-load-test', '--source-ids', 'feed-a,feed-b'],
    {},
  );

  assert.equal(config.scenario, 'national');
  assert.equal(config.maxUnits, Number.MAX_SAFE_INTEGER);
  assert.equal(config.durationSeconds, 300);
  assert.equal(config.concurrency, 10);
  assert.deepEqual(config.sourceIds, ['feed-a', 'feed-b']);
});

test('configura o comportamento dos eventos no cenário nacional', () => {
  const config = loadConfig(
    [
      '--scenario',
      'national',
      '--national-event-scenario',
      'delayed',
      '--delay-seconds',
      '600',
      '--allow-load-test',
    ],
    {},
  );

  assert.equal(config.nationalEventScenario, 'delayed');
  assert.equal(config.delaySeconds, 600);
});

test('exige autorização para o cenário nacional', () => {
  assert.throws(
    () => loadConfig(['--scenario', 'national'], {}),
    /allow-load-test/,
  );
});

test('aceita duração zero somente para execução nacional contínua', () => {
  const config = loadConfig(
    ['--scenario', 'national', '--allow-load-test', '--duration-seconds', '0'],
    {},
  );

  assert.equal(config.durationSeconds, 0);
  assert.throws(
    () => loadConfig(['--duration-seconds', '0'], {}),
    /scenario national/,
  );
});

test('rejeita coordenadas incompletas', () => {
  assert.throws(
    () => loadConfig(['--latitude', '-23.5'], {}),
    /latitude e longitude devem ser informadas juntas/,
  );
});

test('rejeita CNES com formato inválido', () => {
  assert.throws(
    () => loadConfig(['--unit-cnes', '123'], {}),
    /códigos CNES com sete dígitos/,
  );
});

test('reconhece a opção de ajuda sem exigir valores', () => {
  assert.deepEqual(parseArguments(['--help']), { values: {}, help: true });
});

test('compartilha os segredos de cada fonte com a API sem limitar o catálogo nacional', () => {
  const config = loadConfig(['--scenario', 'national', '--allow-load-test'], {
    SIMULATOR_SOURCE_IDS: 'feed-a,feed-b',
    WEBHOOK_SOURCE_CONFIG: JSON.stringify({
      'feed-a': { secret: 'a'.repeat(32), unitCnes: ['1111111'] },
      'feed-b': { secret: 'b'.repeat(32), unitCnes: ['2222222'] },
    }),
  });
  assert.deepEqual(config.sourceSecrets, {
    'feed-a': 'a'.repeat(32),
    'feed-b': 'b'.repeat(32),
  });
  assert.deepEqual(config.unitCnes, []);
  assert.equal(config.maxUnits, Number.MAX_SAFE_INTEGER);
});

test('rejeita configuração compartilhada inválida ou fonte sem segredo', () => {
  for (const raw of [
    '{',
    'null',
    '[]',
    '{}',
    JSON.stringify({ 'occupancy-feed': { secret: 'short' } }),
  ]) {
    assert.throws(
      () => loadConfig([], { WEBHOOK_SOURCE_CONFIG: raw }),
      /WEBHOOK_SOURCE_CONFIG/,
    );
  }
});

test('preserva o segredo explícito como substituição para testes locais', () => {
  const config = loadConfig([], {
    SIMULATOR_SOURCE_SECRET: 'explicit-local-secret',
    WEBHOOK_SOURCE_CONFIG: JSON.stringify({
      'occupancy-feed': { secret: 'a'.repeat(32) },
    }),
  });
  assert.equal(config.sourceSecret, 'explicit-local-secret');
  assert.equal(
    config.sourceSecrets?.['occupancy-feed'],
    'explicit-local-secret',
  );
});

test('configura o fluxo de atendimento sintético', () => {
  const disabled = loadConfig([], {});
  assert.equal(disabled.attendance, false);
  assert.equal(disabled.attendanceScenario, 'normal');

  const config = loadConfig(['--attendance', '--attendance-scenario', 'capacity-reduction'], {});
  assert.equal(config.attendance, true);
  assert.equal(config.attendanceScenario, 'capacity-reduction');

  const fromEnvironment = loadConfig([], {
    SIMULATOR_ATTENDANCE: 'true',
    SIMULATOR_ATTENDANCE_SCENARIO: 'demand-surge',
  });
  assert.equal(fromEnvironment.attendance, true);
  assert.equal(fromEnvironment.attendanceScenario, 'demand-surge');

  assert.throws(
    () => loadConfig(['--attendance-scenario', 'triage'], {}),
    /attendance-scenario deve ser/,
  );
});
