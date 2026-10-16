#!/usr/bin/env node

import { helpText, loadConfig, parseArguments } from './config.ts';
import { SimulationState } from './simulation.ts';
import { SimulationRunner } from './runner.ts';
import { fetchSiteScenario } from './control.ts';
import { fetchUnits, selectUnits } from './units.ts';

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (arguments_.help) {
    console.log(helpText());
    return;
  }

  const config = loadConfig(process.argv.slice(2));
  const catalog = await fetchUnits(config.apiUrl, config.state);
  let selectionConfig = config;
  if (config.sampleFromSource) {
    const known = new Set(catalog.map((unit) => unit.id));
    const missing = config.unitCnes.filter((code) => !known.has(code));
    if (missing.length > 0) {
      console.warn(
        `CNES autorizados que não estão no catálogo e ficam fora da simulação: ${missing.join(', ')}.`,
      );
    }
    const present = config.unitCnes.filter((code) => known.has(code));
    if (present.length === 0) {
      throw new Error('Nenhum CNES autorizado para a fonte está no catálogo.');
    }
    selectionConfig = { ...config, unitCnes: present, maxUnits: present.length };
  }
  const selected = selectUnits(catalog, selectionConfig);
  const state = new SimulationState(config.seed);
  const selectedCnes = new Set(selected.map((unit) => unit.id));
  for (const override of config.occupancyOverrides) {
    if (!selectedCnes.has(override.unitCnes)) {
      throw new Error(
        `O CNES ${override.unitCnes} do cenário não está entre as unidades selecionadas.`,
      );
    }
    state.setOccupied(override.unitCnes, override.category, override.occupied);
  }
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
        scenario: config.scenario,
        followSite: config.followSite,
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
    readScenario: config.followSite
      ? (signal) => fetchSiteScenario(config.apiUrl, signal)
      : undefined,
    onScenarioChanged: (scenario) => {
      console.log(`Cenário escolhido no site: ${scenario}`);
    },
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
