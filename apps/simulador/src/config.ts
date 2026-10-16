import {
  SIMULATION_CATEGORY_CODES,
  type SimulationCategoryCode,
} from './simulation.ts';

export interface OccupancyOverride {
  unitCnes: string;
  category: SimulationCategoryCode;
  occupied: number;
}

export const SIMULATION_SCENARIOS = ['normal', 'duplicate', 'delayed', 'national'] as const;
export type SimulationScenario = (typeof SIMULATION_SCENARIOS)[number];
export const NATIONAL_EVENT_SCENARIOS = ['normal', 'duplicate', 'delayed'] as const;
export type NationalEventScenario = (typeof NATIONAL_EVENT_SCENARIOS)[number];

export interface SimulatorConfig {
  apiUrl: string;
  sourceId: string;
  sourceIds: string[];
  sourceSecret: string | null;
  state: string | null;
  municipalityCode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  maxUnits: number;
  unitCnes: string[];
  seed: string;
  intervalSeconds: number;
  occupancyOverrides: OccupancyOverride[];
  scenario: SimulationScenario;
  nationalEventScenario: NationalEventScenario;
  delaySeconds: number;
  durationSeconds: number;
  concurrency: number;
  reportIntervalSeconds: number;
  allowLoadTest: boolean;
  allowNonlocalTarget: boolean;
}

export interface ParsedArguments {
  values: Record<string, string>;
  help: boolean;
}

const DEFAULT_API_URL = 'http://localhost:3000';
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_MAX_UNITS = 10;
const DEFAULT_INTERVAL_SECONDS = 120;
const DEFAULT_NATIONAL_DURATION_SECONDS = 300;
const DEFAULT_NATIONAL_CONCURRENCY = 10;
const DEFAULT_REPORT_INTERVAL_SECONDS = 10;
const BOOLEAN_ARGUMENTS = new Set(['allow-load-test', 'allow-nonlocal-target']);

function readPositiveNumber(
  value: string | undefined,
  name: string,
  integer = false,
): number | null {
  if (value === undefined) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${name} deve ser um número positivo${integer ? ' inteiro' : ''}.`);
  }
  return parsed;
}

function readCoordinate(value: string | undefined, name: string): number | null {
  if (value === undefined) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} deve ser numérica.`);
  return parsed;
}

function readUnitCnes(value: string | undefined): string[] {
  if (!value) return [];

  const codes = [...new Set(value.split(',').map((code) => code.trim()).filter(Boolean))];
  if (codes.some((code) => !/^\d{7}$/.test(code))) {
    throw new Error('unit-cnes deve conter somente códigos CNES com sete dígitos.');
  }
  return codes.sort();
}

function readOccupancyOverrides(value: string | undefined): OccupancyOverride[] {
  if (!value) return [];

  return value.split(',').map((entry) => {
    const [unitCnes, category, occupiedValue, ...extra] = entry.trim().split(':');
    if (
      extra.length > 0 ||
      !/^\d{7}$/.test(unitCnes ?? '') ||
      !SIMULATION_CATEGORY_CODES.includes(category as SimulationCategoryCode)
    ) {
      throw new Error(
        'set-occupied deve usar CNES:CATEGORIA:OCUPAÇÃO, com categoria válida.',
      );
    }

    const occupied = Number(occupiedValue);
    if (!Number.isSafeInteger(occupied) || occupied < 0) {
      throw new Error('A ocupação inicial deve ser um inteiro não negativo.');
    }

    return {
      unitCnes,
      category: category as SimulationCategoryCode,
      occupied,
    };
  });
}

function readScenario(value: string | undefined): SimulationScenario {
  if (!value) return 'normal';
  if (!SIMULATION_SCENARIOS.includes(value as SimulationScenario)) {
    throw new Error(`scenario deve ser um destes valores: ${SIMULATION_SCENARIOS.join(', ')}.`);
  }
  return value as SimulationScenario;
}

function readNationalEventScenario(value: string | undefined): NationalEventScenario {
  if (!value) return 'normal';
  if (!NATIONAL_EVENT_SCENARIOS.includes(value as NationalEventScenario)) {
    throw new Error(
      `national-event-scenario deve ser um destes valores: ${NATIONAL_EVENT_SCENARIOS.join(', ')}.`,
    );
  }
  return value as NationalEventScenario;
}

function readNonNegativeNumber(value: string | undefined, name: string): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} deve ser um inteiro não negativo.`);
  }
  return parsed;
}

function readBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function readSourceIds(value: string | undefined, sourceId: string): string[] {
  if (!value) return [sourceId];
  const sourceIds = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  if (sourceIds.length === 0) throw new Error('source-ids deve conter ao menos uma fonte.');
  return sourceIds;
}

function validateNationalTarget(
  scenario: SimulationScenario,
  apiUrl: string,
  allowLoadTest: boolean,
  allowNonlocalTarget: boolean,
): void {
  if (scenario !== 'national') return;
  if (!allowLoadTest) throw new Error('scenario national exige --allow-load-test.');

  const hostname = new URL(apiUrl).hostname.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  if (!localHosts.has(hostname) && !allowNonlocalTarget) {
    throw new Error(
      'scenario national exige um destino local ou --allow-nonlocal-target.',
    );
  }
}

export function parseArguments(argv: readonly string[]): ParsedArguments {
  const values: Record<string, string> = {};
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }

    const name = argument.slice(2);
    if (BOOLEAN_ARGUMENTS.has(name)) {
      values[name] = 'true';
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`O argumento --${name} exige um valor.`);
    }
    values[name] = value;
    index += 1;
  }

  return { values, help };
}

export function loadConfig(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): SimulatorConfig {
  const parsed = parseArguments(argv);
  const value = (name: string, environmentName: string, fallback?: string) =>
    parsed.values[name] ?? environment[environmentName] ?? fallback;

  const scenario = readScenario(value('scenario', 'SIMULATOR_SCENARIO'));
  const nationalEventScenario = readNationalEventScenario(
    value('national-event-scenario', 'SIMULATOR_NATIONAL_EVENT_SCENARIO'),
  );
  const apiUrl = value('api-url', 'SIMULATOR_API_URL', DEFAULT_API_URL)!;
  const sourceId = value('source-id', 'SIMULATOR_SOURCE_ID', 'occupancy-feed')!;
  const allowLoadTest = readBoolean(value('allow-load-test', 'SIMULATOR_ALLOW_LOAD_TEST'));
  const allowNonlocalTarget = readBoolean(
    value('allow-nonlocal-target', 'SIMULATOR_ALLOW_NONLOCAL_TARGET'),
  );
  validateNationalTarget(scenario, apiUrl, allowLoadTest, allowNonlocalTarget);

  const radiusKm =
    readPositiveNumber(value('radius-km', 'SIMULATOR_RADIUS_KM', String(DEFAULT_RADIUS_KM)), 'radius-km') ??
    DEFAULT_RADIUS_KM;
  const maxUnits =
    readPositiveNumber(
      value(
        'max-units',
        'SIMULATOR_MAX_UNITS',
        scenario === 'national' ? String(Number.MAX_SAFE_INTEGER) : String(DEFAULT_MAX_UNITS),
      ),
      'max-units',
      true,
    ) ?? (scenario === 'national' ? Number.MAX_SAFE_INTEGER : DEFAULT_MAX_UNITS);
  const intervalSeconds =
    readPositiveNumber(
      value('interval-seconds', 'SIMULATOR_INTERVAL_SECONDS', String(DEFAULT_INTERVAL_SECONDS)),
      'interval-seconds',
      true,
    ) ?? DEFAULT_INTERVAL_SECONDS;
  const latitude = readCoordinate(value('latitude', 'SIMULATOR_LATITUDE'), 'latitude');
  const longitude = readCoordinate(value('longitude', 'SIMULATOR_LONGITUDE'), 'longitude');
  const delaySeconds = readNonNegativeNumber(
    value('delay-seconds', 'SIMULATOR_DELAY_SECONDS'),
    'delay-seconds',
  );

  if ((latitude === null) !== (longitude === null)) {
    throw new Error('latitude e longitude devem ser informadas juntas.');
  }
  if ((scenario === 'delayed' || nationalEventScenario === 'delayed') && delaySeconds === 0) {
    throw new Error('scenario delayed exige --delay-seconds maior que zero.');
  }

  return {
    apiUrl,
    sourceId,
    sourceIds: readSourceIds(value('source-ids', 'SIMULATOR_SOURCE_IDS'), sourceId),
    sourceSecret: environment.SIMULATOR_SOURCE_SECRET ?? null,
    state: value('state', 'SIMULATOR_STATE')?.toUpperCase() ?? null,
    municipalityCode: value('municipality-code', 'SIMULATOR_MUNICIPALITY_CODE') ?? null,
    city: value('city', 'SIMULATOR_CITY') ?? null,
    latitude,
    longitude,
    radiusKm,
    maxUnits,
    unitCnes: readUnitCnes(value('unit-cnes', 'SIMULATOR_UNIT_CNES')),
    seed: value('seed', 'SIMULATOR_SEED', 'fila-saude-v1')!,
    intervalSeconds,
    occupancyOverrides: readOccupancyOverrides(
      value('set-occupied', 'SIMULATOR_SET_OCCUPIED'),
    ),
    scenario,
    nationalEventScenario,
    delaySeconds,
    durationSeconds:
      readPositiveNumber(
        value(
          'duration-seconds',
          'SIMULATOR_DURATION_SECONDS',
          String(DEFAULT_NATIONAL_DURATION_SECONDS),
        ),
        'duration-seconds',
        true,
      ) ?? DEFAULT_NATIONAL_DURATION_SECONDS,
    concurrency:
      readPositiveNumber(
        value('concurrency', 'SIMULATOR_CONCURRENCY', String(DEFAULT_NATIONAL_CONCURRENCY)),
        'concurrency',
        true,
      ) ?? DEFAULT_NATIONAL_CONCURRENCY,
    reportIntervalSeconds:
      readPositiveNumber(
        value(
          'report-interval-seconds',
          'SIMULATOR_REPORT_INTERVAL_SECONDS',
          String(DEFAULT_REPORT_INTERVAL_SECONDS),
        ),
        'report-interval-seconds',
        true,
      ) ?? DEFAULT_REPORT_INTERVAL_SECONDS,
    allowLoadTest,
    allowNonlocalTarget,
  };
}

export function helpText(): string {
  return `Uso: filasaude-simulador [opções]

Opções:
  --api-url URL              URL base da API (padrão: http://localhost:3000)
  --state UF                 Estado usado para carregar o catálogo
  --municipality-code CODE   Código IBGE do município
  --city NAME                Nome do município
  --latitude NUMBER          Latitude do ponto de referência
  --longitude NUMBER         Longitude do ponto de referência
  --radius-km NUMBER         Raio de seleção em quilômetros (padrão: 25)
  --max-units NUMBER         Limite de unidades (padrão: 10; national: todas)
  --unit-cnes CODES          CNES separados por vírgula
  --source-id ID             Identificador da fonte simuladora
  --seed VALUE               Seed do cenário (padrão: fila-saude-v1)
  --interval-seconds NUMBER  Intervalo entre ciclos (padrão: 120)
  --set-occupied VALUES      Ocupações iniciais CNES:CATEGORIA:VALOR
  --scenario NAME            Cenário: normal, duplicate, delayed ou national
  --national-event-scenario  Comportamento dos eventos national: normal, duplicate ou delayed
  --delay-seconds NUMBER     Atraso dos timestamps no cenário delayed
  --source-ids IDS           Fontes sintéticas separadas por vírgula
  --duration-seconds NUMBER  Duração do cenário national (padrão: 300)
  --concurrency NUMBER       Envios simultâneos máximos (padrão: 10)
  --report-interval-seconds  Intervalo dos relatórios (padrão: 10)
  --allow-load-test          Autoriza o cenário national
  --allow-nonlocal-target    Permite destino não local em ambiente controlado
  --help                     Exibe esta ajuda

As opções também podem ser informadas pelas variáveis SIMULATOR_* equivalentes.
`;
}
