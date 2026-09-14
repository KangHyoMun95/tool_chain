import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../config/typeorm.config';

// Load apps/api/.env when the TypeORM CLI runs this file directly.
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const AppDataSource = new DataSource(buildDataSourceOptions());

export default AppDataSource;
