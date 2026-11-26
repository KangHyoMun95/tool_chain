// src/jobs/jobs.scheduler.ts
// Lịch chạy (setInterval, không dùng @nestjs/schedule — xem CLAUDE.md): CLEAR_PREDICT_UNUSE ở phút :00 của mỗi giờ, CLEAR_HISTORY lúc
// 03:00 mỗi ngày, theo múi giờ của process (TZ). Không có chạy bù: lỡ một lần (API tắt) thì lần chạy sau tự xử lý phần đã quá hạn,
// vì mốc cắt luôn tính lại từ thời điểm chạy.
// Mỗi lần kích hoạt đặt dấu `job:fired:{type}:{slot}` (SET NX) nên không chạy trùng trong cùng giờ / ngày (kể cả nhiều tick trong phút :00).
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import type { Redis } from "ioredis";
import { localClock } from "../common/timezone.js";
import { REDIS } from "../redis/redis.module.js";
import { JobRunner } from "./job-runner.js";
import { CLEAR_HISTORY_HOUR, JOB_FIRED_TTL_S, SCHEDULER_TICK_MS, redisJobFired, type JobType } from "./jobs.constants.js";

@Injectable()
export class JobsScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(JobsScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly runner: JobRunner, @Inject(REDIS) private readonly redis: Redis) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), SCHEDULER_TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() { clearInterval(this.timer); }

  private async tick() {
    try {
      const { hour, minute, date } = localClock();
      if (minute !== 0) return;
      await this.fire("CLEAR_PREDICT_UNUSE", `${date}T${hour}`);
      if (hour === CLEAR_HISTORY_HOUR) await this.fire("CLEAR_HISTORY", date);
    } catch (e) {
      this.log.error(e);
    }
  }

  private async fire(type: JobType, slot: string) {
    if ((await this.redis.set(redisJobFired(type, slot), "1", "EX", JOB_FIRED_TTL_S, "NX")) !== "OK") return;   // đã kích hoạt trong slot này
    void this.runner.run(type);   // không await: tick kế tiếp không bị chặn (khóa chống chạy chồng nằm trong runner)
  }
}
