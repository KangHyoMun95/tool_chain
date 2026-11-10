// apps/api/scripts/billing-sim.mjs — CHỈ DÙNG LOCAL để tự kiểm tra billing / settlement / giao pick.
// Bắn tick mẫu vào Redis "ticks" (như crawler) và giả làm AI bằng một message predict:results, có chờ giữa các bước.
// Trừ tiền do API làm thật cho các kết nối SSE đang tham gia stream (mở bằng scripts/sse-client.mjs --stream <uuid>).
// Tắt AI trước (docker compose stop ai) để AI không ghi prediction của ván trước script.
//
//   cd apps/api && node --env-file=.env scripts/billing-sim.mjs round --stream s1 --shoe 1 --round 1 --pick B --result P --phone 0900000001
//   node --env-file=.env scripts/billing-sim.mjs result --stream s1 --shoe 1 --round 1 --result P   # chỉ bắn lại tick có result
//   node --env-file=.env scripts/billing-sim.mjs show   --stream s1 --shoe 1 --round 1 --phone 0900000001   # in trạng thái ván / tiền
//
// Tham số: --lobby (mặc định "Sim Lobby"), --category ("Sim Cat"), --stream, --shoe, --round,
//   --pick B|P|- (message predict:results giả; "-" = AI không dự đoán; bỏ trống = không gửi),
//   --result B|P|T|- ("-" = không bắn result), --phone (chỉ để in tiền / subscription của user này),
//   --wait (ms chờ sau tick IN_PROGRESS / result, mặc định 4000), --hold (ms chờ sau prediction trước khi bắn result, mặc định 3000).
import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import pg from "pg";

const GAME_SESSION_NAMESPACE = "52491c65-79c8-4104-a85b-6a659735e9d7";   // = game-sessions/game-session-id.ts
const PREDICTION_NAMESPACE = "d2ce63e1-76f4-498d-b5c7-67718f2a7f29";     // = packages/shared/src/ai.ts

function uuidV5(name, namespace) {
  const h = createHash("sha1").update(Buffer.from(namespace.replace(/-/g, ""), "hex")).update(name, "utf8").digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
const lobby = args.lobby ?? "Sim Lobby", category = args.category ?? "Sim Cat", stream = args.stream;
const shoe = Number(args.shoe), round = Number(args.round), wait = Number(args.wait ?? 4000), hold = Number(args.hold ?? 3000);
if (!["round", "result", "show"].includes(cmd) || !stream || !Number.isInteger(shoe) || !Number.isInteger(round)) {
  console.error("Cách dùng: node scripts/billing-sim.mjs round|result|show --stream <tên> --shoe <n> --round <n> [...]");
  process.exit(2);
}
const keyId = [lobby, category, stream].map(norm).join("|");
const gsid = uuidV5(`${keyId}|${shoe}|${round}`, GAME_SESSION_NAMESPACE);
const pid = uuidV5(gsid, PREDICTION_NAMESPACE);

const redis = new Redis(process.env.REDIS_URL);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

async function publish(status, result) {
  const data = {
    lobby_name: lobby, category_name: category, stream_id: "sim", stream_name: stream,
    stream_shoe: shoe, stream_round: round, streamer_id: "Sim/Vietnam/0", player_count: 0, player_value: 0,
    status, actual_result: result, total_B: 0, total_P: 0, total_T: 0,
  };
  const ts = Date.now() / 1000;
  const id = createHash("sha1").update(`${keyId}|${ts}|${JSON.stringify(data)}`).digest("hex");
  const tick = JSON.stringify({ id, item_id: keyId, ts, data });
  await redis.xadd("ticks", "MAXLEN", "~", 100000, "*", "item_id", keyId, "tick", tick);
  await redis.set(`latest:${keyId}`, tick, "EX", 3600);
  console.log(`→ tick ${status}${result ? ` result=${result}` : ""} (${keyId} shoe ${shoe} round ${round})`);
}

/** Giả làm AI: XADD predict:results (đi qua PredictResultConsumer thật: hạn chót → insert + trừ participant → giao pick). */
async function publishPrediction(pick) {
  const streamId = (await db.query(
    `SELECT stream_id FROM game_sessions WHERE game_session_id = $1`, [gsid])).rows[0]?.stream_id
    ?? await redis.get(`stream:${keyId}`);
  if (!streamId) throw new Error("Chưa có stream trong DB / cache (tăng --wait để ingestion kịp ghi)");
  const ok = pick === "B" || pick === "P";
  const msg = {
    schema_version: 1, prediction_id: pid, game_session_id: gsid, stream_id: streamId, key_id: keyId, shoe, round,
    pick: ok ? pick : null, confidence: ok ? 0.6 : null,
    chosen: ok ? { k: 3, pattern: "BPB", occurrences: 5, pct_B: pick === "B" ? 0.6 : 0.4, pct_P: pick === "B" ? 0.4 : 0.6 } : null,
    detail: [], history_used: "", missing_previous: false, reason: ok ? "OK" : "NOT_ENOUGH_HISTORY",
    model_version: "sim", created_at: new Date().toISOString(),
  };
  await redis.xadd("predict:results", "MAXLEN", "~", 10000, "*", "payload", JSON.stringify(msg));
  console.log(`→ predict:results pick=${msg.pick ?? "null"} (${msg.reason})`);
}

async function show() {
  const g = await db.query(`SELECT status, result, ended_at FROM game_sessions WHERE game_session_id = $1`, [gsid]);
  const p = await db.query(`SELECT predict_result AS pick FROM predictions WHERE prediction_id = $1`, [pid]);
  console.log(`ván ${gsid}:`, g.rows[0] ?? "(chưa có)", "| pick:", p.rows[0]?.pick ?? "(chưa có)");
  if (!args.phone) return;
  const r = await db.query(
    `SELECT u.balance,
            ps.fee_amount, ps.delivered_at, ps.refunded_at,
            (SELECT json_agg(json_build_object('type', t.transaction_type, 'amount', t.amount, 'before', t.balance_before, 'after', t.balance_after) ORDER BY t.created_at)
             FROM transactions t WHERE t.predictions_subscriptions_id = ps.prediction_subscription_id) AS txs
     FROM users u LEFT JOIN prediction_subscriptions ps ON ps.user_id = u.user_id AND ps.prediction_id = $2
     WHERE u.phone_number = $1`, [args.phone, pid]);
  console.log(`user ${args.phone}:`, JSON.stringify(r.rows[0] ?? "(không có)", null, 1));
}

try {
  if (cmd === "round") {
    await publish("IN_PROGRESS", null);
    console.log(`… chờ ${wait}ms (batch ingestion)`); await sleep(wait);
    if (args.pick) {
      if (!["B", "P", "-"].includes(args.pick)) throw new Error("--pick phải là B, P hoặc - (AI không dự đoán)");
      await publishPrediction(args.pick);
      console.log(`… chờ ${hold}ms (consumer trừ tiền + giao pick; xem cửa sổ sse-client)`); await sleep(hold);
    }
    if (args.result && args.result !== "-") {
      await publish("GET_RESULT", args.result);
      console.log(`… chờ ${wait}ms (ingestion + settlement)`); await sleep(wait);
    }
    await show();
  } else if (cmd === "result") {
    await publish("GET_RESULT", args.result);
    console.log(`… chờ ${wait}ms`); await sleep(wait);
    await show();
  } else {
    await show();
  }
} finally {
  await db.end();
  redis.disconnect();
}
