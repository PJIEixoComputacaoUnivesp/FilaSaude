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

  it('reports duplicate category fields', () => {
    let error: unknown;
    try {
      service.validate({
        ...validSnapshot,
        categories: [
          { code: 'observation', capacity: 1, occupied: 1 },
          { code: 'observation', capacity: 1, occupied: 1 },
        ],
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject(
      {
        fields: ['categories[1].code'],
      },
    );
  });

  it('reports occupied capacity overflow fields', () => {
    let error: unknown;
    try {
      service.validate({
        ...validSnapshot,
        categories: [{ code: 'observation', capacity: 1, occupied: 2 }],
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject(
      {
        fields: ['categories[0].occupied'],
      },
    );
  });

  it('reports an empty category list', () => {
    let error: unknown;
    try {
      service.validate({ ...validSnapshot, categories: [] });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject(
      {
        fields: ['categories'],
      },
    );
  });

  it('reports an invalid snapshot type', () => {
    let error: unknown;
    try {
      service.validate({ ...validSnapshot, type: 'other.event' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject(
      {
        fields: ['type'],
      },
    );
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

  it('accepts an old snapshot for later processing', () => {
    expect(
      service.validate(validSnapshot, new Date('2026-10-01T14:30:05Z')),
    ).toEqual(validSnapshot);
  });

  it('rejects an observed timestamp too far in the future', () => {
    expect(() =>
      service.validate(
        {
          ...validSnapshot,
          occurredAt: '2026-09-25T14:35:00Z',
          observedAt: '2026-09-25T14:35:06Z',
        },
        new Date('2026-09-25T14:30:05Z'),
      ),
    ).toThrow(UnprocessableEntityException);
  });

  it('rejects impossible calendar dates', () => {
    expect(() =>
      service.validate({
        ...validSnapshot,
        occurredAt: '2026-02-30T14:30:00Z',
        observedAt: '2026-02-30T14:30:05Z',
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it('rejects a non-canonical ULID', () => {
    expect(() =>
      service.validate({
        ...validSnapshot,
        eventId: 'Z1K5T2S6C4TZ1K9TR6F89A2M7X',
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it('rejects unknown fields', () => {
    expect(() =>
      service.validate({ ...validSnapshot, unexpected: true }),
    ).toThrow(UnprocessableEntityException);
  });
  describe('occupancy.snapshot.v2', () => {
    const validV2 = {
      ...validSnapshot,
      type: 'occupancy.snapshot.v2',
      attendance: {
        waiting: 7,
        inService: 4,
        serviceSlots: 4,
        completed: {
          count: 86,
          periodStart: '2026-09-25T00:00:00-03:00',
          periodEnd: '2026-09-26T00:00:00-03:00',
        },
      },
    };

    function fieldsOf(payload: unknown): unknown {
      try {
        service.validate(payload);
      } catch (error) {
        return (error as UnprocessableEntityException).getResponse();
      }
      return null;
    }

    it('accepts the attendance flow, partial attendance and no attendance', () => {
      expect(service.validate(validV2)).toEqual(validV2);
      expect(
        service.validate({ ...validV2, attendance: { waiting: 0 } }),
      ).toBeTruthy();
      const { attendance: _attendance, ...withoutAttendance } = validV2;
      expect(service.validate(withoutAttendance)).toEqual(withoutAttendance);
    });

    it('keeps attendance out of v1', () => {
      expect(
        fieldsOf({ ...validSnapshot, attendance: validV2.attendance }),
      ).toMatchObject({ fields: ['attendance'] });
    });

    it('rejects null, empty and negative counts instead of reading them as zero', () => {
      expect(fieldsOf({ ...validV2, attendance: null })).toMatchObject({
        fields: ['attendance'],
      });
      expect(fieldsOf({ ...validV2, attendance: {} })).toMatchObject({
        fields: ['attendance'],
      });
      expect(
        fieldsOf({
          ...validV2,
          attendance: {
            waiting: -1,
            inService: 1.5,
            serviceSlots: 0,
            triage: 3,
          },
        }),
      ).toMatchObject({
        fields: [
          'attendance.triage',
          'attendance.waiting',
          'attendance.inService',
          'attendance.serviceSlots',
        ],
      });
    });

    it('requires a half-open period that contains occurredAt', () => {
      const completed = validV2.attendance.completed;
      expect(
        fieldsOf({
          ...validV2,
          attendance: {
            completed: { ...completed, periodEnd: completed.periodStart },
          },
        }),
      ).toMatchObject({ fields: ['attendance.completed.periodEnd'] });
      expect(
        fieldsOf({
          ...validV2,
          occurredAt: '2026-09-26T00:00:00-03:00',
          observedAt: '2026-09-26T00:00:05-03:00',
          attendance: { completed },
        }),
      ).toMatchObject({
        fields: [
          'attendance.completed.periodStart',
          'attendance.completed.periodEnd',
        ],
      });
      expect(
        fieldsOf({
          ...validV2,
          attendance: { completed: { count: 1, periodStart: 'ontem' } },
        }),
      ).toMatchObject({
        fields: [
          'attendance.completed.periodStart',
          'attendance.completed.periodEnd',
        ],
      });
    });
  });
});
