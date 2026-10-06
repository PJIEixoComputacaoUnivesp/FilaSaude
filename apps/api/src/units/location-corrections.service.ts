import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UnitLocationCorrectionEntity } from '../database/entities/unit-location-correction.entity.js';
import type { UnitLocationCorrectionEventEntity } from '../database/entities/unit-location-correction-event.entity.js';
import { UnitLocationCorrectionRepository } from '../database/repositories/unit-location-correction.repository.js';
import { CnesClient } from './cnes.client.js';
import type { CorrectionInput } from './location-correction.input.js';
import {
  BOUNDARY_TOLERANCE_KM,
  UnitLocationsService,
} from './unit-locations.service.js';
import { UnitsService } from './units.service.js';

/** What an administrator sees: everything, including who and how. */
export interface AdminCorrection {
  cnesCode: string;
  latitude: number;
  longitude: number;
  verifiedBy: string;
  method: string;
  correctedAt: string;
  /** What CNES had when the correction was made. */
  anchor: {
    municipalityCode: string;
    street: string | null;
    number: string | null;
    latitude: number | null;
    longitude: number | null;
  };
}

/** One entry of the audit trail of a unit. */
export interface AdminCorrectionEvent {
  id: number;
  action: 'set' | 'replace' | 'remove';
  actor: string;
  occurredAt: string;
  method: string | null;
  previous: { latitude: number; longitude: number } | null;
  next: { latitude: number; longitude: number } | null;
}

function position(
  latitude: number | null,
  longitude: number | null,
): { latitude: number; longitude: number } | null {
  return latitude !== null && longitude !== null
    ? { latitude, longitude }
    : null;
}

function toAdminEvent(
  event: UnitLocationCorrectionEventEntity,
): AdminCorrectionEvent {
  return {
    id: event.id,
    action: event.action,
    actor: event.actor,
    occurredAt: event.occurredAt.toISOString(),
    method: event.method,
    previous: position(event.previousLatitude, event.previousLongitude),
    next: position(event.newLatitude, event.newLongitude),
  };
}

function toAdminCorrection(
  correction: UnitLocationCorrectionEntity,
): AdminCorrection {
  return {
    cnesCode: correction.cnesCode,
    latitude: correction.latitude,
    longitude: correction.longitude,
    verifiedBy: correction.verifiedBy,
    method: correction.method,
    correctedAt: correction.correctedAt.toISOString(),
    anchor: {
      municipalityCode: correction.anchorMunicipalityCode,
      street: correction.anchorStreet,
      number: correction.anchorNumber,
      latitude: correction.anchorLatitude,
      longitude: correction.anchorLongitude,
    },
  };
}

@Injectable()
export class LocationCorrectionsService {
  private readonly logger = new Logger(LocationCorrectionsService.name);

  constructor(
    private readonly corrections: UnitLocationCorrectionRepository,
    private readonly cnesClient: CnesClient,
    private readonly locations: UnitLocationsService,
    private readonly units: UnitsService,
  ) {}

  async list(): Promise<AdminCorrection[]> {
    return (await this.corrections.findAll()).map(toAdminCorrection);
  }

  /** The audit trail of a unit, newest first. */
  async events(cnesCode: string): Promise<AdminCorrectionEvent[]> {
    return (await this.corrections.findEvents(cnesCode)).map(toAdminEvent);
  }

  /**
   * Sets, or replaces, the manual position of a unit. The unit is looked up in
   * CNES now, and its municipality, address and coordinate are kept with the
   * correction, so a later relocation of the unit stops it from applying.
   */
  async register(
    cnesCode: string,
    input: CorrectionInput,
    actor: string,
  ): Promise<{ correction: AdminCorrection; boundaryChecked: boolean }> {
    const unit = await this.cnesClient
      .fetchUnit(cnesCode)
      .catch((error: unknown) => {
        this.logger.warn(`CNES lookup of ${cnesCode} failed: ${reason(error)}`);
        throw new ServiceUnavailableException('CNES is unavailable');
      });
    if (!unit) {
      throw new NotFoundException('Unit not found among the urgent care units');
    }

    const distanceKm = await this.locations
      .distanceToMunicipalityKm(unit, input)
      .catch((error: unknown) => {
        this.logger.warn(
          `Boundaries of ${unit.address.state} unavailable: ${reason(error)}`,
        );
        throw new ServiceUnavailableException(
          'Municipality boundaries are unavailable',
        );
      });
    // With no boundary yet (a very recent municipality) the position cannot be
    // checked, and the administrator is trusted.
    if (distanceKm !== null && distanceKm > BOUNDARY_TOLERANCE_KM) {
      throw new UnprocessableEntityException(
        'The position is outside the municipality of the unit',
      );
    }

    const entity = new UnitLocationCorrectionEntity();
    entity.cnesCode = unit.id;
    entity.latitude = input.latitude;
    entity.longitude = input.longitude;
    entity.verifiedBy = actor;
    entity.method = input.method;
    entity.correctedAt = new Date();
    entity.anchorMunicipalityCode = unit.address.municipalityCode;
    entity.anchorStreet = unit.address.street;
    entity.anchorNumber = unit.address.number;
    entity.anchorLatitude = unit.location.latitude;
    entity.anchorLongitude = unit.location.longitude;

    // Invalidate after the transaction commits: before it, a load could read
    // the old row and cache it for hours under the new generation.
    const saved = await this.corrections.saveWithEvent(entity, actor);
    this.units.invalidate();
    this.logger.log(`Manual position of CNES ${unit.id} set by ${actor}`);
    return {
      correction: toAdminCorrection(saved),
      boundaryChecked: distanceKm !== null,
    };
  }

  async remove(cnesCode: string, actor: string): Promise<void> {
    if (!(await this.corrections.removeWithEvent(cnesCode, actor))) {
      throw new NotFoundException('No manual position for this unit');
    }
    this.units.invalidate();
    this.logger.log(`Manual position of CNES ${cnesCode} removed by ${actor}`);
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
