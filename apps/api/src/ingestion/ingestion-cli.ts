import {
  brazilianStates,
  NationalStateCode,
  parseState,
  type BrazilianState,
} from '../units/states.js';

export interface IngestionArguments {
  help: boolean;
  states: BrazilianState[];
}

export function ingestionHelp(): string {
  return `Uso: pnpm --filter @filasaude/api ingest:units -- [--state UF]

Coleta e normaliza unidades de urgência do CNES no PostgreSQL.
Sem --state, processa as 27 UFs. Use --state SP para reprocessar uma única UF.`;
}

export function parseIngestionArguments(
  argv: readonly string[],
): IngestionArguments {
  let stateValue: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') {
      return { help: true, states: [] };
    }
    if (argument.startsWith('--state=')) {
      stateValue = argument.slice('--state='.length);
      continue;
    }
    if (argument === '--state') {
      stateValue = argv[++index];
      if (!stateValue) throw new Error('--state precisa de uma UF');
      continue;
    }
    throw new Error(`Argumento desconhecido: ${argument}`);
  }

  if (!stateValue) return { help: false, states: brazilianStates() };
  const state = parseState(stateValue);
  return {
    help: false,
    states:
      state.abbreviation === NationalStateCode.Brazil
        ? brazilianStates()
        : [state],
  };
}
