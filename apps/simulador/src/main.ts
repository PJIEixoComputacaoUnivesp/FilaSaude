#!/usr/bin/env node

import { helpText, loadConfig, parseArguments } from './config.ts';
import { SimulationState } from './simulation.ts';
import { SimulationRunner } from './runner.ts';
import { fetchUnits, selectUnits } from './units.ts';

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.help) {
    console.log(helpText());
    return;
  }

  const config = loadConfig(process.argv.slice(2));
  const catalog = await fetchUnits(config.apiUrl, config.state);
  const selected = selectUnits(catalog, config);
  const state = new SimulationState(config.seed);
  const controller = new AbortController();

  const stop = () => {
    if (controller.signal.aborted) return;
    console.log('Encerrando o simulador...');
    controller.abort();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  console.log(
    JSON.stringify(
      {
        sourceId: config.sourceId,
        seed: config.seed,
        intervalSeconds: config.intervalSeconds,
        units: selected.map(({ id, name, municipalityCode, city, state: unitState }) => ({
          id,
          name,
          municipalityCode,
          city,
          state: unitState,
        })),
      },
      null,
      2,
    ),
  );

  const runner = new SimulationRunner(config, selected, state, {
    onSnapshotSent: (snapshot, result) => {
      console.log(
        `Snapshot simulado enviado: unidade=${snapshot.unitCnes} ` +
          `evento=${snapshot.eventId} tentativas=${result.attempts} status=${result.status}`,
      );
    },
  });
  await runner.run(controller.signal);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Erro inesperado.';
  console.error(`Erro: ${message}`);
  process.exitCode = 1;
});
