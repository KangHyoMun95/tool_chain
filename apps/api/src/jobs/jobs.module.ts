// src/jobs/jobs.module.ts
import { Inject, Module, OnModuleDestroy } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module.js";
import { JobRunner } from "./job-runner.js";
import { createJobPool, type JobPool } from "./job-db.js";
import { JobsScheduler } from "./jobs.scheduler.js";

const JOB_DB = Symbol("JOB_DB");

@Module({
  providers: [
    { provide: JOB_DB, useFactory: () => createJobPool() },
    { provide: JobRunner, inject: [JOB_DB, REDIS], useFactory: (db: JobPool, redis: Redis) => new JobRunner(db, redis) },
    JobsScheduler,
  ],
})
export class JobsModule implements OnModuleDestroy {
  constructor(@Inject(JOB_DB) private readonly db: JobPool) {}
  async onModuleDestroy() { await this.db.close(); }
}
