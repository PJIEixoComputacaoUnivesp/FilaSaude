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
