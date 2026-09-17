# CLAUDE.md

File này hướng dẫn Claude Code khi làm việc với source code trong repo này.

## Tổng quan dự án

**ToolHackChain** là một webapp phân cấp quản trị 3 tầng (Admin Host → Admin Con → User), cho phép:
- Admin Host quản lý toàn bộ hệ thống, tạo/sửa/deactive các Admin Con, cấp điểm cho Admin Con; CHỈ xem được tên trang chủ (không trực tiếp quản lý trang chủ).
- Admin Con quản lý User thuộc quyền của mình: tạo, sửa, xóa, deactive User, và cấp điểm cho User.
- User được Admin Con (đang quản lý mình) gắn cho một hoặc nhiều trang chủ.

## Mô hình phân quyền & dữ liệu (quan trọng)

Đây là phần cốt lõi của hệ thống, cần tuân thủ nghiêm ngặt khi sinh code liên quan đến auth/permission:

```
Admin (Host)
 └── quản lý nhiều Admin (Con)
       └── mỗi Admin (Con) quản lý nhiều User
```

- **Admin Host**: role cao nhất, duy nhất hoặc số lượng giới hạn. Có quyền:
  - CRUD Admin (Con): tạo, sửa, deactive, xem danh sách
  - Cấp/trừ điểm cho Admin (Con)
  - CHỈ **xem tên** trang chủ của các Admin (Con) — KHÔNG trực tiếp quản lý trang chủ
- **Admin (Con)**: quản lý User trong phạm vi của mình. Có quyền:
  - CRUD User: tạo, xóa, deactive User (không tạo được Admin khác)
  - Cấp/trừ điểm cho User
  - Quản lý **trang chủ** (`Hostname`: tên + url): tạo/sửa/xoá; và gắn nhiều trang chủ cho một User (multi-select)
- **User**: chỉ xem/tương tác với các trang chủ được Admin (Con) quản lý mình gắn cho. Không có quyền quản trị.

> Khi sinh entity/schema, luôn đảm bảo quan hệ: `AdminCon.hostId -> Admin(Host).id` và `User.managedByAdminConId -> AdminCon.id`. Mọi query cho Admin (Con) hoặc User phải scope theo đúng cấp trên (tránh leak dữ liệu chéo giữa các Admin Con).

## Tech stack

| Layer      | Công nghệ                 |
|------------|----------------------------|
| Backend    | NestJS (Node.js)          |
| Frontend   | Next.js (React)           |
| Database   | PostgreSQL                |
| ORM        | TypeORM (migration-based) |
| Repo       | Monorepo (pnpm workspaces)|
| Package manager | pnpm                 |

## Cấu trúc thư mục (đề xuất)

```
toolhackchain/
├── apps/
│   ├── api/              # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── admin-host/
│   │   │   │   ├── admin-con/
│   │   │   │   ├── user/
│   │   │   │   ├── points/         # logic cấp/trừ điểm
│   │   │   │   └── hostname/
│   │   │   ├── common/   # guards, decorators, interceptors dùng chung
│   │   │   └── main.ts
│   │   └── src/migrations/         # TypeORM migrations
│   ├── web-admin/        # Next.js — khu quản trị (Host + Admin Con)
│   │   ├── app/
│   │   └── components/
│   └── web-portal/       # Next.js — cổng cho User (port 3001)
│       └── app/
├── packages/
│   └── shared/           # types/DTO dùng chung giữa api & web
├── pnpm-workspace.yaml
└── CLAUDE.md
```

## Quy ước code

- **NestJS**: mỗi domain (admin-host, admin-con, user, points, hostname) là một module riêng với controller/service/entity tách biệt. Dùng Guard + custom decorator (`@Roles()`) để enforce phân quyền theo 3 role: `HOST`, `ADMIN_CON`, `USER`.
- **TypeORM**: không sửa tay migration đã chạy; luôn tạo migration mới qua `typeorm migration:generate`. Entity đặt tên số ít (`Admin`, `User`, `PointTransaction`, `Hostname`).
- **Điểm số (points)**: mọi thay đổi điểm nên đi qua một service trung tâm (vd `PointsService`) và ghi log giao dịch (`PointTransaction`) thay vì cộng/trừ trực tiếp field `points` — để có audit trail.
- **Audit (BẮT BUỘC)**: MỌI thay đổi dữ liệu (create / update / delete / deactivate / activate / cấp điểm ...) đều phải ghi lại qua `AuditService.record()` (module `modules/audit`, đã `@Global()`). Inject `AuditService` vào service và gọi `record()` sau khi thao tác thành công, truyền `action`, `entityType`, `entityId`, `actorBy` (id người thực hiện), và `changes` (mỗi field: `columnName` + `oldValue`/`newValue`). KHÔNG log mật khẩu — dùng `'***'`. Bảng `audit_logs` không có khóa ngoại (lưu theo giá trị) để audit sống sót khi bản ghi gốc bị xoá.
- **Next.js (web-admin)**: tách route theo role (`/host/...`, `/admin/...`, `/`) với middleware kiểm tra role trước khi render.
- **DTO/Validation**: dùng `class-validator` + `class-transformer` ở NestJS cho mọi input.

## Lệnh thường dùng

> Node: dùng Node >= 18.18 (repo pin Node 20 trong `.nvmrc` — chạy `nvm use` trước). Next.js 14 không chạy được trên Node < 18.18.

```bash
# Cài đặt
pnpm install

# Chạy dev cả BE + FE (nếu cấu hình turbo/concurrently)
pnpm dev

# Chỉ chạy backend
pnpm --filter api start:dev

# Chỉ chạy frontend
pnpm --filter @toolhackchain/web-admin dev   # admin (port 3000)
pnpm --filter @toolhackchain/web-portal dev  # portal (port 3001)

# Tạo migration mới
pnpm --filter api typeorm migration:generate -- -n TenMigration

# Chạy migration
pnpm --filter api typeorm migration:run

# Test
pnpm --filter api test
```

> `migration:generate` cần một PostgreSQL đang chạy để so sánh schema hiện tại với entity. Entity có PK kiểu uuid nên cần extension `uuid-ossp` — TypeORM tự tạo khi chạy migration nếu DB user có quyền `CREATE EXTENSION` (managed DB có thể phải bật thủ công).

## Lưu ý cho Claude khi code

- Khi thêm tính năng mới liên quan đến quyền, luôn hỏi lại: tính năng này thuộc quyền của Host, Admin Con, hay User? Không giả định.
- Khi sinh API, luôn có middleware/guard kiểm tra scope dữ liệu (Admin Con A không được thấy/sửa User của Admin Con B).
- Khi viết/sửa bất kỳ service nào có thao tác thay đổi dữ liệu, PHẢI gọi `AuditService.record()` cho thao tác đó (xem mục Audit ở "Quy ước code"). Nếu review/audit code, báo rõ nếu có mutation không ghi audit.
- Trang chủ (`hostname`: tên + url) do **Admin Con** quản lý (CRUD) và gắn cho User của mình; **Host chỉ xem được tên**, không sửa. Mọi query hostname phải scope theo `owner_sub_admin_id` = Admin Con; gán cho User phải đảm bảo cả User lẫn hostname đều thuộc Admin Con đó.
- Trang chủ lưu dạng quan hệ (bảng `hostname` với cột `name`, `url`), KHÔNG dùng JSON. Quan hệ User↔Hostname là nhiều-nhiều qua bảng `user_hostnames`.
- Không sử dụng tiếng việt để đặt tên cho biến, tên api, tên file, tên module, và các code liên quan.