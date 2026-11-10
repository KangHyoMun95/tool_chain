// apps/api/scripts/sse-client.mjs — CHỈ DÙNG LOCAL: client SSE dòng lệnh để tự kiểm tra PR billing 2 khi portal chưa cập nhật.
// Đăng nhập → POST /realtime/ticket → GET /stream?ticket= → in từng event. Không in token.
//
//   cd apps/api && SIM_PHONE=0900000001 SIM_PASSWORD='...' node scripts/sse-client.mjs --stream <stream_id uuid>   # tham gia (bị trừ tiền)
//   SIM_PHONE=... SIM_PASSWORD='...' node scripts/sse-client.mjs --items "sim lobby|sim cat|s1"                     # chỉ nhận tick (trang danh sách)
//
// Tham số: --api (mặc định http://localhost:4000/api), --stream <uuid> (participate_stream_id), --items "<key_id>,<key_id>",
//   --ticks all|none (mặc định: in tóm tắt mỗi tick), --pings (in cả ping).
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, "");
  if (k === "pings") args.pings = true;
  else args[k] = argv[++i];
}
const api = (args.api ?? "http://localhost:4000/api").replace(/\/$/, "");
const phone = process.env.SIM_PHONE, password = process.env.SIM_PASSWORD;
if (!phone || !password || (!args.stream && !args.items)) {
  console.error("Cần SIM_PHONE, SIM_PASSWORD và --stream <uuid> hoặc --items <key_id,...>");
  process.exit(2);
}
const t = () => new Date().toISOString().slice(11, 23);

async function json(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

const login = await fetch(`${api}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone_number: phone, password }),
});
if (!login.ok) { console.error(`login ${login.status}`, await json(login)); process.exit(1); }
const { access_token } = await login.json();
const auth = { Authorization: `Bearer ${access_token}` };

const me = await fetch(`${api}/auth/me`, { headers: auth }).then(json);
console.log(`${t()} me: role=${me.role} balance=${me.balance} can_participate=${me.can_participate}`);

if (args.stream) {
  const detail = await fetch(`${api}/streams/${args.stream}`, { headers: auth });
  console.log(`${t()} GET /streams/${args.stream} → ${detail.status}`, detail.ok ? "" : JSON.stringify(await json(detail)));
  const cur = await fetch(`${api}/streams/${args.stream}/predictions/current`, { headers: auth });
  console.log(`${t()} GET current → ${cur.status}`, JSON.stringify(await json(cur)));
}

const body = {};
if (args.items) body.items = args.items.split(",").map((s) => s.trim()).filter(Boolean);
if (args.stream) body.participate_stream_id = args.stream;
const tk = await fetch(`${api}/realtime/ticket`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
if (!tk.ok) { console.error(`${t()} ticket ${tk.status}`, JSON.stringify(await json(tk))); process.exit(1); }
const { ticket } = await tk.json();

const sse = await fetch(`${api}/stream?ticket=${encodeURIComponent(ticket)}`, { headers: { Accept: "text/event-stream" } });
console.log(`${t()} GET /stream → ${sse.status} ${sse.headers.get("content-type")}`);
if (!sse.ok) { console.error(JSON.stringify(await json(sse))); process.exit(1); }

// Dùng lại ticket phải bị 401.
const reuse = await fetch(`${api}/stream?ticket=${encodeURIComponent(ticket)}`);
console.log(`${t()} dùng lại ticket → ${reuse.status} (mong đợi 401)`);
await reuse.body?.cancel();

let buf = "";
const decoder = new TextDecoder();
function onBlock(block) {
  let event = "message"; const data = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (event === "ping") { if (args.pings) console.log(`${t()} ping`); return; }
  let ev; try { ev = JSON.parse(data.join("\n")); } catch { return console.log(`${t()} ${event}: ${data.join("\n")}`); }
  const type = ev.type ?? "tick";
  if (type === "tick") {
    if (args.ticks === "none") return;
    const d = ev.data ?? {};
    return console.log(`${t()} tick ${ev.item_id} shoe ${d.stream_shoe} round ${d.stream_round} ${d.status}${d.actual_result ? ` result=${d.actual_result}` : ""}`);
  }
  console.log(`${t()} ${type}:`, JSON.stringify(type === "prediction" ? { shoe: ev.data.shoe, round: ev.data.round, pick: ev.data.pick, reason: ev.data.reason } : ev));
}
for await (const chunk of sse.body) {
  buf += decoder.decode(chunk, { stream: true });
  let i;
  while ((i = buf.indexOf("\n\n")) >= 0) { onBlock(buf.slice(0, i)); buf = buf.slice(i + 2); }
}
console.log(`${t()} server đã đóng kết nối`);
