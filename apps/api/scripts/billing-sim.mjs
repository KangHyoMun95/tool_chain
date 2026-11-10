// apps/api/scripts/billing-sim.mjs — CHỈ DÙNG LOCAL để tự kiểm tra billing / settlement.
// Bắn tick mẫu vào Redis "ticks" (như crawler), có chờ giữa các trạng thái, và (tùy chọn) giả lập một lần trừ tiền
// bằng đúng các câu SQL của BillingService.charge — dùng khi chưa có kết nối SSE tham gia (PR billing 1).
//
//   cd apps/api && REDIS_URL=... DATABASE_URL=... node scripts/billing-sim.mjs round  --stream s1 --shoe 1 --round 1 --pick B --result P --phone 0900000001
//   node scripts/billing-sim.mjs result --stream s1 --shoe 1 --round 1 --result P        # chỉ bắn lại tick có result
//   node scripts/billing-sim.mjs show   --stream s1 --shoe 1 --round 1 --phone 0900000001  # in trạng thái ván / tiền
//
// Tham số: --lobby (mặc định "Sim Lobby"), --category ("Sim Cat"), --stream, --shoe, --round,
//   --pick B|P (prediction giả nếu ván chưa có prediction; bỏ trống = không tạo, không trừ),
//   --result B|P|T|- ("-" = không bắn result), --phone (user bị trừ), --wait (ms chờ batch ingestion, mặc định 4000).
// PREDICTION_FEE lấy từ env (bắt buộc với lệnh round có --phone), phải trùng giá trị API đang dùng.
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
const shoe = Number(args.shoe), round = Number(args.round), wait = Number(args.wait ?? 4000);
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

/** Giả lập BillingService.charge cho một user (cùng câu SQL, cùng transaction). */
async function simulateCharge(phone) {
  const fee = process.env.PREDICTION_FEE;
  if (!/^[1-9]\d*$/.test(fee ?? "")) throw new Error("Thiếu PREDICTION_FEE (số nguyên > 0, trùng với API)");
  await db.query("BEGIN");
  try {
    const p = await db.query(`SELECT predict_result FROM predictions WHERE prediction_id = $1`, [pid]);
    if (!p.rows[0]?.predict_result) { await db.query("ROLLBACK"); return console.log("× ván không có prediction có pick: không trừ"); }
    const s = await db.query(`SELECT status FROM game_sessions WHERE game_session_id = $1 FOR SHARE`, [gsid]);
    if (s.rows[0]?.status !== "RUNNING") { await db.query("ROLLBACK"); return console.log(`× ván ${s.rows[0]?.status}: không trừ`); }
    const u = await db.query(`SELECT user_id FROM users WHERE phone_number = $1`, [phone]);
    if (!u.rows[0]) throw new Error(`Không có user ${phone}`);
    const ids = [u.rows[0].user_id];
    await db.query(`SELECT user_id FROM users WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR UPDATE`, [ids]);
    const c = await db.query(
      `UPDATE users SET balance = balance - $2::bigint
       WHERE user_id = ANY($1::uuid[]) AND balance >= $2::bigint AND status = 'ACTIVE'
         AND role_id = (SELECT role_id FROM roles WHERE role_name = 'USER')
       RETURNING user_id, balance + $2::bigint AS balance_before, balance AS balance_after`, [ids, fee]);
    if (c.rows.length === 0) { await db.query("ROLLBACK"); return console.log("× không trừ được (thiếu tiền / không ACTIVE / không phải USER)"); }
    const sub = await db.query(
      `INSERT INTO prediction_subscriptions (user_id, prediction_id, fee_amount)
       SELECT u, $2, $3::bigint FROM unnest($1::uuid[]) AS u
       ON CONFLICT (user_id, prediction_id) DO NOTHING RETURNING prediction_subscription_id`, [ids, pid, fee]);
    if (sub.rows.length !== c.rows.length) throw new Error("đã trừ nhưng subscription đã tồn tại → rollback (đúng như API)");
    await db.query(
      `INSERT INTO transactions (user_id, predictions_subscriptions_id, transaction_type, amount, balance_before, balance_after)
       SELECT c.user_id, s.prediction_subscription_id, 'CHARGE', $4::bigint, c.balance_before, c.balance_after
       FROM unnest($1::uuid[], $2::bigint[], $3::bigint[]) AS c(user_id, balance_before, balance_after)
       JOIN prediction_subscriptions s ON s.user_id = c.user_id AND s.prediction_id = $5`,
      [c.rows.map((r) => r.user_id), c.rows.map((r) => r.balance_before), c.rows.map((r) => r.balance_after), fee, pid]);
    await db.query("COMMIT");
    console.log(`✓ trừ ${fee}: ${c.rows[0].balance_before} → ${c.rows[0].balance_after}`);
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
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
      if (!["B", "P"].includes(args.pick)) throw new Error("--pick phải là B hoặc P");
      const ins = await db.query(
        `INSERT INTO predictions (prediction_id, stream_id, game_session_id, predict_result, confidence_score, detail, model_version, reason)
         SELECT $1, g.stream_id, g.game_session_id, $3, 0.5, '{"chosen":null,"rows":[],"history_used":0,"missing_previous":false}'::jsonb, 'sim', 'OK'
         FROM game_sessions g WHERE g.game_session_id = $2
         ON CONFLICT (game_session_id) DO NOTHING RETURNING prediction_id`, [pid, gsid, args.pick]);
      console.log(ins.rows.length ? `✓ tạo prediction giả pick=${args.pick}` : "• ván đã có prediction (giữ nguyên pick hiện có)");
    }
    if (args.phone) await simulateCharge(args.phone);
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
