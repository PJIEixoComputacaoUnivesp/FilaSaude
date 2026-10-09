import { UnprocessableEntityException } from '@nestjs/common';
import { OccupancySnapshotValidationService } from './occupancy-snapshot-validation.service.js';

describe('OccupancySnapshotValidationService', () => {
  const service = new OccupancySnapshotValidationService();
  const validSnapshot = {
    eventId: '01K5T2S6C4TZ1K9TR6F89A2M7X',
    type: 'occupancy.snapshot.v1',
    unitCnes: '1234567',
    occurredAt: '2026-09-25T14:30:00-03:00',
    observedAt: '2026-09-25T14:30:05-03:00',
    categories: [
      { code: 'observation', capacity: 20, occupied: 13 },
      { code: 'inpatient', capacity: 8, occupied: 5 },
    ],
  };

  it('accepts a snapshot with only the applicable categories', () => {
    expect(service.validate(validSnapshot)).toEqual(validSnapshot);
  });

  it('rejects duplicate categories and occupied capacity overflow', () => {
    expect(() =>
      service.validate({
        ...validSnapshot,
        categories: [
          { code: 'observation', capacity: 1, occupied: 2 },
          { code: 'observation', capacity: 1, occupied: 1 },
        ],
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it('rejects timestamps in reverse order', () => {
    expect(() =>
      service.validate({
        ...validSnapshot,
        occurredAt: validSnapshot.observedAt,
        observedAt: validSnapshot.occurredAt,
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it('rejects unknown fields', () => {
    expect(() =>
      service.validate({ ...validSnapshot, unexpected: true }),
    ).toThrow(UnprocessableEntityException);
  });
});
