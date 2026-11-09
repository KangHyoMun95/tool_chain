// src/predictions/predict-lua.ts
// Các thao tác Redis nhiều bước của luồng dự đoán, mỗi cái là một script nên atomic (không có khoảng hở giữa các bước).
import type { Redis } from "ioredis";

export type PredictRedis = Redis & {
  /** Nâng round_status lên `status` nếu cao hơn trạng thái hiện có; trả về trạng thái sau cùng. */
  advanceRoundStatus(statusKey: string, status: string, ttlSeconds: number): Promise<string>;
  /** HSETNX recent + EXPIRE + XADD ai:results; chỉ khi HSETNX thêm mới. Trả 1 nếu đã phát, 0 nếu ván đã có kết quả. */
  recordResult(
    recentKey: string, resultStream: string,
    round: string, result: string, ttlSeconds: number, maxLen: number, payload: string,
  ): Promise<number>;
  /** SET predict_req NX EX + XADD predict:requests; chỉ khi SET thành công. Trả 1 nếu đã phát, 0 nếu đã có yêu cầu. */
  requestPrediction(
    requestKey: string, requestStream: string, ttlSeconds: number, maxLen: number, payload: string,
  ): Promise<number>;
};

export function withPredictCommands(conn: Redis): PredictRedis {
  conn.defineCommand("advanceRoundStatus", {
    numberOfKeys: 1,
    lua: `
      local rank = { IN_PROGRESS = 1, DONE = 2, GET_RESULT = 3, SUMMARY_RESULT = 4 }
      local cur = redis.call('GET', KEYS[1])
      if cur and (rank[cur] or 0) >= rank[ARGV[1]] then return cur end
      redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
      return ARGV[1]
    `,
  });
  conn.defineCommand("recordResult", {
    numberOfKeys: 2,
    lua: `
      if redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[3])
        redis.call('XADD', KEYS[2], 'MAXLEN', '~', ARGV[4], '*', 'payload', ARGV[5])
        return 1
      end
      return 0
    `,
  });
  conn.defineCommand("requestPrediction", {
    numberOfKeys: 2,
    lua: `
      if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) then
        redis.call('XADD', KEYS[2], 'MAXLEN', '~', ARGV[2], '*', 'payload', ARGV[3])
        return 1
      end
      return 0
    `,
  });
  return conn as PredictRedis;
}
