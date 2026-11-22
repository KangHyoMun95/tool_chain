// src/cli/run-job.ts
// Chạy tay MỘT job dọn dữ liệu, cùng code với job tự động (JobRunner): đọc job_configs, khóa Redis chống chạy chồng, log kết quả,
// phát ai:rebuild nếu CLEAR_HISTORY có xóa ván. KHÔNG chờ giờ chạy.
//   pnpm --filter @toolhackchain/api run-job CLEAR_PREDICT_UNUSE
//   pnpm --filter @toolhackchain/api run-job CLEAR_HISTORY
// docker exec -it tool-chain-api node dist/cli/run-job.js CLEAR_HISTORY
import "dotenv/config";
import { Redis } from "ioredis";
import { JobRunner } from "../jobs/job-runner.js";
import { createJobPool } from "../jobs/job-db.js";
import { JOB_TYPES, type JobType } from "../jobs/jobs.constants.js";

const type = process.argv[2] as JobType | undefined;
if (!type || !(JOB_TYPES as readonly string[]).includes(type)) {
  console.error(`Dùng: run-job <${JOB_TYPES.join(" | ")}>`);
  process.exit(1);
}
if (!process.env.REDIS_URL) {
  console.error("Thiếu REDIS_URL");
  process.exit(1);
}

const db = createJobPool();
const redis = new Redis(process.env.REDIS_URL);
let code = 0;
try {
  const outcome = await new JobRunner(db, redis).run(type);
  console.log(`${type}: ${outcome}`);
  if (outcome === "failed") code = 1;
} finally {
  await db.close();
  redis.disconnect();
}
process.exit(code);
