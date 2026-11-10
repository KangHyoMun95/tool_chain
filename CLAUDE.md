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
│   │       ├── predictions/               # luồng dự đoán: trigger (ticks → predict:requests / ai:results), consumer predict:results → DB + SSE, GET current
│   │       ├── ticks/                     # bản cũ, giữ để so sánh, KHÔNG đăng ký trong AppModule
│   │       └── realtime/                  # luồng SSE đẩy xuống client
│   ├── crawl-agent/         # Python — crawler, publish event vào Redis
│   ├── ai/                  # Python — service AI predict (src/patterns = service; src/ai = thử nghiệm, KHÔNG dùng), chỉ ĐỌC DB
│   ├── web-admin/           # Next.js — CHỈ UI (Host/Admin)
│   └── web-portal/          # Next.js — CHỈ UI (User)
├── db/migrations/           # Flyway SQL migration (nguồn sự thật của schema)
├── packages/shared/src/     # type/contract dùng chung TS
│   ├── realtime.ts          # schema event realtime + RedisKeys
│   └── ai.ts                # contract 3 stream dự đoán (predict:requests, ai:results, predict:results)
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
                                             ├─► realtime.hub  → SSE xuống web-portal (lọc theo key_id)
                                             └─► tick-persister → ghi DB theo batch (MAX_BATCH dòng hoặc MAX_WAIT_MS, xem ingestion/ingestion.constants.ts)
```

### Luồng 2 — Dự đoán
Đã làm (chưa có billing, xem mục **Luồng dự đoán AI** bên dưới):
```
crawler → Redis "ticks" → api (PredictTriggerService)
   ├─ tick IN_PROGRESS đầu tiên của ván → predict:requests ─► AI ─► predict:results ─► api (PredictResultConsumer)
   └─ tick đầu tiên có actual_result    → recent:* + ai:results ─► AI (cập nhật bảng đếm)
                                                      api: kiểm tra hạn chót → lưu predictions (DB) → SSE public
```
Chưa làm (phase 1 còn lại, theo mô hình trên):
```
dự đoán đã có
   → billing: trừ điểm các participant đang hoạt động
   → SSE: chỉ đẩy predict_result cho user đã trừ thành công (hiện đang đẩy kênh public)

crawler có result → cập nhật game_session (FINISHED) → settlement: hoàn điểm nếu dự đoán sai
stream tắt / crawler lỗi giữa ván → game_session (CANCELLED) → hoàn điểm toàn bộ
```

### key_id, payload crawler & ingestion
- `key_id` = `<lobby_name>|<category_name>|<stream_name>` đã chuẩn hóa. **Chỉ là khóa cache / phòng realtime (`item_id` của tick), KHÔNG lưu DB** (không có cột `streams.key_id`). Tên chứa `|` bị coi là tick lỗi.
- **Chuẩn hóa tên** (`normalizeName()` ở `common/normalize.ts`, `normalize_name()` ở `contract.py`): trim, gộp khoảng trắng liên tiếp thành 1, lowercase. **Chỉ để chống trùng, không lưu**; DB lưu tên đã trim của lần gặp đầu. Chống trùng bằng unique index trên biểu thức (không có cột `*_norm`), biểu thức SQL phải khớp `normalizeName()`: lobbies `(norm(lobby_name))`, categories `(lobby_id, norm(category_name))`, streams `(category_id, norm(stream_name))`. Upsert: `INSERT ... ON CONFLICT (<biểu thức>) DO NOTHING`, rồi SELECT lại id.
- Cache id (RAM + Redis, ghi sau khi DB commit): `lobby:{norm}`, `category:{lobby_id}:{norm}`, `stream:{key_id}`. Chỉ chạm DB khi cache miss. Mọi thứ bên trong sau đó dùng **`stream_id`**.
- **Payload crawler** (`CrawlPayload`, `contract.py` ↔ `realtime.ts`), gửi liên tục, nhiều lần cho cùng một ván: `lobby_name, category_name, stream_id, stream_name, stream_shoe, stream_round, streamer_id, player_count, player_value, status, actual_result, total_B/P/T`.
  - **Ghi DB**: tên lobby/category/stream, `stream_shoe` (số nguyên như `stream_round` → cột `game_sessions.road_shoe`), `stream_round` (số nguyên → `game_sessions.road_count`), `streamer_id` (→ `stream_information`), `actual_result` (→ `game_sessions.result`).
  - **Chỉ hiển thị** (chỉ qua realtime/SSE, không ghi DB): `player_count, player_value, status, total_B/P/T`, `streamer_name`, `streamer_country` và 5 trường time `deliver_time, timestamp, stamp_time, round_start_time, repaint_time` (`str | None`, optional; crawler gửi qua Redis Stream nên không có DTO; ingestion bỏ qua, không có cột/migration). `stream_id` là id text phía nguồn, bỏ qua. Ingestion không đọc `status` của payload để suy ra trạng thái.
- **Khóa duy nhất của game_session** là `(stream_id, road_shoe, road_count)` (round có thể reset khi đổi shoe nên `(stream_id, road_count)` không đủ). `stream_round` của payload = `road_count`, `stream_shoe` của payload = cột `road_shoe` (payload đặt tên `stream_*`, cột DB đặt tên `road_*`); `stream_shoe` cũng là số nguyên (nhận number hoặc chuỗi số). `stream_shoe` hoặc `stream_round` thiếu / không phải số nguyên ⇒ tick bị bỏ qua cả phần ghi DB (log, tối đa 1 lần/phút cho mỗi stream + lý do); luồng realtime không bị ảnh hưởng.
- **`game_session_id`** = UUIDv5 xác định từ `key_id + "|" + road_shoe + "|" + road_count` với namespace cố định (`game-sessions/game-session-id.ts`, không được đổi). Cùng ván luôn ra cùng ID. Insert `ON CONFLICT DO NOTHING`, không set `status` (mặc định `RUNNING`; trừ việc set `FINISHED` khi có result, status của stream / game_session do job khác quản lý). Gộp trong batch theo `(stream, road_shoe, road_count)`.
- **Log quan sát shoe** (`ingestion/shoe-observer.ts`, chỉ log, không đổi hành vi ghi): INFO khi shoe của stream đổi; WARN khi round giảm mà shoe không đổi; WARN khi shoe cũ xuất hiện lại sau khi đã chuyển shoe. Trạng thái gần nhất lưu Redis `stream_last:{key_id}` (hash shoe/round) và `stream_shoes:{key_id}` (set shoe đã thấy), TTL 24h.
- **Ghi `result` và set `FINISHED` trong cùng một câu UPDATE** (atomic): `UPDATE game_sessions SET result = ?, status = 'FINISHED' WHERE game_session_id = ? AND result IS NULL AND status <> 'CANCELLED'`. **Không bao giờ ghi đè `result`**: tick báo result khác result đã lưu → log cảnh báo, giữ nguyên. Ván `CANCELLED` nhận result → không cập nhật, log WARN (kèm stream, shoe, round). Đây là chuyển trạng thái **duy nhất** ingestion được làm (RUNNING → FINISHED); `FINISHED` là trạng thái cuối, không được đổi lại; các chuyển trạng thái khác (vd `CANCELLED`) do job kiểm tra status quản lý.
- `stream_information`: một dòng cho mỗi stream (unique `stream_id`), chỉ ghi khi `streamer_id` đổi.
- Batch: gộp tick theo `(stream, stream_round)` giữ bản mới nhất (giữ result nếu có), ghi theo thứ tự lobbies → categories → streams → stream_information → game_sessions trong **một DB transaction**, chỉ `XACK` sau khi commit. Tick lỗi validate: log, bỏ qua (vẫn XACK). Lỗi DB: giữ buffer, thử lại.
- Tự kiểm tra: `apps/api/scripts/publish-sample-tick.mjs` (bắn tick mẫu) và `apps/api/scripts/ingestion-check.sql` (đếm dòng).

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
- **AI dựng lại bảng đếm** từ DB (game_sessions `FINISHED`) lúc khởi động, trước khi consume (restart để dựng lại). `python main.py verify` so Redis với đếm brute-force từ DB. Backtest: `python main.py backtest` (xem `apps/ai/README.md`; kết quả đo gần nhất cho thấy pattern-v1 chưa hơn baseline và `confidence` không phản ánh tỉ lệ đúng, nên chưa dựa vào nó để thu phí/quảng cáo).
- **Lưu DB:** bảng `predictions` (V9): `predict_result` cho phép NULL (CHECK B/P), `detail jsonb` = `{chosen, rows, history_used, missing_previous}`, `model_version`, `reason`; CHECK: có `predict_result` khi và chỉ khi `reason = 'OK'`, `confidence_score` trong 0..1. Trước khi insert, api `INSERT game_sessions ... ON CONFLICT DO NOTHING` trong cùng transaction (khóa ngoại; ván có thể còn trong batch của ingestion), rồi `INSERT predictions ... ON CONFLICT (game_session_id) DO NOTHING RETURNING`; chỉ khi thêm dòng mới mới đẩy SSE.
- **SSE prediction:** event `type: "prediction"` (`RealtimePrediction` ở `packages/shared`) đẩy tới phòng `key_id`, không chứa `detail`; tick giờ có `type: "tick"` (client coi event thiếu `type` là tick). ⚠️ **Prediction đang đi kênh public — PHẢI chuyển sang kênh riêng theo user trước khi làm billing** (xem mục SSE bên dưới).
- **API đọc:** `GET /api/streams/:id/predictions/current` — prediction mới nhất của stream (theo thời điểm tạo) kèm `shoe`, `round`, `confidence` 0–1, không có `detail`; phạm vi nhìn thấy như `GET /streams/:id`; 404 khi chưa có prediction. Portal phải so `(shoe, round)` với ván đang xem.

### Stream detail realtime (web-portal `/streams/[streamId]`)
- **`stream_id` gắn vào event SSE:** `RealtimeHub.withStreamId()` thêm `stream_id` (UUID DB) vào tick từ cache `stream:{key_id}` (`RealtimeTick` ở `packages/shared`); cache miss ⇒ `null`, **không upsert** (ingestion tạo stream và ghi cache sau khi commit). `CacheWarmup` nạp sẵn cache này từ DB lúc API khởi động. Portal subscribe theo `key_id` (`buildKeyId` ở `packages/shared`, api re-export) và chấp nhận tick nếu `stream_id` khớp HOẶC `null`.
- **Trạng thái ván** (`StreamStatus`): `IN_PROGRESS` (Đang tiến hành), `DONE` (Hoàn tất tiến trình), `GET_RESULT` (Nhận kết quả), `SUMMARY_RESULT` (Tổng kết). Giá trị lạ ⇒ hiển thị trung tính + `console.warn`. Ván hiện tại = `(stream_shoe, stream_round)`; sang round mới ⇒ khung kết quả về trạng thái chờ.
- **Message có kết quả = `actual_result != null`** (không dựa vào `status`). Nhiều message cùng mang kết quả một ván ⇒ chống trùng theo `(shoe, round)`, chỉ xử lý lần đầu. Kết quả giữ theo `(shoe, round)` vì các message sau của cùng ván có thể có `actual_result = null`.
- **Khung dự đoán** (`PredictionPanel`, `use-prediction.ts`): workflow của một ván **chỉ bắt đầu khi nhận `IN_PROGRESS` của ván đó**. SSE không kết nối ⇒ OFFLINE / MẤT KẾT NỐI; chưa thấy `IN_PROGRESS` ⇒ radar "ĐANG NẠP DỮ LIỆU"; có `IN_PROGRESS` ⇒ radar "ĐANG PHÂN TÍCH" trong lúc lấy dự đoán **đúng một lần cho mỗi ván** (nhiều `IN_PROGRESS` liên tiếp không gọi lại; lỗi thì lần `IN_PROGRESS` kế tiếp thử lại) rồi hiện dự đoán; thanh trạng thái `predict_status.png` luôn ở đầu khung (nhãn trạng thái nằm trong ảnh), khối `predict_and_rate.png` ở cuối khung chỉ hiện khi có dự đoán (pick trong ô tròn (B đỏ, P xanh dương), phần trăm ở ô dưới, hiện từ trong ra ngoài bằng clip-path, ký tự pick to / nhỏ tuần hoàn; tắt khi prefers-reduced-motion), còn lúc nạp / phân tích chỉ có thanh trạng thái + radar; có `actual_result` ⇒ nền khung đổi màu (thắng xanh dương `#127CE2` + `winner.gif` trong suốt đè lên khối dự đoán (chạy hết ~4.4s kể từ lúc ảnh tải xong, độc lập với trạng thái / ván kế tiếp), ẩn ảnh nền, thua đỏ đậm, hòa `T` xám) khung không hiện chữ kết quả (kết quả xem ở bảng / lịch sử); khối `predict_and_rate.png` nằm sát đáy khung; sang ván mới ⇒ lặp lại.
- **Prediction:** `PredictionSource` (`src/lib/prediction-source.ts`) chọn bằng `NEXT_PUBLIC_PREDICTION_SOURCE=live|mock` (mặc định `live`, đọc lúc build). `live`: event SSE `prediction` vào `predictionStore` (`src/lib/prediction-store.ts`); `getPrediction(stream, shoe, round, signal)` chờ event khớp `(shoe, round)`, đồng thời gọi `/predictions/current` một lần (vào giữa ván / tải lại). `confidence` API 0–1 được đổi sang %. `pick = null` ⇒ "Chưa đủ dữ liệu dự đoán" (không có đúng/sai); hết `IN_PROGRESS` mà chưa có dự đoán ⇒ "Chưa có dự đoán cho ván này" (về muộn bị API bỏ). `mock`: giả vờ ~2.5s, giá trị xác định từ `(stream, shoe, round)`, chỉ `B`/`P`, để thử khi không chạy AI. Kết quả `T` ⇒ "Hòa" (chưa tính đúng/sai; quy tắc sẽ chốt khi làm settlement).
- **Lịch sử và dự đoán:** API lịch sử `game-sessions` trả kèm `pick` (B/P, null khi chưa có dự đoán / AI không dự đoán) và `confidence` (0–1) của từng ván (`LEFT JOIN predictions`); ô lịch sử dùng `pick` này, ván vừa kết thúc chưa kịp refetch thì lấy tạm từ phiên (SSE / current); chưa biết ⇒ "—".
- **Thống kê dự đoán:** `GET /api/streams/:id/predictions/stats` (phạm vi nhìn thấy như `GET /streams/:id`; luôn 200). Trả `{ shoe, wins, losses, draws, win_rate, win_streak, shoes[] }`. Chỉ xét dự đoán **có pick** của ván `FINISHED` có result; **thắng** = `pick = result`; kết quả `T` là hòa (không tính thắng / thua); ván AI không dự đoán không tính. `shoe` = shoe của dự đoán mới nhất của stream (shoe hiện tại). `wins/losses/draws/win_rate` **chỉ của shoe hiện tại** (`win_rate = wins / (wins + losses)`, 0–1, null khi shoe đó chưa có ván nào chấm xong). `shoes` = tỷ lệ thắng của từng shoe **quá khứ** (không gồm shoe hiện tại) trong `STATS_SHOES` (10) shoe gần nhất có ván chấm xong, ít hơn thì trả đúng số đang có (cũ → mới) cho biểu đồ "Tỷ lệ win theo phiên" (UI gọi shoe là "phiên"; trục Y 0–100); thẻ "Tỷ lệ win hiện tại" không có phụ đề. `win_streak` = số dự đoán thắng liên tiếp từ ván mới nhất (xuyên shoe, trong `STATS_STREAK_WINDOW` = 100 dự đoán), bỏ qua ván hòa, dừng ở ván thua. Số shoe có thể lặp lại giữa các ngày; hiện coi cùng số shoe là cùng một shoe. Portal (`usePredictionStats`) fetch khi vào trang / SSE phục hồi, refetch sau ~4.5s khi có kết quả và ~0.5s khi có event `prediction`.
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
- Danh sách consumer group hiện có: `persist` (ingestion, trên `ticks`), `predict-trigger`, `predict-persist` (api), `ai-counter`, `ai-predictor` (ai). Mỗi group một consumer cố định (`CONSUMER_NAME` cho api, `AI_CONSUMER_NAME` cho ai).

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
| `game_sessions` | game_session_id, stream_id, road_shoe (= stream_shoe), road_count (= stream_round), result, status, created_at | status: `RUNNING` → `FINISHED` \| `CANCELLED` |
| `predictions` | prediction_id, stream_id, game_session_id (**unique**), predict_result (NULL khi AI không dự đoán), confidence_score, detail (jsonb), model_version, reason, created_at | mỗi ván của mỗi stream chỉ có 1 prediction; ghi bởi api (không phải AI) |
| `stream_participants` | stream_participant_id, user_id, stream_id, last_seen_at, created_at | unique (user_id, stream_id) |
| `prediction_subscriptions` | prediction_subscription_id, user_id, prediction_id, fee_amount, refunded_at, created_at | unique (user_id, prediction_id) |
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
5. **Hoàn tiền ở bước settlement**, ngay khi game_session có result:
   - Dự đoán sai (`predict_result != result`) thì hoàn `fee_amount` cho mọi subscriber.
   - Session `CANCELLED` thì hoàn cho mọi subscriber.
   - Chỉ cập nhật các dòng có `refunded_at IS NULL`, set `refunded_at` và ghi `transactions (REFUND)` trong cùng một DB transaction.
6. **Chuyển điểm Admin → User:** kiểm tra `admin.balance >= amount`. Ghi 2 dòng `TRANSFER_OUT` và `TRANSFER_IN` trong cùng một DB transaction. **Lock các dòng users theo thứ tự `user_id` tăng dần** để tránh deadlock.
7. Mọi thay đổi `balance` đều phải có dòng `transactions` tương ứng với `balance_before`/`balance_after` khớp nhau.
8. `fee_amount` lưu lại giá tại thời điểm trừ. Không tính lại từ hằng số hiện tại.
9. **Không tính toán trên `balance`/`amount`/`fee_amount`/`balance_before`/`balance_after` bằng `+`, `-`, `Number()` trong TS.** Các cột này là `bigint` nên TypeORM/`pg` trả về **chuỗi**: `"10" + 5` ra `"105"`, còn `Number()` mất độ chính xác khi vượt 2^53. Mọi phép cộng/trừ/so sánh tính **trong SQL** (như câu `UPDATE` ở mục 3); nếu bắt buộc tính ở TS thì dùng `BigInt`, không bao giờ `Number`.

---

## Participants & SSE

- User tham gia stream thì upsert `stream_participants`. Rời stream, đóng kết nối hoặc mất heartbeat thì xóa.
- Server gửi heartbeat SSE mỗi 10–15 giây và cập nhật `last_seen_at`.
- Khi fan-out chỉ lấy participant có `last_seen_at > now() - 30s`, để không trừ tiền user đã rời đi mà server không nhận được tín hiệu.
- Được tham gia nhiều stream cùng lúc, mỗi stream trừ tiền riêng. Nhiều tab cùng một stream chỉ tính một lần.
- `balance < fee` thì API chủ động đóng kết nối SSE của user và gửi event báo hết điểm trước khi đóng.

---

## Auth & bảo mật (`apps/api`)

Mọi route đều yêu cầu đăng nhập, trừ route gắn `@Public()`. Route thực tế có tiền tố `/api`.

### Luồng token
- `POST /api/auth/login` `{ phone_number, password }` → access token JWT (HS256, ~15 phút; claims `sub`=user_id dạng string, `role`, `sid`, `jti`) trong body + refresh token trong cookie `refresh_token` (`httpOnly`, `Secure`, `SameSite=Strict`, `path=/api/auth/refresh`).
- `POST /api/auth/refresh` (đọc cookie) xoay refresh token mỗi lần gọi. Dùng lại token cũ ⇒ thu hồi cả session (phát hiện bị đánh cắp). Không có khoảng ân hạn: hai tab refresh đồng thời có thể làm đăng xuất.
- `POST /api/auth/logout` xóa session + cookie; `GET /api/auth/me` không bao giờ trả `password`.
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

### SSE (đang giữ lại)
⚠️ Event `prediction` cũng đi kênh public này (mọi client biết `key_id` đều nhận được). **Phải chuyển sang kênh riêng theo user (và chỉ gửi cho user đã trừ điểm) trước khi làm billing.**

`GET /api/stream` hiện đang `@Public()` (EventSource không gửi được `Authorization`). Kế hoạch: `POST /api/realtime/ticket` → ticket một lần, TTL 30s trong Redis, SSE nhận `?ticket=` (tuyệt đối không đưa access token lên query string), và đóng SSE khi session bị thu hồi. Chưa làm.

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
- Dùng `pnpm`, không dùng npm/yarn. Thêm dependency vào đúng package bằng `pnpm --filter`.
- Không đọc hoặc commit giá trị trong `.env`.
- Không dùng tiếng Việt để đặt tên biến, API, file, module và code liên quan.

## Theme / Design (mỗi web app một design contract riêng)

Khi tạo/sửa UI, PHẢI đọc và bám file design của đúng app; hai app KHÔNG dùng chung theme. Đặt token màu/typography tập trung (web-admin: `ConfigProvider theme` trong `app/providers.tsx`; web-portal: `tailwind.config.ts`), không hardcode hex rải rác.

- `apps/web-admin` — Dark SOC / Cyber-Threat: `.claude/designs/WEB-ADMIN.DESIGN.md` (nền `#0A0E14`, primary cyan `#22D3EE`, heading monospace, bảng severity nhất quán). Dùng skill `nextjs-frontend` (antd + pro-components).
- `apps/web-portal` — Cyberpunk Neon Red HUD (nguồn: Stitch `projects/7952075426934119946`, design system "Cyberpunk Neon Red HUD"): `.claude/designs/WEB-PORTAL.DESIGN.md` (nền obsidian `#050507`, neon đỏ `#FF1E42`, vàng chỉ cho số dư, xanh lá cho LIVE/thắng, font Space Grotesk + JetBrains Mono + Outfit). Dùng **Tailwind 3** (token trong `apps/web-portal/tailwind.config.ts`, component dùng chung ở `src/components/ui/`), KHÔNG dùng antd. Đã xóa hết CSS Royal Purple cũ.

- **Dữ liệu web-portal:** sảnh / loại game / bàn lấy từ API thật (`src/lib/api/catalog.ts` → `GET /lobbies`, `/categories`, `/streams`, `/categories/:id`, `/streams/:id`), fetch ở **client** kèm Bearer (`authFetch` tự làm mới token một lần khi gặp 401, `useApi` chỉ gọi khi đã đăng nhập). Màn hình chi tiết bàn dùng dữ liệu thật hoàn toàn (khung dự đoán, lịch sử, tỷ lệ thắng của shoe hiện tại, chuỗi thắng, biểu đồ tỷ lệ thắng theo shoe). Danh sách bàn cũng dùng dữ liệu thật: `GET /api/categories/:id/stream-stats` (phạm vi nhìn thấy như `GET /streams`; 404 khi category ngoài phạm vi) trả `items[]` mỗi bàn `{ stream_id, shoe, round, live, wins, losses, draws, win_rate, win_streak, recent[] }` (định nghĩa thắng / hòa / shoe hiện tại như `predictions/stats`; `round` = ván mới nhất của stream; `live` = có ván mới trong `LIVE_WITHIN_MS` = 5 phút; `recent` = tối đa 10 dự đoán gần nhất **của shoe hiện tại** bỏ ván hòa (ít hơn thì lấy đúng số đang có), cũ → mới). Portal (`CategoryStreamsView`) xếp bàn theo `win_rate` của shoe hiện tại giảm dần (bàn chưa có tỷ lệ xuống cuối, hòa thì nhiều ván hơn trước, rồi theo tên) và lấy một lần khi mở trang (không interval). Không còn số liệu giả lập nào ở web-portal.

Skills khác trong `.claude/skills/`: `rbac-guard` (scope dữ liệu theo cấp trên), `flyway-migration`, `security-review`.
