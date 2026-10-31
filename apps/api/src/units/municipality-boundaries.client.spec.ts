import { distanceToAreaKm } from './geometry.js';
import { MunicipalityBoundariesClient } from './municipality-boundaries.client.js';
import { brazilianStates } from './states.js';

describe('MunicipalityBoundariesClient', () => {
  const client = new MunicipalityBoundariesClient();

  it('has the municipalities of every state', async () => {
    for (const { abbreviation, ibgeCode } of brazilianStates()) {
      const boundaries = await client.fetch(abbreviation);

      expect(boundaries.size).toBeGreaterThan(0);
      for (const code of boundaries.keys()) {
        expect(code).toMatch(/^\d{6}$/);
        expect(code.startsWith(ibgeCode)).toBe(true);
      }
    }
  });

  it('tells a misplaced coordinate from one inside the municipality', async () => {
    // Carapicuíba, with the current and the previous CNES point of a real unit.
    const area = (await client.fetch('SP')).get('351060')!;

    expect(
      distanceToAreaKm(area, { latitude: -24.5212404, longitude: -45.8395502 }),
    ).toBeGreaterThan(100);
    expect(
      distanceToAreaKm(area, { latitude: -23.535249, longitude: -46.841459 }),
    ).toBeLessThan(1);
  });

  it('does not use the network', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');

    await new MunicipalityBoundariesClient().fetch('SP');

    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it('fails on a state without boundaries', async () => {
    await expect(client.fetch('XX')).rejects.toThrow('No boundaries');
  });
});
