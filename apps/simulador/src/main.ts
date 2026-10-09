#!/usr/bin/env node

import { helpText, loadConfig, parseArguments } from './config.js';
import { fetchUnits, selectUnits } from './units.js';

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.help) {
    console.log(helpText());
    return;
  }

  const config = loadConfig(process.argv.slice(2));
  const catalog = await fetchUnits(config.apiUrl, config.state);
  const selected = selectUnits(catalog, config);

  console.log(
    JSON.stringify(
      {
        sourceId: config.sourceId,
        seed: config.seed,
        intervalSeconds: config.intervalSeconds,
        units: selected,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Erro inesperado.';
  console.error(`Erro: ${message}`);
  process.exitCode = 1;
});
