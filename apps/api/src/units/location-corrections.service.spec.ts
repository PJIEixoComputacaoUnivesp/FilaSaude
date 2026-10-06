import {
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UnitLocationCorrectionEntity } from '../database/entities/unit-location-correction.entity.js';
import type { UnitLocationCorrectionRepository } from '../database/repositories/unit-location-correction.repository.js';
import type { CnesClient } from './cnes.client.js';
import { LocationCorrectionsService } from './location-corrections.service.js';
import type { UnitLocationsService } from './unit-locations.service.js';
import type { HealthUnit } from './units.types.js';
import type { UnitsService } from './units.service.js';

const cnesUnit: HealthUnit = {
  id: '0113360',
  name: 'UPA Teste',
  unitType: 'PRONTO ATENDIMENTO',
  address: {
    street: 'RUA TESTE',
    number: '100',
    district: null,
    postalCode: null,
    municipalityCode: '261160',
    city: 'Recife',
    state: 'PE',
  },
  location: {
    latitude: -8.9,
    longitude: -35.1,
    precision: 'source',
    original: null,
    referenceMonth: null,
    correctedAt: null,
  },
  serviceHours: null,
  lastUpdatedAt: '2026-09-20',
};

const ACTOR = 'maria-souza';

const input = {
  latitude: -8.05,
  longitude: -34.9,
  method: 'Conferido no mapa oficial',
};

function build({
  unit = cnesUnit as HealthUnit | null,
  distance = 0 as number | null,
}: { unit?: HealthUnit | null; distance?: number | null } = {}) {
  const save = vi.fn((entity: UnitLocationCorrectionEntity) =>
    Promise.resolve(entity),
  );
  const deleteByCnesCode = vi.fn().mockResolvedValue(true);
  const findAll = vi.fn().mockResolvedValue([]);
  const findEvents = vi.fn().mockResolvedValue([]);
  const fetchUnit = vi.fn().mockResolvedValue(unit);
  const distanceToMunicipalityKm = vi.fn().mockResolvedValue(distance);
  const invalidate = vi.fn();
  const service = new LocationCorrectionsService(
    {
      saveWithEvent: save,
      removeWithEvent: deleteByCnesCode,
      findAll,
      findEvents,
    } as unknown as UnitLocationCorrectionRepository,
    { fetchUnit } as unknown as CnesClient,
    { distanceToMunicipalityKm } as unknown as UnitLocationsService,
    { invalidate } as unknown as UnitsService,
  );
  return {
    service,
    save,
    deleteByCnesCode,
    findAll,
    findEvents,
    fetchUnit,
    distanceToMunicipalityKm,
    invalidate,
  };
}

describe('LocationCorrectionsService', () => {
  describe('register', () => {
    it('saves the position anchored to the CNES state of the unit', async () => {
      const { service, save, invalidate } = build();

      const { correction, boundaryChecked } = await service.register(
        '0113360',
        input,
        ACTOR,
      );

      const saved = save.mock.calls[0]![0];
      expect(saved).toMatchObject({
        cnesCode: '0113360',
        latitude: -8.05,
        longitude: -34.9,
        verifiedBy: 'maria-souza',
        method: 'Conferido no mapa oficial',
        anchorMunicipalityCode: '261160',
        anchorStreet: 'RUA TESTE',
        anchorNumber: '100',
        anchorLatitude: -8.9,
        anchorLongitude: -35.1,
      });
      expect(saved.correctedAt).toBeInstanceOf(Date);
      expect(correction.anchor).toEqual({
        municipalityCode: '261160',
        street: 'RUA TESTE',
        number: '100',
        latitude: -8.9,
        longitude: -35.1,
      });
      expect(boundaryChecked).toBe(true);
      expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it('records the authenticated administrator, whatever the input claims', async () => {
      const { service, save } = build();
      const spoofed = { ...input, verifiedBy: 'someone-else' } as typeof input;

      await service.register('0113360', spoofed, 'joao');

      expect(save.mock.calls[0]![0].verifiedBy).toBe('joao');
    });

    it('hands the authenticated administrator to the audit trail', async () => {
      const { service, save } = build();

      await service.register('0113360', input, 'joao');

      expect(save).toHaveBeenCalledWith(expect.anything(), 'joao');
    });

    it('invalidates the cache only after the change is saved', async () => {
      const { service, save, invalidate } = build();

      await service.register('0113360', input, ACTOR);

      expect(save.mock.invocationCallOrder[0]).toBeLessThan(
        invalidate.mock.invocationCallOrder[0]!,
      );
    });

    it('checks the position against the municipality of the unit', async () => {
      const { service, distanceToMunicipalityKm } = build();

      await service.register('0113360', input, ACTOR);

      expect(distanceToMunicipalityKm).toHaveBeenCalledWith(cnesUnit, input);
    });

    it('accepts a position within the border tolerance', async () => {
      const { service, save } = build({ distance: 4.9 });

      await service.register('0113360', input, ACTOR);

      expect(save).toHaveBeenCalledTimes(1);
    });

    it('rejects a position outside the municipality, without saving or invalidating', async () => {
      const { service, save, invalidate } = build({ distance: 5.1 });

      await expect(service.register('0113360', input, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(save).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('trusts the administrator when the municipality has no boundary yet', async () => {
      const { service, save } = build({ distance: null });

      const { boundaryChecked } = await service.register(
        '0113360',
        input,
        ACTOR,
      );

      expect(save).toHaveBeenCalledTimes(1);
      expect(boundaryChecked).toBe(false);
    });

    it('anchors a unit that has no street or coordinate in CNES', async () => {
      const bare: HealthUnit = {
        ...cnesUnit,
        address: { ...cnesUnit.address, street: null, number: null },
        location: { ...cnesUnit.location, latitude: null, longitude: null },
      };
      const { service, save } = build({ unit: bare });

      await service.register('0113360', input, ACTOR);

      expect(save.mock.calls[0]![0]).toMatchObject({
        anchorStreet: null,
        anchorNumber: null,
        anchorLatitude: null,
        anchorLongitude: null,
      });
    });

    it('stores the code in the 7-digit form the units use', async () => {
      const { service, save } = build();

      await service.register('113360', input, ACTOR);

      expect(save.mock.calls[0]![0].cnesCode).toBe('0113360');
    });

    it('reports an unknown unit', async () => {
      const { service, save } = build({ unit: null });

      await expect(service.register('9999999', input, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('reports CNES being unavailable without exposing why', async () => {
      const { service, fetchUnit, save, invalidate } = build();
      fetchUnit.mockRejectedValue(
        new Error('connect ECONNREFUSED 10.0.0.1:443'),
      );

      const error = await service
        .register('0113360', input, ACTOR)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.message).not.toContain('ECONNREFUSED');
      expect(save).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('reports the boundaries being unavailable', async () => {
      const { service, distanceToMunicipalityKm, save } = build();
      distanceToMunicipalityKm.mockRejectedValue(new Error('IBGE timeout'));

      await expect(service.register('0113360', input, ACTOR)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('does not invalidate the cache when the save fails', async () => {
      const { service, save, invalidate } = build();
      save.mockRejectedValue(new Error('database is down'));

      await expect(service.register('0113360', input, ACTOR)).rejects.toThrow(
        'database is down',
      );
      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('hands the authenticated administrator to the audit trail', async () => {
      const { service, deleteByCnesCode } = build();

      await service.remove('0113360', 'joao');

      expect(deleteByCnesCode).toHaveBeenCalledWith('0113360', 'joao');
    });

    it('invalidates the cache only after the removal is saved', async () => {
      const { service, deleteByCnesCode, invalidate } = build();

      await service.remove('0113360', ACTOR);

      expect(deleteByCnesCode.mock.invocationCallOrder[0]).toBeLessThan(
        invalidate.mock.invocationCallOrder[0]!,
      );
    });

    it('removes the correction and invalidates the cache', async () => {
      const { service, deleteByCnesCode, invalidate } = build();

      await service.remove('0113360', ACTOR);

      expect(deleteByCnesCode).toHaveBeenCalledWith('0113360', ACTOR);
      expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it('reports a unit that has no correction', async () => {
      const { service, deleteByCnesCode, invalidate } = build();
      deleteByCnesCode.mockResolvedValue(false);

      await expect(service.remove('0113360', ACTOR)).rejects.toThrow(
        NotFoundException,
      );
      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('shows each change with who made it and the positions before and after', async () => {
      const { service, findEvents } = build();
      findEvents.mockResolvedValue([
        {
          id: 3,
          cnesCode: '0113360',
          action: 'remove',
          actor: 'joao',
          occurredAt: new Date('2026-10-08T12:00:00Z'),
          method: null,
          previousLatitude: -8.05,
          previousLongitude: -34.9,
          newLatitude: null,
          newLongitude: null,
        },
        {
          id: 2,
          cnesCode: '0113360',
          action: 'set',
          actor: 'maria',
          occurredAt: new Date('2026-10-07T15:00:00Z'),
          method: 'Conferido no mapa oficial',
          previousLatitude: null,
          previousLongitude: null,
          newLatitude: -8.05,
          newLongitude: -34.9,
        },
      ]);

      expect(await service.events('0113360')).toEqual([
        {
          id: 3,
          action: 'remove',
          actor: 'joao',
          occurredAt: '2026-10-08T12:00:00.000Z',
          method: null,
          previous: { latitude: -8.05, longitude: -34.9 },
          next: null,
        },
        {
          id: 2,
          action: 'set',
          actor: 'maria',
          occurredAt: '2026-10-07T15:00:00.000Z',
          method: 'Conferido no mapa oficial',
          previous: null,
          next: { latitude: -8.05, longitude: -34.9 },
        },
      ]);
      expect(findEvents).toHaveBeenCalledWith('0113360');
    });
  });

  describe('list', () => {
    it('shows an administrator who and how, with the date as ISO', async () => {
      const { service, findAll } = build();
      const row = Object.assign(new UnitLocationCorrectionEntity(), {
        cnesCode: '0113360',
        latitude: -8.05,
        longitude: -34.9,
        verifiedBy: 'maria-souza',
        method: 'Conferido no mapa oficial',
        correctedAt: new Date('2026-10-07T15:00:00Z'),
        anchorMunicipalityCode: '261160',
        anchorStreet: 'RUA TESTE',
        anchorNumber: '100',
        anchorLatitude: -8.9,
        anchorLongitude: -35.1,
      });
      findAll.mockResolvedValue([row]);

      expect(await service.list()).toEqual([
        {
          cnesCode: '0113360',
          latitude: -8.05,
          longitude: -34.9,
          verifiedBy: 'maria-souza',
          method: 'Conferido no mapa oficial',
          correctedAt: '2026-10-07T15:00:00.000Z',
          anchor: {
            municipalityCode: '261160',
            street: 'RUA TESTE',
            number: '100',
            latitude: -8.9,
            longitude: -35.1,
          },
        },
      ]);
    });
  });
});
