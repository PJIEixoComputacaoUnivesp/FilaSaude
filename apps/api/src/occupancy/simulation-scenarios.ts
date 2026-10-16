/**
 * Scenarios the site can ask the simulator to play. The ids are the contract
 * with the simulator (apps/simulador/src/scenarios.ts); the texts are shown
 * on the site as they are.
 */
export const SIMULATION_SCENARIOS = [
  {
    id: 'showcase',
    label: 'Demonstração completa',
    description:
      'Mostra ao mesmo tempo as faixas baixa, moderada e alta, uma unidade que para de confirmar e volta, eventos repetidos e atrasados.',
  },
  {
    id: 'normal',
    label: 'Variação normal',
    description:
      'Cada unidade varia um pouco a cada envio, sem forçar nenhuma faixa.',
  },
  {
    id: 'surge',
    label: 'Pico de ocupação',
    description:
      'A ocupação sobe a cada envio até a faixa alta, como num horário de pico.',
  },
  {
    id: 'outage',
    label: 'Interrupção da fonte',
    description:
      'A fonte simulada para de enviar. Depois do prazo de confirmação, as unidades passam a "sem confirmação recente"; ao trocar de cenário, voltam com um envio completo.',
  },
  {
    id: 'replay',
    label: 'Eventos repetidos e atrasados',
    description:
      'Cada envio é repetido e acompanhado de um evento antigo. O estado mostrado não deve mudar por isso.',
  },
] as const;

export type SimulationScenarioId = (typeof SIMULATION_SCENARIOS)[number]['id'];

export const DEFAULT_SIMULATION_SCENARIO: SimulationScenarioId = 'showcase';

export function isSimulationScenarioId(
  value: unknown,
): value is SimulationScenarioId {
  return SIMULATION_SCENARIOS.some((scenario) => scenario.id === value);
}
