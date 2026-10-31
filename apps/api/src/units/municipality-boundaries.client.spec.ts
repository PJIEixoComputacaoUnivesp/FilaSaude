import { distanceToAreaKm } from './geometry.js';
import { MunicipalityBoundariesClient } from './municipality-boundaries.client.js';
import { brazilianStates } from './states.js';
import snapshot from './units.snapshot.json' with { type: 'json' };

describe('MunicipalityBoundariesClient', () => {
  const client = new MunicipalityBoundariesClient();

  beforeAll(() => client.onModuleInit());

  it('has valid boundaries for every state', async () => {
    for (const { abbreviation, ibgeCode } of brazilianStates()) {
      const boundaries = await client.fetch(abbreviation);

      expect(boundaries.size).toBeGreaterThan(0);
      for (const [code, polygons] of boundaries) {
        expect(code).toMatch(/^\d{6}$/);
        expect(code.startsWith(ibgeCode)).toBe(true);
        expect(polygons.length).toBeGreaterThan(0);
        for (const ring of polygons.flat()) {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring.flat().every(Number.isFinite)).toBe(true);
        }
      }
    }
  });

  it('covers the municipalities of the known units', async () => {
    // Created after the latest IBGE mesh, as the ADR 0001 explains.
    const notInMesh = new Set(['510183']);
    const missing: string[] = [];

    for (const { address } of snapshot) {
      const boundaries = await client.fetch(address.state);
      if (
        !boundaries.has(address.municipalityCode) &&
        !notInMesh.has(address.municipalityCode)
      ) {
        missing.push(address.municipalityCode);
      }
    }

    expect(missing).toEqual([]);
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
    const started = new MunicipalityBoundariesClient();

    await started.onModuleInit();
    await started.fetch('SP');

    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it('fails on a state without boundaries', async () => {
    await expect(client.fetch('XX')).rejects.toThrow('No boundaries');
  });
});
