import { DataSourceOptions } from 'typeorm';
import { join } from 'path';
import * as entities from '../database/entities';

/**
 * Single source of truth for the DB connection, read from environment
 * variables. Used both by the NestJS TypeOrmModule and the TypeORM CLI
 * DataSource so runtime and migrations stay in sync.
 *
 * synchronize is ALWAYS false — schema changes go through migrations only.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'toolhackchain',
    entities: Object.values(entities),
    // Compiled JS at runtime, .ts when run through ts-node (CLI).
    migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
  };
}
