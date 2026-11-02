import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { createObserveModule } from '@nestjs/observe';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { REDIS, RedisModule } from "./redis/redis.module.js";
import { RedisThrottlerStorage } from "./common/redis-throttler.storage.js";
import { validateEnv } from "./config/env.validation.js";
import { RolesGuard } from "./auth/roles.guard.js";
import { SessionGuard } from "./auth/session.guard.js";
import { UsersModule } from "./users/users.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { IngestionModule } from "./ingestion/ingestion.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { entities } from "./database/entities/index.js";

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Thiếu / sai biến môi trường bắt buộc thì app dừng ngay khi khởi động.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    // Schema is managed by Flyway only; TypeORM is used for queries.
    TypeOrmModule.forRoot({
      type: "postgres",
      url: process.env.DATABASE_URL,
      entities,
      synchronize: false,
      migrationsRun: false,
      installExtensions: false,   // id uuid dùng gen_random_uuid() của Postgres; không để TypeORM tự cài extension
    }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    AuthModule,
    UsersModule,
    // ticks/ giữ lại để so sánh, KHÔNG đăng ký: cùng group "persist" + cùng consumer sẽ tranh tin với IngestionModule.
    IngestionModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Thứ tự chạy: rate limit → xác thực → phân quyền theo role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
