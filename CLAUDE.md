# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## tool_chain (Predict Market)

Hệ thống bán **dự đoán AI cho các ván game trên livestream**. Crawler thu thập dữ liệu stream và kết quả từng ván. AI dự đoán cho mỗi ván mới. User đang tham gia stream được **tự động trừ điểm** cho mỗi dự đoán và nhận kết quả realtime qua SSE. Dự đoán sai thì được hoàn điểm.

> Đọc kỹ mục **Quy tắc bất biến về tiền** trước khi sửa bất kỳ code nào đụng tới `balance`, `transactions` hoặc `prediction_subscriptions`.

---

## Tech stack

Mọi thành phần dùng **bản stable mới nhất**.

| Thành phần | Công nghệ |
|---|---|
| Monorepo | pnpm workspaces |
| API | NestJS (TypeScript) |
| Migration (schema) | Flyway — công cụ **duy nhất** quản lý schema PostgreSQL |
| ORM | TypeORM — **chỉ dùng để truy vấn**, không quản lý schema |
| Database | PostgreSQL |
| Message bus / cache | Redis (Redis Stream cho event, cache id lobby/category/stream) |
| Auth | JWT, session lưu trên Redis |
| Crawler | Python, quản lý dependency bằng pip (`pyproject.toml`) |
| AI predict | Python (`apps/ai/`, thuật toán pattern-v1 trong `src/patterns/`) |
| Frontend | Next.js (web-admin, web-portal) |
| Hạ tầng | docker-compose (cả local và production) |

Dự án **không viết test tự động**. Không tạo file test, không thêm test framework trừ khi được yêu cầu.

---

## Cấu trúc monorepo

```
tool_chain/
├── apps/
│   ├── api/                 # NestJS — toàn bộ business logic nằm ở đây
│   │   └── src/
│   │       ├── common/stream.util.ts      # helper Redis Stream
│   │       ├── redis/                     # Redis module
│   │       ├── auth/                      # login/refresh, session guard, roles, permission
│   │       ├── users/                     # đổi status user (có kiểm tra phạm vi)
│   │       ├── config/                    # validate env lúc khởi động
│   │       ├── cli/                       # create-user / create-host
│   │       ├── ingestion/                 # luồng ghi DB theo batch: tick-persister + IngestionService điều phối
│   │       ├── lobbies/ categories/ streams/ stream-information/ game-sessions/   # mỗi bảng một service upsert
│   │       ├── billing/                   # trừ tiền (charge trong transaction prediction), settlement (settle:requests), job hủy ván, sweeper
│   │       ├── predictions/               # luồng dự đoán: trigger (ticks → predict:requests / ai:results), consumer predict:results → DB + SSE, GET current
│   │       ├── ticks/                     # bản cũ, giữ để so sánh, KHÔNG đăng ký trong AppModule
│   │       └── realtime/                  # SSE: ticket một lần, ConnectionRegistry (participant trong RAM + stream_connections), hub tick public
│   ├── crawl-agent/         # Python — crawler, publish event vào Redis
│   ├── ai/                  # Python — service AI predict (src/patterns = service; src/ai = thử nghiệm, KHÔNG dùng), chỉ ĐỌC DB
│   ├── web-admin/           # Next.js — CHỈ UI (Host/Admin)
│   └── web-portal/          # Next.js — CHỈ UI (User)
├── db/migrations/           # Flyway SQL migration (nguồn sự thật của schema)
├── packages/shared/src/     # type/contract dùng chung TS
│   ├── realtime.ts          # schema event realtime + RedisKeys
│   ├── ai.ts                # contract 3 stream dự đoán (predict:requests, ai:results, predict:results)
│   └── settle.ts            # contract stream settle:requests (api → api, hoàn tiền)
├── docker-compose.yml
└── .env
```

### Ranh giới trách nhiệm
- **`web-admin`, `web-portal`**: chỉ có UI. Không đặt business logic, không tính tiền, không lọc quyền ở client.
- **`api`**: nơi duy nhất được đổi `balance`, tạo transaction và quyết định ai nhận event nào.
- **`crawl-agent`**: chỉ thu thập và publish. Không ghi DB trực tiếp.
- **`ai`**: chỉ ĐỌC DB (`game_sessions`, để dựng lại bảng đếm) và ghi Redis của riêng nó + stream `predict:results`. **Không** ghi bảng nghiệp vụ nào trong DB, không đổi `balance`, không ghi `prediction_subscriptions` hay `transactions`. AI trả kết quả về `api` qua Redis Stream; `api` lưu DB và đẩy SSE (billing sau này cũng nằm ở `api`). `api` là nơi duy nhất sinh `key_id`, `game_session_id` và ghi DB.
- **Lưu ý độ trễ:** AI **không** chờ DB: `api` phát `predict:requests` ngay khi thấy tick `IN_PROGRESS` đầu tiên của ván và đưa kết quả các ván trước qua `ai:results` / `recent:*` (Redis), nên không phụ thuộc batch ghi DB (tối đa 3s). DB chỉ dùng để dựng lại bảng đếm lúc AI khởi động.
- Auth: xem mục **Auth & bảo mật** bên dưới.

### Contract dùng chung
`apps/crawl-agent/contract.py` và `packages/shared/src/realtime.ts` mô tả **cùng một schema event**. Sửa một bên thì **bắt buộc** sửa bên kia trong cùng một commit.

Tương tự `packages/shared/src/ai.ts` và `apps/ai/src/patterns/contract.py` mô tả **cùng một schema** cho 3 stream dự đoán (`predict:requests`, `ai:results`, `predict:results`, `schema_version: 1`, mỗi entry một field `payload` là JSON), kèm namespace UUIDv5 của `prediction_id`. Cùng quy tắc: sửa một bên thì sửa bên kia trong cùng commit.

---

## Luồng dữ liệu

### Luồng 1 — Kết quả từ crawler (đã có)
```
crawl-agent ──publish──► Redis Stream ──► api consumer
                                             ├─► realtime.hub  → SSE xuống web-portal (lọc theo key_id; tick / round_result CHỈ ĐI TỚI)
                                             └─► tick-persister → ghi DB theo batch (MAX_BATCH dòng hoặc MAX_WAIT_MS, xem ingestion/ingestion.constants.ts)
```

### Phiên và kết quả CHỈ ĐI TỚI (luồng đẩy xuống portal)
Tick muộn của ván trước (vd `SUMMARY_RESULT` của round N−1) thường đến **sau** tick đầu của round N. Portal **không bao giờ được lùi phiên**.
- **Hàm so vị trí dùng chung** (`packages/shared/src/realtime.ts`): `Position {shoe, round}`, `ShoeContext {current, previous}`, `comparePosition(incoming, ref, ctx)` → -1 / 0 / 1, `advanceShoe(ctx, shoe)`, `payloadPosition(data)`. Cùng shoe ⇒ chỉ so round (**không** có quy tắc "round tụt = reset": round chỉ reset khi đổi shoe). Khác shoe ⇒ so hạng: shoe chưa thấy = 3 (shoe mới; **không** giả định số shoe tăng dần), `current` = 2, `previous` = 1, shoe cũ khác = 0. Hub, ShoeObserver và portal dùng **chung** hàm này; không tự viết lại logic so vị trí.
- **Hub** (`realtime/realtime.hub.ts`), state trong RAM theo `key_id` (ShoeContext, con trỏ phiên, con trỏ kết quả, `lastTick`), cập nhật cho **mọi** tick kể cả stream không ai xem, không nạp sẵn lúc khởi động (tick đầu tiên khởi tạo). Trong một tick: xét con trỏ phiên trước, rồi mới xét kết quả.
  - Event `tick`: vị trí ≥ con trỏ phiên ⇒ cập nhật (`advanceShoe` nếu shoe mới) và đẩy; cũ hơn ⇒ **không đẩy** (kể cả status, total_B/P/T, player_count, time).
  - Event `round_result` (`RealtimeRoundResult {type, item_id, stream_id, shoe, round, result, ts}`): `actual_result` là B/P/T **và** vị trí **mới hơn** con trỏ kết quả ⇒ đẩy một lần; còn lại bỏ (không lấy kết quả ván lùi, không đẩy trùng). Kết quả ván bị bỏ qua được portal lấy lại từ DB khi refetch lịch sử.
  - Snapshot khi mở kết nối: `lastTick` hub đã chấp nhận; hub chưa có state (vừa restart) mới dùng `latest:{key_id}` (portal tự chặn nếu là ván cũ).
  - Tick không đọc được shoe/round: chuyển tiếp như cũ, không lọc, không `round_result`.
  - **Tự phục hồi:** stream chỉ nhận tick cũ hơn liên tục trong `HUB_STALE_RESET_MS` (mặc định 60000) ⇒ xóa state của stream (cả hai con trỏ), log WARN, tick kế tiếp khởi tạo lại. Giữ tối đa `HUB_STATE_MAX` (1000) stream, quá thì bỏ stream lâu không có tick nhất (LRU theo thời gian tick, log WARN).
  - Việc lọc **chỉ** áp dụng cho SSE: TickPersister (group `persist`) và PredictTriggerService (group `predict-trigger`) đọc `ticks` độc lập, nhận đủ mọi tick.
- **Portal** (`useLiveItems`): bộ theo dõi vị trí cho mỗi item, sống qua các lần kết nối lại; tick cũ hơn phiên đang hiển thị ⇒ bỏ; `round_result` không mới hơn kết quả đã nhận ⇒ bỏ. Trạng thái trực tiếp (status, tổng B/P/T, số người chơi, time) chỉ lấy từ `tick` đã qua bộ lọc; kết quả / lịch sử / đúng-sai **chỉ** lấy từ `round_result`. `NEXT_PUBLIC_SHOW_STREAM_DEBUG=true` ⇒ `console.debug` khi bỏ tick (vị trí tick và vị trí đang hiển thị), khi nhận `round_result`, `prediction`, và khi đổi phiên.

### Luồng 2 — Dự đoán
Đã làm (chưa có billing, xem mục **Luồng dự đoán AI** bên dưới):
```
crawler → Redis "ticks" → api (PredictTriggerService)
   ├─ tick IN_PROGRESS đầu tiên của ván → predict:requests ─► AI ─► predict:results ─► api (PredictResultConsumer)
   └─ tick đầu tiên có actual_result    → recent:* + ai:results ─► AI (cập nhật bảng đếm)
                                                      api: kiểm tra hạn chót → lưu predictions (DB) → SSE public
```
Billing (xem mục **Billing** bên dưới):
```
prediction mới có pick → trừ tiền participant (cùng transaction với INSERT prediction)
ingestion ghi result + FINISHED (commit) ─┐
job hủy ván RUNNING quá X phút → CANCELLED ┼─► settle:requests ─► SettlementConsumer → hoàn tiền (refunded_at IS NULL)
sweeper (mỗi phút, gửi bù tín hiệu bị mất) ┘
```
Participant = kết nối SSE tham gia trong `ConnectionRegistry` (xem **Participants & SSE**); pick chỉ giao cho user đã trừ.
Portal: xem **Stream detail realtime** (kết nối SSE) và **Dữ liệu web-portal** (khóa thẻ bàn).

### key_id, payload crawler & ingestion
- `key_id` = `<lobby_name>|<category_name>|<stream_name>` đã chuẩn hóa. **Chỉ là khóa cache / phòng realtime (`item_id` của tick), KHÔNG lưu DB** (không có cột `streams.key_id`). Tên chứa `|` bị coi là tick lỗi.
- **Chuẩn hóa tên** (`normalizeName()` ở `common/normalize.ts`, `normalize_name()` ở `contract.py`): trim, gộp khoảng trắng liên tiếp thành 1, lowercase. **Chỉ để chống trùng, không lưu**; DB lưu tên đã trim của lần gặp đầu. Chống trùng bằng unique index trên biểu thức (không có cột `*_norm`), biểu thức SQL phải khớp `normalizeName()`: lobbies `(norm(lobby_name))`, categories `(lobby_id, norm(category_name))`, streams `(category_id, norm(stream_name))`. Upsert: `INSERT ... ON CONFLICT (<biểu thức>) DO NOTHING`, rồi SELECT lại id.
- Cache id (RAM + Redis, ghi sau khi DB commit): `lobby:{norm}`, `category:{lobby_id}:{norm}`, `stream:{key_id}`. Chỉ chạm DB khi cache miss. Mọi thứ bên trong sau đó dùng **`stream_id`**.
- **Payload crawler** (`CrawlPayload`, `contract.py` ↔ `realtime.ts`), gửi liên tục, nhiều lần cho cùng một ván: `lobby_name, category_name, stream_id, stream_name, stream_shoe, stream_round, streamer_id, player_count, player_value, status, actual_result, total_B/P/T`.
  - **Ghi DB**: tên lobby/category/stream, `stream_shoe` (số nguyên như `stream_round` → cột `game_sessions.road_shoe`), `stream_round` (số nguyên → `game_sessions.road_count`), `streamer_id` (→ `stream_information`), `actual_result` (→ `game_sessions.result`).
  - **Chỉ hiển thị** (chỉ qua realtime/SSE, không ghi DB): `player_count, player_value, status, total_B/P/T`, `streamer_name`, `streamer_country` và 5 trường time `deliver_time, timestamp, stamp_time, round_start_time, repaint_time` (`str | None`, optional; crawler gửi qua Redis Stream nên không có DTO; ingestion bỏ qua, không có cột/migration). `stream_id` là id text phía nguồn, bỏ qua. Ingestion không đọc `status` của payload để suy ra trạng thái.
- **Khóa duy nhất của game_session** là `(stream_id, road_shoe, road_count)` (round có thể reset khi đổi shoe nên `(stream_id, road_count)` không đủ). `stream_round` của payload = `road_count`, `stream_shoe` của payload = cột `road_shoe` (payload đặt tên `stream_*`, cột DB đặt tên `road_*`); `stream_shoe` cũng là số nguyên (nhận number hoặc chuỗi số). `stream_shoe` hoặc `stream_round` thiếu / không phải số nguyên ⇒ tick bị bỏ qua cả phần ghi DB (log, tối đa 1 lần/phút cho mỗi stream + lý do); luồng realtime không bị ảnh hưởng.
- **`game_session_id`** = UUIDv5 xác định từ `key_id + "|" + road_shoe + "|" + road_count` với namespace cố định (`game-sessions/game-session-id.ts`, không được đổi). Cùng ván luôn ra cùng ID. Insert `ON CONFLICT DO NOTHING`, không set `status` (mặc định `RUNNING`; trừ việc set `FINISHED` khi có result, status của stream / game_session do job khác quản lý). Gộp trong batch theo `(stream, road_shoe, road_count)`.
- **Log quan sát shoe** (`ingestion/shoe-observer.ts`, chỉ log, không đổi hành vi ghi), dùng `comparePosition`: tick cũ hơn vị trí lớn nhất ⇒ không log, không cập nhật; INFO khi shoe của stream đổi (kèm ghi chú nếu shoe đó đã thấy trước đó). Không còn WARN "round giảm" (tick muộn là bình thường); WARN về vị trí chỉ có ở cơ chế tự phục hồi của hub. Trạng thái gần nhất lưu Redis `stream_last:{key_id}` (hash shoe/round/prev_shoe) và `stream_shoes:{key_id}` (set shoe đã thấy), TTL 24h.
- **Ghi `result` và set `FINISHED` trong cùng một câu UPDATE** (atomic): `UPDATE game_sessions SET result = ?, status = 'FINISHED' WHERE game_session_id = ? AND result IS NULL AND status <> 'CANCELLED'`. **Không bao giờ ghi đè `result`**: tick báo result khác result đã lưu → log cảnh báo, giữ nguyên. Ván `CANCELLED` nhận result → không cập nhật, log WARN (kèm stream, shoe, round). Đây là chuyển trạng thái **duy nhất** ingestion được làm (RUNNING → FINISHED); `FINISHED` là trạng thái cuối, không được đổi lại; các chuyển trạng thái khác (vd `CANCELLED`) do job kiểm tra status quản lý.
- `stream_information`: một dòng cho mỗi stream (unique `stream_id`), chỉ ghi khi `streamer_id` đổi.
- Batch: gộp tick theo `(stream, stream_round)` giữ bản mới nhất (giữ result nếu có), ghi theo thứ tự lobbies → categories → streams → stream_information → game_sessions trong **một DB transaction**, chỉ `XACK` sau khi commit. Tick lỗi validate: log, bỏ qua (vẫn XACK). Lỗi DB: giữ buffer, thử lại.

### Luồng dự đoán AI (pattern-v1)
- **3 Redis Stream** (contract ở `packages/shared/src/ai.ts` ↔ `apps/ai/src/patterns/contract.py`, `MAXLEN ~ 10000`):
  - `predict:requests` — api ghi, AI đọc: `{game_session_id, stream_id, key_id, shoe, round, requested_at}`.
  - `ai:results` — api ghi, AI đọc: `{game_session_id, stream_id, shoe, round, result B|P|T, received_at}`.
  - `predict:results` — AI ghi, api đọc: `{prediction_id, game_session_id, stream_id, key_id, shoe, round, pick B|P|null, confidence 0–1, chosen, detail[], history_used, missing_previous, reason, model_version, created_at}`. `reason` ∈ `OK | NOT_ENOUGH_HISTORY | NO_ELIGIBLE_SUFFIX`; `pick` khác null khi và chỉ khi `reason = OK`. `prediction_id` = UUIDv5(`PREDICTION_NAMESPACE`, `game_session_id`), không đổi namespace.
- **Redis key và chủ sở hữu (chỉ chủ sở hữu được ghi):**
  - api: `round_status:{game_session_id}` (status mới nhất, **chỉ tiến** IN_PROGRESS < DONE < GET_RESULT < SUMMARY_RESULT, TTL 1h), `predict_req:{game_session_id}` (cờ đã phát yêu cầu, TTL 1h), `recent:{stream_id}:{shoe}` (HASH round → result B/P/T, `HSETNX` nên không ghi đè, TTL 24h).
  - AI: `ai:counts:{stream_id}` (HASH `"<pattern>|<B/P>"` → số lần), `ai:counted:{stream_id}:{shoe}` (SET game_session_id đã đếm, TTL 48h).
  - Các bước nhiều lệnh là **script Lua** (atomic): `advanceRoundStatus`, `recordResult` (`HSETNX` + `EXPIRE` + `XADD ai:results`, chỉ XADD khi HSETNX thêm mới), `requestPrediction` (`SET NX EX` + `XADD predict:requests`), và `count` phía AI (`SADD` đã đếm + `HINCRBY`).
- **Consumer group** (tên consumer cố định, đọc PEL trước): api `predict-trigger` (trên `ticks`) và `predict-persist` (trên `predict:results`); AI `ai-counter` (trên `ai:results`) và `ai-predictor` (trên `predict:requests`). Tạo group ở `$` (tạo ở `0` sẽ replay lịch sử). `predict-trigger` bỏ qua **chỉ bước phát `predict:requests`** với tick cũ hơn 30s (tính theo thời gian trong ID message của stream); `round_status`, `recent`, `ai:results` vẫn xử lý khi replay.
- **Hạn chót:** api chỉ lưu và đẩy prediction khi `round_status` của ván vẫn là `IN_PROGRESS` (không tồn tại cũng coi là quá hạn). Quá hạn ⇒ log INFO JSON `{"event":"late_prediction", key_id, stream_id, shoe, round, status, age_ms}` (dùng để đếm tần suất), không lưu. AI cũng bỏ qua request khi ván đã `DONE` trở đi.
- **Thuật toán pattern-v1** (hàm thuần `choose_pick` trong `apps/ai/src/patterns/pattern.py`, dùng chung bởi service và backtest): chuỗi của một (stream, shoe) sắp theo round, **bỏ T**, không nối qua shoe; bảng đếm tách theo từng stream (gộp mọi shoe của stream). Với đuôi k = 3..10 của tối đa 10 kết quả gần nhất trong shoe hiện tại: `total = count_B + count_P`; đuôi hợp lệ khi `total ≥ 3` và `count_B ≠ count_P`. Chọn % của kết quả nhiều hơn cao nhất → `total` lớn hơn → k ngắn hơn. `confidence` = % đó (0–1). Dưới 3 kết quả ⇒ `NOT_ENOUGH_HISTORY`; không có đuôi hợp lệ ⇒ `NO_ELIGIBLE_SUFFIX` (đều `pick = null`). Cập nhật bảng đếm khi có kết quả B/P (T không đếm): với mỗi k có đủ k kết quả ngay trước trong cùng shoe thì `+1` cho `"<k kết quả trước>|<kết quả>"`.
- **Nguồn history của AI** (`AiService._history`, `apps/ai/src/patterns/service.py`): giữ vòng chờ round − 1 trong `recent:{stream_id}:{shoe}`; sau đó nếu HASH vẫn thiếu **bất kỳ** round nào trong 1..round−1 (vd Redis restart giữa shoe) ⇒ đọc thêm (read-only, `asyncio.to_thread`) `game_sessions` có result của đúng `(stream_id, road_shoe)`, `road_count < round`, `created_at` trong `AI_HISTORY_DB_WINDOW_HOURS` giờ gần nhất (mặc định 6; số shoe có thể lặp lại giữa các ngày). Gộp theo round (HASH ưu tiên) rồi `history_before` bỏ T, lấy 10 phần tử cuối. **Không** ghi ngược vào HASH. Log dự đoán kèm `history=redis` | `history=redis+db (+n round)` | `history=redis (db lỗi)`.
- **AI dựng lại bảng đếm** từ DB (game_sessions `FINISHED`) lúc khởi động, trước khi consume (restart để dựng lại). `python main.py verify` so Redis với đếm brute-force từ DB. Backtest: `python main.py backtest` (xem `apps/ai/README.md`; kết quả đo gần nhất cho thấy pattern-v1 chưa hơn baseline và `confidence` không phản ánh tỉ lệ đúng, nên chưa dựa vào nó để thu phí/quảng cáo).
- **Lưu DB:** bảng `predictions` (V9): `predict_result` cho phép NULL (CHECK B/P), `detail jsonb` = `{chosen, rows, history_used, missing_previous}`, `model_version`, `reason`; CHECK: có `predict_result` khi và chỉ khi `reason = 'OK'`, `confidence_score` trong 0..1. Trước khi insert, api `INSERT game_sessions ... ON CONFLICT DO NOTHING` trong cùng transaction (khóa ngoại; ván có thể còn trong batch của ingestion), rồi `INSERT predictions ... ON CONFLICT (game_session_id) DO NOTHING RETURNING`; chỉ khi thêm dòng mới mới đẩy SSE.
- **SSE prediction:** event `type: "prediction"` (`RealtimePrediction` ở `packages/shared`, không chứa `detail`) **không đi kênh public**. Sau khi transaction (insert + trừ tiền) commit, `PredictionDeliveryService`: pick != null ⇒ chỉ gửi lên kết nối tham gia của user có `prediction_subscriptions` chưa giao (`delivered_at IS NULL`, đọc từ DB nên xử lý lại message vẫn giao đúng người) rồi set `delivered_at`; pick = null ⇒ gửi cho mọi kết nối tham gia của stream. Tick có `type: "tick"` (client coi event thiếu `type` là tick) và vẫn public theo `key_id`. Pick của ván đã kết thúc chỉ lộ qua API đọc đã lọc `FINISHED` (history, stats, stream-stats).
- **API đọc:** `GET /api/streams/:id/predictions/current` — prediction mới nhất của stream (theo thời điểm tạo) kèm `shoe`, `round`, `confidence` 0–1, không có `detail`, có `locked`; phạm vi nhìn thấy như `GET /streams/:id`; 404 khi chưa có prediction. Ván còn `RUNNING` có pick: chỉ user đã bị trừ tiền cho ván đó nhận pick (`locked: false`, và set `delivered_at` nếu chưa có), người khác (kể cả HOST / ADMIN, user vào giữa ván) nhận `{ locked: true, prediction_id, game_session_id, stream_id, shoe, round, created_at }` (portal: "Dự đoán từ ván sau"). Ván `FINISHED` / `CANCELLED` hoặc pick = null ⇒ công khai. Portal phải so `(shoe, round)` với ván đang xem.

### Billing (trừ tiền / hoàn tiền) — `apps/api/src/billing/`
- **Phí:** env `PREDICTION_FEE` (số nguyên > 0, bắt buộc; thiếu / sai thì API dừng). `fee_amount` lưu giá lúc trừ. Chỉ role **USER** bị trừ.
- **Trừ tiền** (`BillingService.charge`, gọi trong transaction của `PredictionsService.insertFromResult`): chỉ khi INSERT prediction thêm dòng MỚI và `pick != null`. Snapshot user_id DISTINCT của participant (`ConnectionRegistry.participantUserIds`) lấy ngay trước transaction (vào sau thời điểm này ⇒ không trừ, không có pick ván đó). Thứ tự: `SELECT ... FROM game_sessions ... FOR SHARE` (ván phải còn `RUNNING`, nếu không thì không trừ — để settlement không thể chạy xong trước khi subscription commit) → khóa users `ORDER BY user_id FOR UPDATE` → `UPDATE users ... WHERE balance >= fee AND status = 'ACTIVE' AND role USER RETURNING` → `prediction_subscriptions` (`ON CONFLICT DO NOTHING`, số dòng phải bằng số user bị trừ, lệch ⇒ ném lỗi rollback) → `transactions CHARGE`. Participant không trừ được trả về `rejected` (`INSUFFICIENT_BALANCE` / `NOT_ALLOWED`); sau commit: `INSUFFICIENT_BALANCE` ⇒ event `insufficient_balance` rồi đóng kết nối (close_reason `INSUFFICIENT_BALANCE`), `NOT_ALLOWED` ⇒ đóng `SESSION_REVOKED`.
- **Cổng chặn (402 `{ code: "INSUFFICIENT_BALANCE" }`, `BillingService.assertCanParticipate`, so sánh trong SQL):** `GET /api/streams/:id` với USER không đủ điểm, và `POST /api/realtime/ticket` có `participate_stream_id`. `GET /api/auth/me` trả `can_participate` (USER, ACTIVE, `balance >= PREDICTION_FEE`, tính trong SQL) để portal khóa thẻ bàn — portal không tự so balance với phí.
- **Settlement:** stream `settle:requests` (`packages/shared/src/settle.ts`, field `payload` = JSON `{schema_version: 1, game_session_id, reason: FINISHED|CANCELLED}`, `MAXLEN ~ 10000`), group `settle`, `SettlementConsumer` (PEL trước rồi `>`, timeout mỗi tin, XACK sau commit). **Chỉ tạo message bằng `buildSettleMessage()` và chỉ đọc bằng `parseSettleMessage()`**, không tự ghép field; nơi gửi duy nhất là `SettleQueue` (ingestion, job hủy ván, sweeper gọi qua nó), message được parse lại trước khi XADD (sai ⇒ log ERROR tại chỗ, không XADD). Settlement chỉ cần `game_session_id` + `reason`, phần còn lại đọc từ DB. Consumer gặp message sai contract ⇒ log ERROR kèm toàn bộ field, chép sang `settle:dead` (`MAXLEN ~ 1000`, field `source_id, error, fields, dead_at`) rồi mới XACK (XADD `settle:dead` lỗi thì không XACK, thử lại). `BillingService.refund`: một transaction — chọn subscription `refunded_at IS NULL` của ván `CANCELLED` hoặc `FINISHED` có `result <> predict_result` (kết quả `T` luôn được hoàn) `FOR UPDATE OF ps` → khóa users theo `user_id` tăng dần → một câu CTE: set `refunded_at`, cộng `fee_amount`, ghi `transactions REFUND` (balance_before / after từ RETURNING). Hoàn cho cả user đã DEACTIVE / DELETED. Idempotent: chạy lại không hoàn trùng.
- **`HAS_REFUND`** (env `"true"|"false"`, mặc định `true`): luồng settlement (ingestion / job hủy ván / sweeper → `settle:requests` → `SettlementConsumer`) chạy như nhau ở cả hai giá trị; chỉ bước cuối của `BillingService.refund()` khác: `true` ⇒ hoàn tiền; `false` ⇒ set `prediction_subscriptions.refund_waived_at = now()` (V12) cho các subscription đủ điều kiện, không đổi balance, không ghi transactions (WARN lúc khởi động). Subscription "chờ quyết định" = `refunded_at IS NULL AND refund_waived_at IS NULL` (CHECK: không thể vừa hoàn vừa bỏ hoàn); mọi truy vấn chọn subscription để hoàn (refund, sweeper, job hủy ván) PHẢI lọc cả hai cột. Bật lại `true` không hoàn bù ván đã bỏ hoàn; quyết định theo giá trị cờ **lúc settlement xử lý** (tín hiệu còn trong hàng đợi lúc đổi cờ sẽ theo giá trị mới).
- **Nguồn tín hiệu:** ingestion gửi sau khi batch COMMIT cho các ván vừa được set result + FINISHED (RETURNING của câu UPDATE; lỗi Redis chỉ log, sweeper gửi bù); câu UPDATE đó cũng set `game_sessions.ended_at`. **Job hủy ván** (`GameSessionCancelJob`, mỗi phút, **chỉ chạy khi `GAME_SESSION_CANCEL_ENABLED=true`**, mặc định tắt): `UPDATE ... SET status = 'CANCELLED', ended_at = now()` cho ván `RUNNING`, `result IS NULL`, `created_at` cũ hơn `GAME_SESSION_CANCEL_AFTER_MINUTES` (mặc định 5), tối đa 1000 ván / lần, `FOR UPDATE SKIP LOCKED`; chỉ gửi settlement cho ván có subscription chưa hoàn. **Sweeper** (`SettleSweeperJob`, mỗi phút): ván FINISHED / CANCELLED hơn 2 phút (`COALESCE(ended_at, created_at)`) còn subscription đủ điều kiện hoàn, subscription tạo trong 7 ngày; `SET settle_req:{gsid} NX EX 300` trước khi XADD (SET thất bại thì bỏ qua). Có log WARN của sweeper nghĩa là có tín hiệu bị mất.
- Job dùng `setInterval` (không thêm `@nestjs/schedule`: bản hiện tại đòi Node >= 20.19 và kéo theo thay đổi lockfile của web-admin).

### Stream detail realtime (web-portal `/streams/[streamId]`)
- **Kết nối SSE** (`use-live-items.ts`): xin ticket (`POST /realtime/ticket`, `src/lib/api/realtime.ts`) rồi mở `EventSource(/stream?ticket=)`. Trang chi tiết xin ticket với `participate_stream_id` (= tham gia, bị trừ tiền mỗi dự đoán có pick, kể cả tab nền); `items` chỉ để nhận tick (không tham gia). Ticket dùng một lần nên lỗi / server đóng ⇒ đóng EventSource và tự xin ticket mới với backoff 1s → 15s (`reconnectCount` tăng khi mở lại được). 401 (không làm mới được token) ⇒ chưa đăng nhập; 400/403/404 ⇒ `revoked`; 402 `INSUFFICIENT_BALANCE` hoặc event `insufficient_balance` ⇒ `insufficient` (dừng hẳn) và trang chi tiết chuyển về `/categories/:id?notice=insufficient_balance` (danh sách hiện thông báo hết điểm rồi bỏ query). `GET /streams/:id` trả 402 (vào bằng link trực tiếp) ⇒ màn "Không đủ điểm".
- **`stream_id` gắn vào event SSE:** `RealtimeHub.withStreamId()` thêm `stream_id` (UUID DB) vào tick từ cache `stream:{key_id}` (`RealtimeTick` ở `packages/shared`); cache miss ⇒ `null`, **không upsert** (ingestion tạo stream và ghi cache sau khi commit). `CacheWarmup` nạp sẵn cache này từ DB lúc API khởi động. Portal subscribe theo `key_id` (`buildKeyId` ở `packages/shared`, api re-export) và chấp nhận tick nếu `stream_id` khớp HOẶC `null`.
- **Trạng thái ván** (`StreamStatus`): `IN_PROGRESS` (Đang tiến hành), `DONE` (Hoàn tất tiến trình), `GET_RESULT` (Nhận kết quả), `SUMMARY_RESULT` (Tổng kết). Giá trị lạ ⇒ hiển thị trung tính + `console.warn`. Ván hiện tại = `(stream_shoe, stream_round)`; sang round mới ⇒ khung kết quả về trạng thái chờ.
- **Kết quả ván = event `round_result`** (hub phát một lần, chỉ đi tới; xem **Phiên và kết quả CHỈ ĐI TỚI**). Portal không tự dò `actual_result` trong tick. Kết quả giữ theo `(shoe, round)`, chỉ hiện ở khung dự đoán khi khớp phiên đang hiển thị.
- **Khung dự đoán** (`PredictionPanel`, `use-prediction.ts`): workflow của một ván **chỉ bắt đầu khi nhận `IN_PROGRESS` của ván đó**. SSE không kết nối ⇒ OFFLINE / MẤT KẾT NỐI; chưa thấy `IN_PROGRESS` ⇒ radar "ĐANG NẠP DỮ LIỆU"; có `IN_PROGRESS` ⇒ radar "ĐANG PHÂN TÍCH" trong lúc lấy dự đoán **đúng một lần cho mỗi ván** (nhiều `IN_PROGRESS` liên tiếp không gọi lại; lỗi thì lần `IN_PROGRESS` kế tiếp thử lại) rồi hiện dự đoán; thanh trạng thái `predict_status.png` luôn ở đầu khung (nhãn trạng thái nằm trong ảnh), khối `predict_and_rate.gif` ở cuối khung chỉ hiện khi có dự đoán (pick trong ô tròn (B đỏ, P xanh dương), phần trăm ở ô dưới, hiện từ trong ra ngoài bằng clip-path, ký tự pick to / nhỏ tuần hoàn; tắt khi prefers-reduced-motion), còn lúc nạp / phân tích chỉ có thanh trạng thái + radar; có `actual_result` ⇒ `PredictionPanel` vẫn tính kết quả thắng / thua / hòa (`tone`); kết quả **đến trong lúc đang xem** một ván có pick ⇒ `ResultOverlay` hiện `win.png` / `loss.png` / `draw.png` (`public/images`) giữa màn hình ~2.6s (nền tối nhẹ; máy bật giảm chuyển động chỉ mờ vào / ra), mỗi ván một lần (win: từ trong ra nhanh, dứt khoát; loss: từ trên xuống; draw: từ trong ra nhẹ nhàng; vào trang lúc ván đã có kết quả thì không hiện; win / loss cần có pick, draw (kết quả T) hiện cả khi pick = null); thua nền đỏ đậm, hòa `T` xám, thắng không đổi nền; không còn hiệu ứng thắng (`winner.gif` đã xóa) và hiệu ứng thua (rung / chớp / nhiễu / gạch chéo) đã gỡ; khung không hiện chữ kết quả (kết quả xem ở bảng / lịch sử); khối `predict_and_rate.gif` nằm sát đáy khung; sang ván mới ⇒ lặp lại.
- **Prediction:** `PredictionSource` (`src/lib/prediction-source.ts`) chọn bằng `NEXT_PUBLIC_PREDICTION_SOURCE=live|mock` (mặc định `live`, đọc lúc build). `live`: event SSE `prediction` (chỉ tới khi user đã bị trừ tiền cho ván, hoặc AI không dự đoán) vào `predictionStore` (`src/lib/prediction-store.ts`); `getPrediction(stream, shoe, round, signal)` chờ event khớp `(shoe, round)`, đồng thời gọi `/predictions/current` một lần (vào giữa ván / tải lại). `current` trả `locked: true` ⇒ `Prediction.locked` ⇒ khung hiện "DỰ ĐOÁN TỪ VÁN SAU" (không tô thắng / thua); locked không đè dự đoán thật đã có trong store. `confidence` API 0–1 được đổi sang %. `pick = null` ⇒ "Chưa đủ dữ liệu dự đoán" (không có đúng/sai); hết `IN_PROGRESS` mà chưa có dự đoán ⇒ "Chưa có dự đoán cho ván này" (về muộn bị API bỏ). `mock`: giả vờ ~2.5s, giá trị xác định từ `(stream, shoe, round)`, chỉ `B`/`P`, để thử khi không chạy AI. Kết quả `T` ⇒ "Hòa" (chưa tính đúng/sai; quy tắc sẽ chốt khi làm settlement).
- **Lịch sử và dự đoán:** API lịch sử `game-sessions` trả kèm `pick` (B/P, null khi chưa có dự đoán / AI không dự đoán) và `confidence` (0–1) của từng ván (`LEFT JOIN predictions`); ô lịch sử dùng `pick` này, ván vừa kết thúc chưa kịp refetch thì lấy tạm từ phiên (SSE / current); chưa biết ⇒ "—".
- **Thống kê dự đoán:** `GET /api/streams/:id/predictions/stats` (phạm vi nhìn thấy như `GET /streams/:id`; luôn 200). Trả `{ shoe, wins, losses, draws, win_rate, win_streak, shoes[] }`. Chỉ xét dự đoán **có pick** của ván `FINISHED` có result; **thắng** = `pick = result`; kết quả `T` là hòa (không tính thắng / thua); ván AI không dự đoán không tính. `shoe` = shoe của dự đoán mới nhất của stream (shoe hiện tại). `wins/losses/draws/win_rate` **chỉ của shoe hiện tại** (`win_rate = wins / (wins + losses)`, 0–1, null khi shoe đó chưa có ván nào chấm xong). `shoes` = tỷ lệ thắng của từng shoe **quá khứ** (không gồm shoe hiện tại) trong `STATS_SHOES` (10) shoe gần nhất có ván chấm xong, ít hơn thì trả đúng số đang có (cũ → mới) cho biểu đồ "Tỷ lệ win theo phiên" (UI gọi shoe là "phiên"; trục Y 0–100); thẻ "Tỷ lệ win hiện tại" không có phụ đề. `win_streak` = số dự đoán thắng liên tiếp từ ván mới nhất (xuyên shoe, trong `STATS_STREAK_WINDOW` = 100 dự đoán), bỏ qua ván hòa, dừng ở ván thua. Số shoe có thể lặp lại giữa các ngày; hiện coi cùng số shoe là cùng một shoe. **Chuỗi thắng ở trang chi tiết dùng API riêng** `GET /api/streams/:id/predictions/best-streak` (phạm vi như `stats`; luôn 200) → `{ shoe, best_streak }` = chuỗi thắng **dài nhất** trong shoe hiện tại (cùng định nghĩa thắng / hòa; 0 khi chưa có dự đoán); thẻ hiện nhãn "Chuỗi thắng tốt nhất" (`win_streak` của `/stats` không còn được portal dùng). Ở danh sách bàn nhãn là "Chuỗi tốt gần đây" (`win_streak` của `stream-stats`, xem dưới). Portal (`usePredictionStats`, gọi cả `/stats` và `/best-streak`) fetch khi vào trang / SSE phục hồi, refetch sau ~4.5s khi có kết quả và ~0.5s khi có event `prediction`.
- **Streamer + bảng kết quả** (`StreamerBoard`): tên streamer (`streamer_name`, dự phòng parse `streamer_id` "Tên/Quốc gia/Mã" của API) + cờ emoji theo quốc gia (`src/lib/country-flag.ts`, tên nước tiếng Anh → cờ; Windows không vẽ emoji cờ); bảng hạt cầu 6 hàng × 10 cột (60 ván gần nhất của shoe, điền theo cột, B đỏ / P xanh dương / T xanh lá); hàng pill `B: n · P: n · T: n` lấy trực tiếp từ `total_B/P/T` của message mới nhất (số liệu, không phải tỷ lệ; thiếu ⇒ "—"; không gọi API).
- **Lịch sử ván:** `GET /api/streams/:id/game-sessions?shoe=&page=&limit=` (chỉ ván `FINISHED`, round giảm dần; bỏ `shoe` ⇒ shoe của ván mới nhất; response `{ shoe, items, total, page, limit }`; phạm vi nhìn thấy như `GET /streams/:id`). Portal lấy 60 ván (cho bảng) và hiện 10 ô mới nhất (`dự đoán → kết quả`, THẮNG / THUA / HÒA). Khi nhận kết quả lần đầu của một ván thì **thêm ngay (optimistic)** rồi **refetch MỘT lần sau ~4s** (> chu kỳ batch 3s), gộp theo `(shoe, round)`, không có logic thử lại. Shoe realtime khác shoe đang hiển thị ⇒ reset và fetch lại theo shoe realtime; kết nối lại SSE ⇒ refetch để bù event lỡ.
- **Debug 5 trường time:** chỉ hiện khi `NEXT_PUBLIC_SHOW_STREAM_DEBUG=true` (xem `apps/web-portal/.env.example`), đặt cuối trang.

### Redis Stream consumer
- Tên consumer **cố định**, khai báo qua biến môi trường trong `docker-compose.yml` (ví dụ `CONSUMER_NAME=api-worker-0`).
- **Không dùng `docker compose up --scale`** cho service consumer. Các replica sẽ dùng chung biến môi trường, tức là trùng tên consumer. Cần thêm instance thì khai báo service riêng với tên consumer riêng.
- Khi khởi động: đọc PEL của chính mình (`XREADGROUP ... STREAMS key 0`) cho hết, sau đó mới đọc `>`.
- **Chỉ `XACK` sau khi DB đã commit.**
- Mọi handler phải **idempotent**, vì message có thể được xử lý lại.
- **Giới hạn thời gian:** consumer là vòng lặp tuần tự nên một `await` treo sẽ chặn mọi message. Vì vậy pool pg đặt `connectionTimeoutMillis`, `statement_timeout`, `query_timeout`, `idle_in_transaction_session_timeout`, keepalive (`app.module.ts`); `predict-persist` bọc mỗi message trong `PERSIST_HANDLE_TIMEOUT_MS` (quá hạn ⇒ ném lỗi, loop thử lại từ PEL) và log WARN khi chậm hơn `PERSIST_SLOW_WARN_MS`; kết nối Redis của consumer có `commandTimeout` (> `TRIGGER_BLOCK_MS`) và keepalive.
- Danh sách consumer group hiện có: `persist` (ingestion, trên `ticks`), `predict-trigger`, `predict-persist`, `settle` (api, trên `settle:requests`), `ai-counter`, `ai-predictor` (ai). Mỗi group một consumer cố định (`CONSUMER_NAME` cho api, `AI_CONSUMER_NAME` cho ai).
- **Log:** `API_LOG_DEBUG` (mặc định `false`) điều khiển mức DEBUG của Nest logger (`main.ts`): `false` ⇒ log / warn / error / fatal; `true` ⇒ thêm debug. Log "Prediction ...: <reason> (n kết nối)" khi `pick = null` và "trừ 0 user ... (NO_PARTICIPANTS)" / không có participant là DEBUG. `PredictTriggerService`: **mọi nhánh bỏ qua** (tick không parse được, `data` sai, tên không hợp lệ, shoe/round không phải số nguyên, status lạ, cờ `predict_req` đã có) đều log mức LOG qua `logOnce` (tối đa 1 dòng / phút / khóa); nhánh trùng lặp bình thường (đã gửi kết quả / request, status không tiến) không log.

---

## Vai trò & điểm

| Vai trò | Quyền với cấp dưới | Điểm |
|---|---|---|
| Host | Tạo/sửa, cấp điểm, hủy kích hoạt Admin | **Sinh mới** điểm cho Admin |
| Admin | Tạo/sửa, cấp điểm, hủy kích hoạt, xóa User | **Chuyển** điểm từ balance của mình sang User |
| User | — | Bị trừ điểm khi nhận prediction |

- `users.refer_user_id` trỏ tới cấp trên trực tiếp. Dùng nó để Admin lọc user của mình, Host lọc admin của mình.
- Xóa user là **xóa mềm** (`status = 'DELETED'`). Không `DELETE` vì sẽ làm mất tham chiếu của lịch sử giao dịch. Điểm còn lại giữ nguyên trong tài khoản.

---

## Data model (tóm tắt)

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `roles` | role_id, role_name | HOST / ADMIN / USER |
| `users` | user_id, phone_number, password, role_id, refer_user_id, balance, status, created_at | password luôn hash; status: `ACTIVE` (default) \| `DEACTIVE` \| `DELETED` |
| `users_register` | user_register_id, phone_number (unique) | số điện thoại đăng ký từ portal, chờ Admin cấp tài khoản; chỉ hai cột |
| `lobbies` | lobby_id, lobby_name, created_at (default now), status | status: `ACTIVE` (default) \| `DEACTIVE` \| `ARCHIVE` |
| `categories` | category_id, category_name, lobby_id, created_at (default now), status | status: `ACTIVE` (default) \| `DEACTIVE` \| `ARCHIVE` |
| `streams` | stream_id, stream_name, category_id, status | status: `ACTIVE` (default) \| `DEACTIVE` \| `ARCHIVE` |
| `stream_information` | stream_information_id, stream_id, streamer_id | `streamer_id` là **tên** người live (text), không phải FK |
| `game_sessions` | game_session_id, stream_id, road_shoe (= stream_shoe), road_count (= stream_round), result, status, ended_at, created_at | status: `RUNNING` → `FINISHED` \| `CANCELLED`; `ended_at` = lúc sang FINISHED / CANCELLED (V10, dòng cũ NULL) |
| `predictions` | prediction_id, stream_id, game_session_id (**unique**), predict_result (NULL khi AI không dự đoán), confidence_score, detail (jsonb), model_version, reason, created_at | mỗi ván của mỗi stream chỉ có 1 prediction; ghi bởi api (không phải AI) |
| `stream_connections` | stream_connection_id, user_id, stream_id, opened_at, last_ping_at, closed_at, close_reason | nhật ký kết nối SSE tham gia stream (V10); close_reason: `CLIENT_CLOSED` \| `PING_FAILED` \| `INSUFFICIENT_BALANCE` \| `SESSION_REVOKED` \| `SERVER_SHUTDOWN` \| `SERVER_RESTART`. Bảng `stream_participants` đã xóa (V11) |
| `prediction_subscriptions` | prediction_subscription_id, user_id, prediction_id, fee_amount, delivered_at, refunded_at, refund_waived_at, created_at | unique (user_id, prediction_id); `delivered_at` = đẩy pick thành công (best effort) |
| `transactions` | transaction_id, user_id, predictions_subscriptions_id (nullable), transaction_type, amount, balance_before, balance_after, created_by, created_at | |

**Kiểu id:** mọi id là `UUID DEFAULT gen_random_uuid()` (V7), kể cả khóa ngoại; riêng `roles.role_id` giữ `SMALLINT`. Trong TS là `string`; DTO kiểm tra bằng `@IsUUID()`. `AppModule` đặt `installExtensions: false` cho TypeORM (không tự cài extension). Cache id trong Redis chứa giá trị không phải UUID (id số cũ) bị coi là cache miss.

`transaction_type`: `MINT`, `TRANSFER_OUT`, `TRANSFER_IN`, `CHARGE`, `REFUND`.

**ID của `game_sessions` và `predictions` phải được sinh trước khi vào batch** (UUIDv5 xác định hoặc UUID sinh trong code, không để DB sinh vì không biết trước); các id còn lại do DB sinh bằng `gen_random_uuid()`. Không dùng serial, vì subscription có thể tham chiếu tới prediction còn nằm trong buffer.

---

## Quy tắc bất biến về tiền

Các quy tắc dưới đây **không được phá vỡ**. Nếu một yêu cầu buộc phải vi phạm, hãy dừng lại và hỏi.

1. **Chỉ server quyết định việc thu tiền.** Ack hay bất kỳ tín hiệu nào từ client không bao giờ được dùng để trừ hoặc hoàn tiền.
2. **Trừ tiền trước, giao hàng sau.** `predict_result` chỉ được gửi cho user đã trừ điểm thành công. Lọc event **ở server**, không gửi hết rồi để client tự ẩn.
3. **Trừ tiền là atomic và có điều kiện**, trừ cho cả phòng bằng một câu lệnh:
   ```sql
   UPDATE users
   SET balance = balance - :fee
   WHERE user_id = ANY(:participant_ids) AND balance >= :fee AND status = 'ACTIVE'
   RETURNING user_id, balance + :fee AS balance_before, balance AS balance_after;
   ```
   Sau đó bulk insert `prediction_subscriptions` và `transactions (CHARGE)` **trong cùng một DB transaction**.
4. **Idempotent khi retry:** insert subscription dùng `ON CONFLICT (user_id, prediction_id) DO NOTHING`. Retry không bao giờ được trừ tiền hai lần.
5. **Hoàn tiền ở bước settlement**, ngay khi game_session có result — **chỉ khi env `HAS_REFUND=true`** (mặc định). `HAS_REFUND=false` ⇒ không hoàn trong mọi trường hợp dưới đây (kể cả `CANCELLED`) và subscription được đánh dấu `refund_waived_at` (không bao giờ hoàn nữa, kể cả khi bật lại cờ); ngoại lệ này do chủ dự án quyết định (2026-11-11), không tự mở rộng:
   - Dự đoán sai (`predict_result != result`) thì hoàn `fee_amount` cho mọi subscriber.
   - Session `CANCELLED` thì hoàn cho mọi subscriber.
   - Chỉ cập nhật các dòng có `refunded_at IS NULL`, set `refunded_at` và ghi `transactions (REFUND)` trong cùng một DB transaction.
6. **Chuyển điểm Admin → User:** kiểm tra `admin.balance >= amount`. Ghi 2 dòng `TRANSFER_OUT` và `TRANSFER_IN` trong cùng một DB transaction. **Lock các dòng users theo thứ tự `user_id` tăng dần** để tránh deadlock.
7. Mọi thay đổi `balance` đều phải có dòng `transactions` tương ứng với `balance_before`/`balance_after` khớp nhau.
8. `fee_amount` lưu lại giá tại thời điểm trừ. Không tính lại từ hằng số hiện tại.
9. **Không tính toán trên `balance`/`amount`/`fee_amount`/`balance_before`/`balance_after` bằng `+`, `-`, `Number()` trong TS.** Các cột này là `bigint` nên TypeORM/`pg` trả về **chuỗi**: `"10" + 5` ra `"105"`, còn `Number()` mất độ chính xác khi vượt 2^53. Mọi phép cộng/trừ/so sánh tính **trong SQL** (như câu `UPDATE` ở mục 3); nếu bắt buộc tính ở TS thì dùng `BigInt`, không bao giờ `Number`.

---

## Participants & SSE

- Participant = kết nối SSE **tham gia** (ticket có `participate_stream_id`, chỉ USER, mỗi kết nối đúng một stream) mở từ trang chi tiết, giữ trong RAM của `ConnectionRegistry` (`realtime/connection-registry.ts`; API chạy một instance). Kết nối chỉ có `items` (trang danh sách) không bao giờ là participant, chỉ nhận tick. Bảng `stream_participants` cũ đã bỏ (V11).
- Mỗi kết nối tham gia một dòng `stream_connections`: INSERT trước khi gửi header (lỗi DB ⇒ 500), UPDATE **đúng một lần** lúc đóng (`closed_at`, `close_reason`, `last_ping_at` — `lastPingAt` chỉ ở RAM cho tới lúc đóng). Lý do: `CLIENT_CLOSED` (`res` close), `PING_FAILED` (ghi lỗi / buffer > 1MB), `INSUFFICIENT_BALANCE`, `SESSION_REVOKED` (`session:{sid}` không còn, hoặc user không còn được trừ), `SERVER_SHUTDOWN` (`beforeApplicationShutdown`, ghi theo lô), `SERVER_RESTART` (lúc khởi động đóng mọi dòng còn mở).
- Ping mỗi 15s (`event: ping`), một timer chung cho mọi kết nối, kiểm tra session bằng một pipeline `EXISTS` (Redis lỗi thì không đóng nhầm). Ghi thành công chỉ nghĩa là kernel / proxy đã nhận: tab nền / tab "ma" sau proxy vẫn bị trừ tới khi kết nối đóng (đã chấp nhận).
- Được tham gia nhiều stream cùng lúc, mỗi stream trừ tiền riêng. Nhiều tab cùng một stream chỉ tính một lần (`participantUserIds` distinct), mọi tab đều nhận pick.
- `balance < fee` thì API gửi event `insufficient_balance` rồi đóng kết nối tham gia của user ở stream đó (ở lần dự đoán kế tiếp không trừ được).

---

## Auth & bảo mật (`apps/api`)

Mọi route đều yêu cầu đăng nhập, trừ route gắn `@Public()`. Route thực tế có tiền tố `/api`.

### Luồng token
- `POST /api/auth/login` `{ phone_number, password, audience?: "portal" }` → access token JWT (HS256, ~15 phút; claims `sub`=user_id dạng string, `role`, `sid`, `jti`) trong body + refresh token trong cookie `refresh_token` (`httpOnly`, `Secure`, `SameSite=Strict`, `path=/api/auth/refresh`).
- **Portal chỉ cho USER:** web-portal gửi `audience: "portal"`; HOST / ADMIN nhận cùng lỗi 401 như sai mật khẩu (không tạo session, không tính vào số lần sai, log WARN `portal login rejected`). Cookie refresh dùng chung với web-admin (cùng site) nên portal cũng kiểm tra claim `role` của access token sau login / refresh và bỏ phiên không phải USER (chỉ chặn phía UI, API vẫn kiểm tra role từng route). web-admin không gửi `audience` (chưa hạn chế).
- `POST /api/auth/refresh` (đọc cookie) xoay refresh token mỗi lần gọi. Dùng lại token cũ ⇒ thu hồi cả session (phát hiện bị đánh cắp). Không có khoảng ân hạn: hai tab refresh đồng thời có thể làm đăng xuất.
- `POST /api/auth/logout` xóa session + refresh token (Redis) + cookie và **đóng ngay** các kết nối SSE của session đó (`SessionService.onRevoked` → `ConnectionRegistry.closeSession`, lý do `SESSION_REVOKED`; áp dụng cả khi user bị khóa); `GET /api/auth/me` không bao giờ trả `password`, có `can_participate` (xem **Billing**).
- Redis: `session:{sid}` `{user_id, role, created_at}` (TTL `SESSION_TTL_SECONDS`, sliding), `user_sessions:{user_id}` (set sid), `refresh:{sid}` (hash `current`/`previous`, chỉ lưu HMAC-SHA256 bằng `JWT_REFRESH_SECRET`), `login_fail:{phone}` / `login_lock:{phone}`.
- `SessionGuard` (APP_GUARD, `auth/session.guard.ts`): verify chữ ký + `exp` với thuật toán cố định HS256, rồi kiểm tra `session:{sid}` còn trên Redis và `user_id` khớp `sub`; gắn `req.user = { userId, role, sessionId }`. Thứ tự guard toàn cục: Throttler → SessionGuard → RolesGuard.
- Sai mật khẩu / phone không tồn tại / `status != ACTIVE` ⇒ cùng một lỗi 401. Sai ≥ `LOGIN_MAX_ATTEMPTS` lần ⇒ khóa phone `LOGIN_LOCK_MINUTES` phút (429, tính cả phone không tồn tại). `/auth/login` còn bị giới hạn 10 lần/phút/IP.
- Mật khẩu hash argon2id (`auth/password.ts`). User chuyển sang `DEACTIVE`/`DELETED` ⇒ gọi `SessionService.revokeAllSessions(userId)` (token cũ bị 401 ngay).

### Phân quyền
- `@Roles(...)` + `RolesGuard`; decorator `@Public()`, `@CurrentUser()` ở `auth/decorators.ts`.
- Phạm vi theo `users.refer_user_id` (cấp trên trực tiếp), kiểm tra trong `PermissionService.assertCanManage()`: **ADMIN chỉ thao tác USER có `refer_user_id = admin.user_id`; HOST chỉ thao tác ADMIN có `refer_user_id = host.user_id`**. Không ai thao tác / cấp điểm cho chính mình (`assertCanGrantPoints`). Target không tồn tại hoặc ngoài phạm vi đều trả 403. Mọi API mới thao tác trên user khác PHẢI gọi hàm này.
- Xóa (soft delete) User chỉ ADMIN được làm; HOST chỉ kích hoạt / hủy kích hoạt ADMIN.
- `POST /api/users` `{ phone_number, password (>= 12 ký tự) }`: HOST tạo ADMIN, ADMIN tạo USER. Role do server suy ra từ người gọi (`PermissionService.managedRole`), `refer_user_id` luôn là người gọi; body không nhận `role` / `refer_user_id`. Phone trùng ⇒ 409.

### API danh mục (chỉ đọc)
`GET /api/lobbies`, `GET /api/categories`, `GET /api/streams` (tạo/sửa nằm ở luồng ingestion, không có API ghi). Mọi role đã đăng nhập đều gọi được.
- Query chung: `page` (>= 1, mặc định 1), `limit` (1–100, mặc định 20), `status` (`ACTIVE|DEACTIVE|ARCHIVE`), `q` (tên chứa chuỗi, không phân biệt hoa thường). Thêm: categories `lobby_id`; streams `lobby_id`, `category_id`. Tham số lạ hoặc sai kiểu ⇒ 400.
- Response `{ items, total, page, limit }`, field snake_case, id là UUID (chuỗi). categories kèm `lobby_name`; streams kèm `category_name`, `lobby_id`, `lobby_name`, `streamer_id` (null nếu chưa có).
- **Số đếm:** lobbies kèm `category_count`, `stream_count`; categories kèm `stream_count` (số nguyên). USER chỉ đếm bản ghi `ACTIVE` (stream phải thuộc category `ACTIVE`); HOST / ADMIN đếm tất cả.
- **Chi tiết:** `GET /api/categories/:id`, `GET /api/streams/:id` (id phải là UUID ⇒ sai thì 400), trả đúng một item như trong list; không tồn tại hoặc không thuộc phạm vi nhìn thấy của role (vd USER với bản ghi không `ACTIVE` / cha không `ACTIVE`) ⇒ 404.
- **USER chỉ thấy bản ghi `ACTIVE`** (bỏ qua `status` truyền vào) và chỉ khi các cấp cha (lobby, category) cũng `ACTIVE`; HOST / ADMIN thấy tất cả và lọc được theo `status`.

### Đăng ký số điện thoại (công khai)
`POST /api/users-register` `{ phone_number }` (`@Public()`, `@Throttle` 5 lần/phút/IP): ghi số điện thoại vào bảng `users_register` để Admin cấp tài khoản sau. **Không** tạo user, không đặt mật khẩu, không gửi SMS. `phone_number` chỉ chữ số, 6–20 ký tự (không khoảng trắng / dấu `+`; portal tự bỏ khoảng trắng và dấu `-` trước khi gửi). Idempotent: số đã đăng ký, hoặc đã là user, đều trả `201 { status: "received" }` y hệt số mới (không để dò số nào có trong hệ thống). Sai định dạng / có trường lạ ⇒ 400. Chưa có API đọc `users_register` cho Admin.

### SSE
- Event trên một kết nối: `tick` (trạng thái trực tiếp, chỉ đi tới), `round_result` (kết quả ván, chỉ đi tới), `prediction` (chỉ kết nối tham gia), `insufficient_balance`; ping là `event: ping`. Client coi event thiếu `type` là tick.
- `POST /api/realtime/ticket` (cần Bearer) `{ items?: string[] (≤ 20 key_id), participate_stream_id?: uuid }` → `{ ticket, expires_in: 30 }`. `participate_stream_id`: chỉ USER (HOST / ADMIN ⇒ 403), stream trong phạm vi nhìn thấy (404), đủ điểm (402); key_id của stream (dựng bằng `buildKeyId` từ tên trong DB) được thêm vào items. **`items` được lọc theo phạm vi nhìn thấy:** USER chỉ nhận key_id (đã chuẩn hóa) của stream ACTIVE có category + lobby ACTIVE (`StreamsService.visibleKeyIds`, một truy vấn); key_id khác bị bỏ, không còn item nào (và không tham gia stream nào) ⇒ 403; HOST / ADMIN thấy tất cả. Ticket lưu Redis `sse_ticket:{ticket}` `{user_id, session_id, items, participate}` TTL 30s.
- `GET /api/stream?ticket=` là `@Public()` (EventSource không gửi được `Authorization`; tuyệt đối không đưa access token lên query string) nhưng bắt buộc ticket: đọc bằng `GETDEL` (một lần), session phải còn ⇒ sai / hết hạn / đã dùng ⇒ 401. Ticket một lần nên EventSource tự kết nối lại sẽ bị 401 và dừng: client phải tự xin ticket mới (backoff).
- SSE ghi tay bằng `@Res()` (không dùng `@Sse`): header `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`, `flushHeaders()`, socket keepalive. API không dùng middleware nén (nếu thêm thì phải bỏ qua `text/event-stream`). Mọi event ứng dụng là `data: <JSON>` (event mặc định, phân loại bằng `type`: `tick`, `prediction`, `insufficient_balance`); ping là `event: ping`. Đăng ký nghe tick trước rồi mới gửi snapshot `latest:*`.

### Bảo mật chung
Helmet, CORS chỉ cho `CORS_ORIGINS` (`credentials: true`), throttler lưu Redis, `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`), body tối đa 100kb, exception filter global (không lộ stack / lỗi DB), cột `users.password` là `select: false`, không log mật khẩu / token. Thiếu `JWT_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`, `DATABASE_URL`, `CORS_ORIGINS` thì app dừng ngay (`config/env.validation.ts`). `SameSite=Strict` ⇒ ở production web và api phải cùng site.

### Tạo user đầu tiên
Migration `db/migrations/V4__seed_default_host.sql` seed sẵn một HOST (phone `0000000000`) với mật khẩu ban đầu đã biết và nằm trong repo ⇒ **phải đổi / vô hiệu hóa trước khi deploy ngoài local** (hiện chưa có API đổi mật khẩu; cập nhật hash trực tiếp trong DB hoặc tạo migration mới, không sửa file V4). Có thể tạo thêm HOST bằng CLI bên dưới.

```bash
NEW_USER_PHONE=... NEW_USER_PASSWORD=... pnpm --filter @toolhackchain/api create-host      # thiếu env thì hỏi (mật khẩu được ẩn), tối thiểu 12 ký tự
pnpm --filter @toolhackchain/api create-user --role ADMIN --refer-phone <phone của HOST>   # USER thì refer tới ADMIN
```

---

## Phạm vi phase 1 / phase 2

**Phase 1 (bắt buộc có):** toàn bộ mục *Quy tắc bất biến về tiền*, lọc event ở server, ID sinh trước khi vào batch, unique constraint, status của game_session, settlement và hoàn tiền.

**Phase 2 (chưa làm, đừng tự ý triển khai):**
- Phát lại prediction đã trả tiền khi reconnect (API lấy lại hoặc `Last-Event-ID`).
- Bỏ qua prediction về muộn: phase 1 đã làm theo hạn chót `round_status` (xem **Luồng dự đoán AI**; log `late_prediction` để đo tần suất). Nếu sau này cần điều kiện dựa trên `game_sessions.status = RUNNING` thì làm ở phase 2.
- UI bật/tắt tham gia và hiển thị phí mỗi ván.
- Tối ưu fan-out cho phòng đông người.
- Fee cấu hình theo stream/category (phase 1 dùng hằng số).

---

## Lệnh thường dùng

> Node >= 18.18 (repo pin Node 20 trong `.nvmrc`, chạy `nvm use` trước). Tên package: `@toolhackchain/api`, `@toolhackchain/web-admin`, `@toolhackchain/web-portal`, `@toolhackchain/shared`.

```bash
# Hạ tầng + Flyway tự migrate. Lần đầu: cp .env.example .env và cp apps/api/.env.example apps/api/.env
# DB ngoài: đặt DB_HOST/DB_PORT/DB_SSL* trong .env. DB local: DB_HOST=db và thêm --profile local-db
docker compose up -d

# Flyway (schema)
pnpm db:migrate    # áp dụng migration mới
pnpm db:info       # trạng thái từng migration
pnpm db:validate   # kiểm tra checksum

# Node (chạy ở thư mục gốc)
pnpm install
pnpm dev                                          # chạy song song mọi package
pnpm --filter @toolhackchain/shared dev           # build watch cho shared (api/web import từ đây)
pnpm --filter @toolhackchain/api start:dev                       # API
pnpm --filter @toolhackchain/web-admin dev        # admin, port 3000
pnpm --filter @toolhackchain/web-portal dev       # portal, port 3001
pnpm build                                        # build theo thứ tự shared -> api -> web-admin -> web-portal
pnpm --filter @toolhackchain/api lint                            # oxlint

# AI (Python, xem apps/ai/README.md)
cd apps/ai && python main.py serve        # hoặc backtest | verify | predict

# Crawler (Python, cần Brave + CDP port 9222, xem apps/crawl-agent/README.md)
pip install -r apps/crawl-agent/requirements.txt
bash apps/crawl-agent/run_server.sh
```

## Quy ước khi làm việc

- Sửa schema event thì cập nhật cả `contract.py` và `packages/shared/src/realtime.ts`.
- **Schema DB do Flyway quản lý** (`db/migrations/`). Đặt tên `V<số>__<mo_ta_snake_case>.sql` (versioned) hoặc `R__<mo_ta>.sql` (repeatable); mỗi file một mục đích, có comment đầu file.
- Mọi thay đổi schema = **một file Flyway mới + sửa entity tương ứng trong cùng commit**. SQL là nguồn sự thật, entity theo SQL.
- **Không bao giờ sửa file migration đã được apply** (kể cả thêm comment, vì Flyway so checksum); muốn đổi thì tạo file mới.
- Không bật `synchronize`, không dùng `flyway clean` (đã `FLYWAY_CLEAN_DISABLED=true`). TypeORM không chạy migration (`migrationsRun: false`).
- **UPDATE / DELETE ... RETURNING qua `ds.query` / `manager.query` / `queryRunner.query` BẮT BUỘC dùng `updateReturning()`** (`apps/api/src/common/update-returning.ts`). Với câu có lệnh chính là UPDATE / DELETE (kể cả `WITH ... UPDATE ... RETURNING`), TypeORM trả `[rows, rowCount]` chứ không phải `rows`: đọc `.map()` / `.length` trực tiếp ra `undefined` / luôn 2 mà không báo lỗi (đã từng làm `settle:requests` mất `game_session_id` và làm `charge` lỗi). CTE có UPDATE bên trong nhưng lệnh chính là INSERT / SELECT thì trả `rows` bình thường: ghi chú `-- top-level: INSERT` (hoặc `SELECT`) ở đầu câu SQL. Lệnh kiểm tra (chạy ở thư mục gốc trước khi merge; in ra vị trí vi phạm và exit khác 0, không in gì = sạch; chỉ bắt SQL viết thẳng bằng template literal trong lời gọi `.query(`):
  ```bash
  git ls-files 'apps/api/src/*.ts' | xargs perl -0777 -ne 'while (/\.query\s*(?:<[^>]*>)?\(\s*`([^`]*)`/g) { my ($sql, $at) = ($1, $-[0]); next unless $sql =~ /\bRETURNING\b/i && $sql =~ /(?<!FOR\s)(?<!DO\s)\b(?:UPDATE|DELETE)\b/i && $sql !~ /--\s*top-level:\s*(?:INSERT|SELECT)\b/i; $n++; printf "%s:%d: UPDATE/DELETE ... RETURNING phai dung updateReturning()\n", $ARGV, 1 + (substr($_, 0, $at) =~ tr/\n//) } END { exit 1 if $n }'
  ```
- Dùng `pnpm`, không dùng npm/yarn. Thêm dependency vào đúng package bằng `pnpm --filter`.
- Không đọc hoặc commit giá trị trong `.env`.
- Không dùng tiếng Việt để đặt tên biến, API, file, module và code liên quan.

## Theme / Design (mỗi web app một design contract riêng)

Khi tạo/sửa UI, PHẢI đọc và bám file design của đúng app; hai app KHÔNG dùng chung theme. Đặt token màu/typography tập trung (web-admin: `ConfigProvider theme` trong `app/providers.tsx`; web-portal: `tailwind.config.ts`), không hardcode hex rải rác.

- `apps/web-admin` — Dark SOC / Cyber-Threat: `.claude/designs/WEB-ADMIN.DESIGN.md` (nền `#0A0E14`, primary cyan `#22D3EE`, heading monospace, bảng severity nhất quán). Dùng skill `nextjs-frontend` (antd + pro-components).
- `apps/web-portal` — Cyberpunk Neon Red HUD (nguồn: Stitch `projects/7952075426934119946`, design system "Cyberpunk Neon Red HUD"): `.claude/designs/WEB-PORTAL.DESIGN.md` (nền obsidian `#050507`, neon đỏ `#FF1E42`, vàng chỉ cho số dư, xanh lá cho LIVE/thắng, font Space Grotesk + JetBrains Mono + Outfit). Dùng **Tailwind 3** (token trong `apps/web-portal/tailwind.config.ts`, component dùng chung ở `src/components/ui/`), KHÔNG dùng antd. Đã xóa hết CSS Royal Purple cũ.

- **Dữ liệu web-portal:** sảnh / loại game / bàn lấy từ API thật (`src/lib/api/catalog.ts` → `GET /lobbies`, `/categories`, `/streams`, `/categories/:id`, `/streams/:id`), fetch ở **client** kèm Bearer (`authFetch` tự làm mới token một lần khi gặp 401, `useApi` chỉ gọi khi đã đăng nhập). Màn hình chi tiết bàn dùng dữ liệu thật hoàn toàn (khung dự đoán, lịch sử, tỷ lệ thắng của shoe hiện tại, chuỗi thắng, biểu đồ tỷ lệ thắng theo shoe). Danh sách bàn cũng dùng dữ liệu thật: `GET /api/categories/:id/stream-stats` (phạm vi nhìn thấy như `GET /streams`; 404 khi category ngoài phạm vi) trả `items[]` mỗi bàn `{ stream_id, shoe, round, live, wins, losses, draws, win_rate, win_streak }` (định nghĩa thắng / hòa / shoe hiện tại như `predictions/stats`; `round` = ván mới nhất của stream; `live` = có ván mới trong `LIVE_WITHIN_MS` = 5 phút). **`win_streak` ở danh sách khác trang chi tiết:** = chuỗi thắng **dài nhất** trong shoe hiện tại N (dự đoán đã chấm theo thời gian, T bỏ qua, thua đứt chuỗi); nếu chuỗi đó < `LIST_STREAK_MIN` (4) hoặc N có < `LIST_STREAK_MIN_ROUNDS` (5) lượt đã chấm (kể cả hòa) thì lấy chuỗi dài nhất của shoe trước N−1 (shoe có dự đoán mới nhất kế tiếp); chưa có N−1 thì giữ của N (`listStreak()` ở `predictions.service.ts`). Thẻ bàn không hiện danh sách dự đoán gần nhất. `CategoryStreamsView` gọi `/auth/me`: `can_participate = false` ⇒ nút vào chi tiết bị khóa ("Không đủ điểm"); portal không tự so balance với phí. Portal (`CategoryStreamsView`) xếp bàn theo `win_rate` của shoe hiện tại giảm dần (bàn chưa có tỷ lệ xuống cuối, hòa thì nhiều ván hơn trước, rồi theo tên) và lấy một lần khi mở trang (không interval). Danh sách bàn hiện ngay khi `GET /streams` về, không chờ `stream-stats`: lúc đó các ô số liệu (LIVE, ván, tỷ lệ win, chuỗi) là khung chờ, stats lỗi thì hiện "—"; stats về mới xếp lại. `stream-stats` đọc vài dòng mới nhất của mỗi bàn (`LATERAL ... LIMIT 1` trên `idx_game_sessions_stream_created` và `idx_predictions_stream_created`, V13), 3 truy vấn chạy song song. Không còn số liệu giả lập nào ở web-portal.

- **Header web-portal** (`AppHeader`): logo, lời chào (chip số điện thoại, ẩn dưới `sm`), số dư (luôn hiện, kể cả màn hình nhỏ), nút hamburger (nút NẠP TIỀN và chuông thông báo đang ẩn, chưa bỏ i18n). Hamburger mở `MenuDrawer` (portal vào body): từ `sm` trở lên ở bên phải, trượt phải → trái, bo 32px góc trên-trái và dưới-trái; màn hình nhỏ ở trên cùng, trượt trên → xuống, bo 32px hai góc dưới; viền + nền như header. Mục: **chọn ngôn ngữ** (`LanguageDialog`: dialog có select, đổi ngay, lưu cookie) và **đăng xuất** (`LogoutDialog`: xác nhận Có / Không ⇒ `logout()` gọi `POST /auth/logout`; thành công ⇒ `markUnauthenticated`, `AuthGate` chuyển /login và gỡ trang nên EventSource đóng; lỗi mạng / 5xx ⇒ báo lỗi và giữ đăng nhập, 401 coi như đã đăng xuất).

Skills khác trong `.claude/skills/`: `rbac-guard` (scope dữ liệu theo cấp trên), `flyway-migration`, `security-review`.
