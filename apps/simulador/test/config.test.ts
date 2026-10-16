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

test('lê o segredo e a amostra da mesma configuração da API', () => {
  const config = loadConfig([], {
    WEBHOOK_SOURCE_CONFIG: JSON.stringify({
      'occupancy-feed': {
        secret: 'shared-secret-with-at-least-32-chars',
        unitCnes: ['7654321', '1234567'],
      },
    }),
  });

  assert.equal(config.sourceSecret, 'shared-secret-with-at-least-32-chars');
  assert.deepEqual(config.unitCnes, ['1234567', '7654321']);
});

test('prefere o segredo e o critério informados explicitamente', () => {
  const config = loadConfig(['--city', 'Santos'], {
    SIMULATOR_SOURCE_SECRET: 'explicit-secret',
    WEBHOOK_SOURCE_CONFIG: JSON.stringify({
      'occupancy-feed': { secret: 'shared', unitCnes: ['1234567'] },
    }),
  });

  assert.equal(config.sourceSecret, 'explicit-secret');
  assert.deepEqual(config.unitCnes, []);
});

test('rejeita WEBHOOK_SOURCE_CONFIG que não é JSON', () => {
  assert.throws(
    () => loadConfig([], { WEBHOOK_SOURCE_CONFIG: '{' }),
    /WEBHOOK_SOURCE_CONFIG deve conter JSON válido/,
  );
});

test('segue o site só quando pedido explicitamente', () => {
  assert.equal(loadConfig(['--city', 'Santos'], {}).followSite, false);
  assert.equal(
    loadConfig(['--city', 'Santos'], { SIMULATOR_FOLLOW_SITE: 'true' }).followSite,
    true,
  );
});
