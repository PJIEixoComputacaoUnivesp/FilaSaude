import { MunicipalityBoundariesClient } from './municipality-boundaries.client.js';

const ring = [
  [-47, -24],
  [-46.8, -24],
  [-46.8, -23.8],
  [-47, -23.8],
  [-47, -24],
];

function feature(codarea: unknown, geometry: unknown) {
  return { type: 'Feature', properties: { codarea }, geometry };
}

function respondWith(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() =>
      Promise.resolve(
        status === 200 ? Response.json(body) : new Response('', { status }),
      ),
    );
}

describe('MunicipalityBoundariesClient', () => {
  const client = new MunicipalityBoundariesClient();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keys each boundary by the 6-digit municipality code', async () => {
    respondWith({
      features: [feature('3550308', { type: 'Polygon', coordinates: [ring] })],
    });

    const boundaries = await client.fetch('SP');

    expect([...boundaries.keys()]).toEqual(['355030']);
    expect(boundaries.get('355030')).toEqual([[ring]]);
  });

  it('accepts polygons and multipolygons', async () => {
    respondWith({
      features: [
        feature('3550308', { type: 'Polygon', coordinates: [ring] }),
        feature('3509502', {
          type: 'MultiPolygon',
          coordinates: [[ring], [ring]],
        }),
      ],
    });

    const boundaries = await client.fetch('SP');

    expect(boundaries.get('355030')).toHaveLength(1);
    expect(boundaries.get('350950')).toHaveLength(2);
  });

  it('requests the simplified municipality boundaries of the state', async () => {
    const fetch = respondWith({ features: [] });

    await client.fetch('SP');

    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.pathname).toBe('/api/v3/malhas/estados/SP');
    expect(url.searchParams.get('intrarregiao')).toBe('municipio');
    expect(url.searchParams.get('qualidade')).toBe('minima');
  });

  it('fails on an HTTP error', async () => {
    respondWith(null, 503);

    await expect(client.fetch('SP')).rejects.toThrow('status 503');
  });

  it('fails on a response without features', async () => {
    respondWith({ type: 'FeatureCollection' });

    await expect(client.fetch('SP')).rejects.toThrow('unexpected boundaries');
  });

  it.each([
    [
      'a missing municipality code',
      feature(undefined, { type: 'Polygon', coordinates: [ring] }),
    ],
    [
      'a geometry that is not an area',
      feature('3550308', { type: 'Point', coordinates: [0, 0] }),
    ],
    [
      'a ring with too few positions',
      feature('3550308', { type: 'Polygon', coordinates: [ring.slice(0, 3)] }),
    ],
    [
      'a multipolygon with no polygons',
      feature('3550308', { type: 'MultiPolygon', coordinates: [] }),
    ],
  ])('rejects the state on %s', async (_label, invalid) => {
    respondWith({ features: [invalid] });

    await expect(client.fetch('SP')).rejects.toThrow('invalid boundary');
  });
});
