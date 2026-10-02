import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { HealthUnitEntity } from './entities/health-unit.entity.js';

export const databaseOptions = {
  type: 'postgres' as const,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'filasaude',
  password: process.env.DB_PASSWORD ?? 'filasaude',
  database: process.env.DB_NAME ?? 'filasaude',
  entities: [HealthUnitEntity],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: false,
};

export default new DataSource(databaseOptions);
