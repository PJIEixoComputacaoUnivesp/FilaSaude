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
