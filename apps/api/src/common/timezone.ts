// src/common/timezone.ts
// Múi giờ của hệ thống = múi giờ của process (biến TZ, docker-compose đặt cho mọi service). KHÔNG ghi cứng tên múi giờ trong code.
// Mọi phép chia "ngày" trong SQL truyền tên này vào tham số `AT TIME ZONE $n`, không phụ thuộc timezone mặc định của Postgres.
import { Logger } from "@nestjs/common";

let cached: string | undefined;

/** Tên múi giờ IANA của process. Thiếu hoặc sai ⇒ log WARN (một lần) và dùng UTC. */
export function appTimeZone(): string {
  if (cached) return cached;
  const log = new Logger("Timezone");
  const raw = process.env.TZ?.trim();
  if (!raw) {
    log.warn("Thiếu biến TZ: dùng UTC (đặt TZ, vd Asia/Bangkok, cho mọi service)");
    return (cached = "UTC");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
  } catch {
    log.warn(`TZ="${raw}" không phải múi giờ hợp lệ: dùng UTC`);
    return (cached = "UTC");
  }
  return (cached = raw);
}

/** Giờ / phút / ngày (yyyy-mm-dd) hiện tại theo múi giờ của process. */
export function localClock(now: Date = new Date()): { hour: number; minute: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone(), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { hour: Number(get("hour")), minute: Number(get("minute")), date: `${get("year")}-${get("month")}-${get("day")}` };
}
