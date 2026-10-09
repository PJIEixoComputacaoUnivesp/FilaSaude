import 'reflect-metadata';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { HealthUnitEntity } from './entities/health-unit.entity.js';
import { UnitLocationCorrectionEntity } from './entities/unit-location-correction.entity.js';
import { UnitLocationCorrectionEventEntity } from './entities/unit-location-correction-event.entity.js';
import { OccupancyWebhookInboxEntity } from './entities/occupancy-webhook-inbox.entity.js';

const databaseDirectory = dirname(fileURLToPath(import.meta.url));

function environmentValue(name: string, fallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be configured in production`);
  }
  return fallback;
}

export const databaseOptions = {
  type: 'postgres' as const,
  host: environmentValue('DB_HOST', 'localhost'),
  port: Number(environmentValue('DB_PORT', '5432')),
  username: environmentValue('DB_USER', 'filasaude'),
  password: environmentValue('DB_PASSWORD', 'filasaude'),
  database: environmentValue('DB_NAME', 'filasaude'),
  entities: [
    HealthUnitEntity,
    UnitLocationCorrectionEntity,
    UnitLocationCorrectionEventEntity,
    OccupancyWebhookInboxEntity,
  ],
  migrations: [resolve(databaseDirectory, 'migrations/*.js')],
  synchronize: false,
};

export default new DataSource(databaseOptions);
