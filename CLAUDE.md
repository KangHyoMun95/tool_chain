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
| Message bus / cache | Redis (Redis Stream cho event, cache key_id → stream_id) |
| Auth | JWT, session lưu trên Redis |
| Crawler | Python, quản lý dependency bằng pip (`pyproject.toml`) |
| AI predict | Python (`apps/ai/`) |
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
│   │       ├── ticks/                     # luồng ghi DB theo batch
│   │       └── realtime/                  # luồng SSE đẩy xuống client
│   ├── crawl-agent/         # Python — crawler, publish event vào Redis
│   ├── ai/                  # Python — service AI predict, đọc dữ liệu từ DB
│   ├── web-admin/           # Next.js — CHỈ UI (Host/Admin)
│   └── web-portal/          # Next.js — CHỈ UI (User)
├── db/migrations/           # Flyway SQL migration (nguồn sự thật của schema)
├── packages/shared/src/     # type/contract dùng chung TS
│   └── realtime.ts          # schema event realtime
├── docker-compose.yml
└── .env
```

### Ranh giới trách nhiệm
- **`web-admin`, `web-portal`**: chỉ có UI. Không đặt business logic, không tính tiền, không lọc quyền ở client.
- **`api`**: nơi duy nhất được đổi `balance`, tạo transaction và quyết định ai nhận event nào.
- **`crawl-agent`**: chỉ thu thập và publish. Không ghi DB trực tiếp.
- **`ai`**: đọc dữ liệu (game_sessions, lịch sử kết quả) từ DB và sinh dự đoán. **Không** được đổi `balance`, không ghi `prediction_subscriptions` hay `transactions`. Kết quả dự đoán phải đi qua `api` để chạy billing và đẩy SSE. <!-- TODO: chốt kênh AI trả kết quả về api (đề xuất: publish vào Redis Stream) -->
- **Lưu ý độ trễ:** game_session được ghi DB theo batch (tối đa 3s), nên AI có thể thấy ván mới chậm tới vài giây sau khi crawler phát hiện. Prediction có thể về muộn hơn mức cần thiết. <!-- TODO: chốt cách AI biết có ván mới (polling DB / nhận event) -->
- Auth: xem mục **Auth & bảo mật** bên dưới.

### Contract dùng chung
`apps/crawl-agent/contract.py` và `packages/shared/src/realtime.ts` mô tả **cùng một schema event**. Sửa một bên thì **bắt buộc** sửa bên kia trong cùng một commit.

---

## Luồng dữ liệu

### Luồng 1 — Kết quả từ crawler (đã có)
```
crawl-agent ──publish──► Redis Stream ──► api consumer
                                             ├─► realtime.hub  → SSE xuống web-portal (lọc theo key_id)
                                             └─► tick-persister → ghi DB theo batch (500 dòng hoặc 3s)
```

### Luồng 2 — Dự đoán (phase 1, đi theo cùng mô hình)
```
crawler phát hiện ván mới → tạo game_session (RUNNING)
   → gửi cho AI predict → prediction
   → billing: trừ điểm các participant đang hoạt động
   → SSE: chỉ đẩy predict_result cho user đã trừ thành công
   → batch: ghi prediction xuống DB

crawler có result → cập nhật game_session (FINISHED) → settlement: hoàn điểm nếu dự đoán sai
stream tắt / crawler lỗi giữa ván → game_session (CANCELLED) → hoàn điểm toàn bộ
```

### key_id
- Format: `<lobby_name>|<category_name>|<stream_name>`, do crawler sinh ra.
- **Chuẩn hóa** (trim, lowercase) trước khi ghép. Lưu thành cột **unique** trên `streams`.
- API tra `key_id → stream_id` một lần (có cache Redis). Từ đó trở đi, mọi thứ bên trong (phòng SSE, participants, predictions) dùng **`stream_id`**, không truyền `key_id` đi khắp nơi.
- Stream chưa tồn tại thì tạo mới (lobby/category tạo theo nếu cần).

### Redis Stream consumer
- Tên consumer **cố định**, khai báo qua biến môi trường trong `docker-compose.yml` (ví dụ `CONSUMER_NAME=api-worker-0`).
- **Không dùng `docker compose up --scale`** cho service consumer. Các replica sẽ dùng chung biến môi trường, tức là trùng tên consumer. Cần thêm instance thì khai báo service riêng với tên consumer riêng.
- Khi khởi động: đọc PEL của chính mình (`XREADGROUP ... STREAMS key 0`) cho hết, sau đó mới đọc `>`.
- **Chỉ `XACK` sau khi DB đã commit.**
- Mọi handler phải **idempotent**, vì message có thể được xử lý lại.

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
| `lobbies` | lobby_id, lobby_name, created_at (default now), status | status: `ACTIVE` (default) \| `DEACTIVE` \| `ARCHIVE` |
| `categories` | category_id, category_name, lobby_id, created_at (default now), status | status: `ACTIVE` (default) \| `DEACTIVE` \| `ARCHIVE` |
| `streams` | stream_id, stream_name, category_id, key_id (unique), status | status: `ACTIVE` (default) \| `DEACTIVE` \| `ARCHIVE` |
| `stream_information` | stream_information_id, stream_id, streamer_id | `streamer_id` là **tên** người live (text), không phải FK |
| `game_sessions` | game_session_id, stream_id, road_count, result, status, created_at | status: `RUNNING` → `FINISHED` \| `CANCELLED` |
| `predictions` | prediction_id, stream_id, game_session_id (**unique**), predict_result, confidence_score, created_at | mỗi ván của mỗi stream chỉ có 1 prediction |
| `stream_participants` | stream_participant_id, user_id, stream_id, last_seen_at, created_at | unique (user_id, stream_id) |
| `prediction_subscriptions` | prediction_subscription_id, user_id, prediction_id, fee_amount, refunded_at, created_at | unique (user_id, prediction_id) |
| `transactions` | transaction_id, user_id, predictions_subscriptions_id (nullable), transaction_type, amount, balance_before, balance_after, created_by, created_at | |

`transaction_type`: `MINT`, `TRANSFER_OUT`, `TRANSFER_IN`, `CHARGE`, `REFUND`.

**ID của `game_sessions` và `predictions` phải được sinh trước khi vào batch** (natural key từ nguồn, hoặc UUID/ULID sinh trong code). Không dùng serial do DB sinh, vì subscription có thể tham chiếu tới prediction còn nằm trong buffer.

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

### SSE (đang giữ lại)
`GET /api/stream` hiện đang `@Public()` (EventSource không gửi được `Authorization`). Kế hoạch: `POST /api/realtime/ticket` → ticket một lần, TTL 30s trong Redis, SSE nhận `?ticket=` (tuyệt đối không đưa access token lên query string), và đóng SSE khi session bị thu hồi. Chưa làm.

### Bảo mật chung
Helmet, CORS chỉ cho `CORS_ORIGINS` (`credentials: true`), throttler lưu Redis, `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`), body tối đa 100kb, exception filter global (không lộ stack / lỗi DB), cột `users.password` là `select: false`, không log mật khẩu / token. Thiếu `JWT_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`, `DATABASE_URL`, `CORS_ORIGINS` thì app dừng ngay (`config/env.validation.ts`). `SameSite=Strict` ⇒ ở production web và api phải cùng site.

### Tạo user đầu tiên
```bash
NEW_USER_PHONE=... NEW_USER_PASSWORD=... pnpm --filter @toolhackchain/api create-host      # thiếu env thì hỏi (mật khẩu được ẩn), tối thiểu 12 ký tự
pnpm --filter @toolhackchain/api create-user --role ADMIN --refer-phone <phone của HOST>   # USER thì refer tới ADMIN
```

---

## Phạm vi phase 1 / phase 2

**Phase 1 (bắt buộc có):** toàn bộ mục *Quy tắc bất biến về tiền*, lọc event ở server, ID sinh trước khi vào batch, unique constraint, status của game_session, settlement và hoàn tiền.

**Phase 2 (chưa làm, đừng tự ý triển khai):**
- Phát lại prediction đã trả tiền khi reconnect (API lấy lại hoặc `Last-Event-ID`).
- Bỏ qua prediction về muộn khi session không còn `RUNNING`. **Phase 1 vẫn phải log trường hợp này** để đo tần suất.
- UI bật/tắt tham gia và hiển thị phí mỗi ván.
- Tối ưu fan-out cho phòng đông người.
- Fee cấu hình theo stream/category (phase 1 dùng hằng số).

---

## Lệnh thường dùng

> Node >= 18.18 (repo pin Node 20 trong `.nvmrc`, chạy `nvm use` trước). Tên package: `@toolhackchain/api`, `@toolhackchain/web-admin`, `@toolhackchain/web-portal`, `@toolhackchain/shared`.

```bash
# Hạ tầng (Postgres, Redis) + Flyway tự migrate. Lần đầu: cp .env.example .env và cp apps/api/.env.example apps/api/.env
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

Khi tạo/sửa UI, PHẢI đọc và bám file design của đúng app; hai app KHÔNG dùng chung theme. Đặt token màu/typography tập trung (vd `ConfigProvider theme` trong `app/providers.tsx`), không hardcode hex rải rác.

- `apps/web-admin` — Dark SOC / Cyber-Threat: `.claude/designs/WEB-ADMIN.DESIGN.md` (nền `#0A0E14`, primary cyan `#22D3EE`, heading monospace, bảng severity nhất quán). Dùng skill `nextjs-frontend` (antd + pro-components).
- `apps/web-portal` — Nexus AI Royale / Royal Purple Analytics (nguồn: Stitch `projects/10681042779717465733`): `.claude/designs/WEB-PORTAL.DESIGN.md` (nền sáng lavender `#F3E8FF`→`#F5D0FE`, header tím `#581C87`→`#7E22CE`, nhấn vàng amber `#F59E0B`, xanh lá/hồng đỏ chỉ cho đúng–sai, font Outfit + Plus Jakarta Sans, không monospace).

Skills khác trong `.claude/skills/`: `rbac-guard` (scope dữ liệu theo cấp trên), `flyway-migration`, `security-review`.
