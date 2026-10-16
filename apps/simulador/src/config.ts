import {
  SIMULATION_CATEGORY_CODES,
  type SimulationCategoryCode,
} from './simulation.ts';

export interface OccupancyOverride {
  unitCnes: string;
  category: SimulationCategoryCode;
  occupied: number;
}

export const SIMULATION_SCENARIOS = [
  'normal',
  'duplicate',
  'delayed',
  'showcase',
  'surge',
  'outage',
  'replay',
] as const;
export type SimulationScenario = (typeof SIMULATION_SCENARIOS)[number];

export interface SimulatorConfig {
  apiUrl: string;
  sourceId: string;
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
  delaySeconds: number;
  /** Follows the scenario chosen on the site (GET /occupancy/simulation). */
  followSite: boolean;
}

export interface ParsedArguments {
  values: Record<string, string>;
  help: boolean;
}

const DEFAULT_API_URL = 'http://localhost:3000';
const DEFAULT_RADIUS_KM = 25;
const DEFAULT_MAX_UNITS = 10;
const DEFAULT_INTERVAL_SECONDS = 120;

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

interface SharedSource {
  secret: string;
  unitCnes: string[];
}

/**
 * The API authorizes each source by WEBHOOK_SOURCE_CONFIG. When the simulator
 * runs next to it (Compose, deploy), it reads the same variable, so the secret
 * and the authorized CNES list have a single place to be kept.
 */
function readSharedSource(
  rawConfig: string | undefined,
  sourceId: string,
): SharedSource | null {
  if (!rawConfig) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    throw new Error('WEBHOOK_SOURCE_CONFIG deve conter JSON válido.');
  }
  const source =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)[sourceId]
      : undefined;
  if (typeof source !== 'object' || source === null) return null;

  const { secret, unitCnes } = source as Record<string, unknown>;
  return {
    secret: typeof secret === 'string' ? secret : '',
    unitCnes: Array.isArray(unitCnes)
      ? readUnitCnes(unitCnes.filter((code) => typeof code === 'string').join(','))
      : [],
  };
}

function readNonNegativeNumber(value: string | undefined, name: string): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} deve ser um inteiro não negativo.`);
  }
  return parsed;
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

  const radiusKm =
    readPositiveNumber(value('radius-km', 'SIMULATOR_RADIUS_KM', String(DEFAULT_RADIUS_KM)), 'radius-km') ??
    DEFAULT_RADIUS_KM;
  const maxUnits =
    readPositiveNumber(value('max-units', 'SIMULATOR_MAX_UNITS', String(DEFAULT_MAX_UNITS)), 'max-units', true) ??
    DEFAULT_MAX_UNITS;
  const intervalSeconds =
    readPositiveNumber(
      value('interval-seconds', 'SIMULATOR_INTERVAL_SECONDS', String(DEFAULT_INTERVAL_SECONDS)),
      'interval-seconds',
      true,
    ) ?? DEFAULT_INTERVAL_SECONDS;
  const latitude = readCoordinate(value('latitude', 'SIMULATOR_LATITUDE'), 'latitude');
  const longitude = readCoordinate(value('longitude', 'SIMULATOR_LONGITUDE'), 'longitude');
  const scenario = readScenario(value('scenario', 'SIMULATOR_SCENARIO'));
  const delaySeconds = readNonNegativeNumber(
    value('delay-seconds', 'SIMULATOR_DELAY_SECONDS'),
    'delay-seconds',
  );

  if ((latitude === null) !== (longitude === null)) {
    throw new Error('latitude e longitude devem ser informadas juntas.');
  }
  if (scenario === 'delayed' && delaySeconds === 0) {
    throw new Error('scenario delayed exige --delay-seconds maior que zero.');
  }

  const sourceId = value('source-id', 'SIMULATOR_SOURCE_ID', 'occupancy-feed')!;
  const sharedSource = readSharedSource(environment.WEBHOOK_SOURCE_CONFIG, sourceId);
  const municipalityCode = value('municipality-code', 'SIMULATOR_MUNICIPALITY_CODE') ?? null;
  const city = value('city', 'SIMULATOR_CITY') ?? null;
  let unitCnes = readUnitCnes(value('unit-cnes', 'SIMULATOR_UNIT_CNES'));
  // Without another criterion, the sample is every unit the source may update.
  if (unitCnes.length === 0 && !municipalityCode && !city && latitude === null) {
    unitCnes = sharedSource?.unitCnes ?? [];
  }

  return {
    apiUrl: value('api-url', 'SIMULATOR_API_URL', DEFAULT_API_URL)!,
    sourceId,
    sourceSecret: environment.SIMULATOR_SOURCE_SECRET || sharedSource?.secret || null,
    state: value('state', 'SIMULATOR_STATE')?.toUpperCase() ?? null,
    municipalityCode,
    city,
    latitude,
    longitude,
    radiusKm,
    maxUnits,
    unitCnes,
    seed: value('seed', 'SIMULATOR_SEED', 'fila-saude-v1')!,
    intervalSeconds,
    occupancyOverrides: readOccupancyOverrides(
      value('set-occupied', 'SIMULATOR_SET_OCCUPIED'),
    ),
    scenario,
    delaySeconds,
    followSite: value('follow-site', 'SIMULATOR_FOLLOW_SITE') === 'true',
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
  --max-units NUMBER         Limite de unidades (padrão: 10)
  --unit-cnes CODES          CNES separados por vírgula
  --source-id ID             Identificador da fonte simuladora
  --seed VALUE               Seed do cenário (padrão: fila-saude-v1)
  --interval-seconds NUMBER  Intervalo entre ciclos (padrão: 120)
  --set-occupied VALUES      Ocupações iniciais CNES:CATEGORIA:VALOR
  --scenario NAME            Cenário: normal, duplicate, delayed, showcase,
                             surge, outage ou replay
  --follow-site true         Segue o cenário escolhido no site
  --delay-seconds NUMBER     Atraso dos timestamps no cenário delayed
  --help                     Exibe esta ajuda

As opções também podem ser informadas pelas variáveis SIMULATOR_* equivalentes.
Sem SIMULATOR_SOURCE_SECRET, o segredo vem de WEBHOOK_SOURCE_CONFIG (o mesmo
JSON da API); sem critério de seleção, a amostra são os CNES autorizados nele.
`;
}
