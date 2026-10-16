import { SIMULATION_SCENARIOS, type SimulationScenario } from './config.ts';

const CONTROL_PATH = '/occupancy/simulation';
const CONTROL_TIMEOUT_MS = 5_000;

/**
 * The scenario chosen on the site. `null` when the API has the demonstration
 * off (404) or answers something this simulator does not know.
 */
export async function fetchSiteScenario(
  apiUrl: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<SimulationScenario | null> {
  const timeout = AbortSignal.timeout(CONTROL_TIMEOUT_MS);
  const response = await fetchImpl(new URL(CONTROL_PATH, apiUrl), {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`A API não retornou o cenário (${response.status}).`);
  }
  const body = (await response.json()) as { data?: { scenario?: unknown } };
  const scenario = body.data?.scenario;
  return SIMULATION_SCENARIOS.includes(scenario as SimulationScenario)
    ? (scenario as SimulationScenario)
    : null;
}
