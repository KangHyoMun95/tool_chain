// packages/shared/src/realtime.ts
export const TICK_STREAM = "ticks";
export const PERSIST_GROUP = "persist";

export type Tick = {
  id: string;                        // khoá dedup (sha1), cũng là khoá unique trong DB
  item_id: string;
  ts: number;                        // epoch giây, lấy từ nguồn
  data: Record<string, unknown>;
};

export const RedisKeys = {
  latest: (itemId: string) => `latest:${itemId}`,
  perm: (userId: string) => `perm:user:${userId}`,
  session: (sid: string) => `session:${sid}`,
} as const;