import "dotenv/config";
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import type { EnvVars } from './config/env.validation.js';

// "1" → 1 hop, "true"/"false" → boolean, còn lại ("loopback", CIDR...) giữ nguyên chuỗi.
function parseTrustProxy(value?: string): boolean | number | string {
  if (!value) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

async function bootstrap() {
  // API_LOG_DEBUG=true ⇒ thêm mức debug (mặc định Nest in cả debug / verbose). Đọc trực tiếp vì logger cần trước khi có ConfigService;
  // giá trị vẫn được validate trong env.validation.ts.
  const logger: LogLevel[] = process.env.API_LOG_DEBUG === 'true'
    ? ['log', 'warn', 'error', 'fatal', 'debug']
    : ['log', 'warn', 'error', 'fatal'];
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });
  const config = app.get<ConfigService<EnvVars, true>>(ConfigService);

  app.setGlobalPrefix("api");
  app.set('trust proxy', parseTrustProxy(config.get('TRUST_PROXY', { infer: true })));
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: false });
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }).split(',').map((o) => o.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();                       // để onModuleDestroy chạy khi tắt
  await app.listen(Number(process.env.API_PORT ?? 4000));
}
await bootstrap();
