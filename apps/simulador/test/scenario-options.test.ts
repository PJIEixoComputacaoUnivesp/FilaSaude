import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.ts';

test('aceita cenários duplicate e delayed', () => {
  assert.equal(loadConfig(['--scenario', 'duplicate'], {}).scenario, 'duplicate');
  const config = loadConfig(
    ['--scenario', 'delayed', '--delay-seconds', '600'],
    {},
  );
  assert.equal(config.scenario, 'delayed');
  assert.equal(config.delaySeconds, 600);
});

test('exige atraso no cenário delayed', () => {
  assert.throws(
    () => loadConfig(['--scenario', 'delayed'], {}),
    /scenario delayed exige/,
  );
});
