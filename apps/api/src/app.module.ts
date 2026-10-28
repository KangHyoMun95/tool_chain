import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
// import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RedisModule } from "./redis/redis.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { TicksModule } from "./ticks/ticks.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
// import { TickEntity } from "./ticks/tick.entity.js";

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    // TypeOrmModule.forRoot({
    //   type: "postgres",
    //   url: process.env.DATABASE_URL,
    //   entities: [TickEntity],
    //   synchronize: process.env.NODE_ENV !== "production",
    // }),
    RedisModule,
    AuthModule,
    TicksModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
