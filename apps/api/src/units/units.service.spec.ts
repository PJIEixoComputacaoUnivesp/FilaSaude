import { CnesClient } from './cnes.client.js';
import { UnitsService } from './units.service.js';
import type { HealthUnit } from './units.types.js';

const liveUnit: HealthUnit = {
  id: '1234567',
  name: 'UPA Teste',
  unitType: 'PRONTO ATENDIMENTO',
  address: {
    street: 'Rua Teste',
    number: '10',
    district: 'Centro',
    postalCode: '01001000',
    city: 'São Paulo',
    state: 'SP',
  },
  location: { latitude: -23.55, longitude: -46.63 },
  serviceHours: 'ATENDIMENTO CONTINUO DE 24 HORAS/DIA',
  lastUpdatedAt: '2026-09-20',
};

describe('UnitsService', () => {
  it('returns and caches live CNES data', async () => {
    const fetchUnits = vi.fn().mockResolvedValue([liveUnit]);
    const client = { fetchUnits } as unknown as CnesClient;
    const service = new UnitsService(client);

    const first = await service.findAll();
    const second = await service.findAll();

    expect(first.data).toEqual([liveUnit]);
    expect(first.metadata).toMatchObject({
      count: 1,
      dataOrigin: 'live',
      isStale: false,
      latestSourceUpdate: '2026-09-20',
    });
    expect(second).toBe(first);
    expect(fetchUnits).toHaveBeenCalledTimes(1);
  });

  it('returns the snapshot when CNES is unavailable', async () => {
    const client = {
      fetchUnits: vi.fn().mockRejectedValue(new Error('unavailable')),
    } as unknown as CnesClient;
    const service = new UnitsService(client);

    const response = await service.findAll();

    expect(response.data.length).toBeGreaterThan(0);
    expect(response.metadata).toMatchObject({
      dataOrigin: 'fallback',
      isStale: true,
    });
  });
});
