// Bắn tick mẫu vào Redis Stream "ticks" để tự kiểm tra ingestion (không phải test tự động).
// Chạy ở apps/api:
//   REDIS_URL=redis://:pass@localhost:6379 node scripts/publish-sample-tick.mjs \
//     --lobby " Lobby  A " --category Baccarat --stream "Table 1" --shoe 1 --round 1 --streamer Bob [--result B] [--count 3]
//     [--country VN] [--status IN_PROGRESS|DONE|GET_RESULT|SUMMARY_RESULT] [--totals 10,20,5] [--deliver-time ... --timestamp ... --stamp-time ... --round-start-time ... --repaint-time ...]
import { createHash } from "node:crypto";
import { Redis } from "ioredis";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const url = process.env.REDIS_URL;
if (!url) { console.error("Thiếu REDIS_URL"); process.exit(1); }

const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
const lobby = args.lobby ?? "Lobby A";
const category = args.category ?? "Baccarat";
const stream = args.stream ?? "Table 1";
const count = Number(args.count ?? 1);
const totals = (args.totals ?? "1,2,3").split(",").map(Number);
const itemId = [lobby, category, stream].map(norm).join("|");

const redis = new Redis(url);
for (let i = 0; i < count; i++) {
  const ts = Date.now() / 1000;
  const data = {
    lobby_name: lobby, category_name: category, stream_id: "src-1", stream_name: stream,
    stream_shoe: args.shoe ?? 1, stream_round: args.round ?? 1, streamer_id: args.streamer ?? "Alice",
    player_count: 10, player_value: 1.5, status: args.status ?? "IN_PROGRESS",
    actual_result: args.result ?? null, total_B: totals[0], total_P: totals[1], total_T: totals[2],
    streamer_country: args.country ?? null,
    deliver_time: args["deliver-time"] ?? null, timestamp: args.timestamp ?? null, stamp_time: args["stamp-time"] ?? null,
    round_start_time: args["round-start-time"] ?? null, repaint_time: args["repaint-time"] ?? null,
  };
  const id = createHash("sha1").update(`${itemId}|${ts}|${JSON.stringify(data)}|${i}`).digest("hex");
  const tick = JSON.stringify({ id, item_id: itemId, ts, data });
  await redis.xadd("ticks", "MAXLEN", "~", 500000, "*", "item_id", itemId, "tick", tick);
  await redis.set(`latest:${itemId}`, tick, "EX", 3600);
}
console.log(`đã gửi ${count} tick, item_id=${itemId}`);
await redis.quit();
