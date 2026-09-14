# CLAUDE.md

File này hướng dẫn Claude Code khi làm việc với source code trong repo này.

## Tổng quan dự án

**ToolHackChain** là một webapp phân cấp quản trị 3 tầng (Admin Host → Admin Con → User), cho phép:
- Admin Host quản lý toàn bộ hệ thống, tạo/sửa/deactive các Admin Con, cấp điểm cho Admin Con, và quản lý cấu hình trang chủ riêng cho từng Admin Con.
- Admin Con quản lý User thuộc quyền của mình: tạo, sửa, xóa, deactive User, và cấp điểm cho User.
- User truy cập trang chủ được setup sẵn bởi Admin Host, tùy theo Admin Con đang quản lý mình.

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
  - Cấu hình trang chủ (homepage config) cho từng Admin (Con) — nội dung trang chủ này sau đó hiển thị cho User thuộc Admin (Con) đó
- **Admin (Con)**: quản lý User trong phạm vi của mình. Có quyền:
  - CRUD User: tạo, xóa, deactive User (không tạo được Admin khác)
  - Cấp/trừ điểm cho User
  - KHÔNG được tự cấu hình trang chủ — trang chủ do Admin Host set up
- **User**: chỉ xem/tương tác với trang chủ đã được Admin Host cấu hình cho Admin (Con) đang quản lý mình. Không có quyền quản trị.

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
│   │   │   │   └── homepage-config/
│   │   │   ├── common/   # guards, decorators, interceptors dùng chung
│   │   │   └── main.ts
│   │   └── src/migrations/         # TypeORM migrations
│   └── web/              # Next.js frontend
│       ├── app/
│       └── components/
├── packages/
│   └── shared/           # types/DTO dùng chung giữa api & web
├── pnpm-workspace.yaml
└── CLAUDE.md
```

## Quy ước code

- **NestJS**: mỗi domain (admin-host, admin-con, user, points, homepage-config) là một module riêng với controller/service/entity tách biệt. Dùng Guard + custom decorator (`@Roles()`) để enforce phân quyền theo 3 role: `HOST`, `ADMIN_CON`, `USER`.
- **TypeORM**: không sửa tay migration đã chạy; luôn tạo migration mới qua `typeorm migration:generate`. Entity đặt tên số ít (`Admin`, `User`, `PointTransaction`, `HomepageConfig`).
- **Điểm số (points)**: mọi thay đổi điểm nên đi qua một service trung tâm (vd `PointsService`) và ghi log giao dịch (`PointTransaction`) thay vì cộng/trừ trực tiếp field `points` — để có audit trail.
- **Next.js**: tách route theo role (`/host/...`, `/admin/...`, `/`) với middleware kiểm tra role trước khi render.
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
pnpm --filter web dev

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
- Trang chủ (`homepage-config`) là dữ liệu do Host quản lý nhưng được User của Admin Con tương ứng đọc — thiết kế API cho 2 chiều: ghi (Host only) và đọc (User, theo đúng Admin Con của mình).
- Chưa quyết định cơ chế thiết kế nội dung trang chủ (page builder, template, v.v.) — phần này "sẽ được thiết kế sau", nên khi implement, để interface/schema đủ mở (vd JSON config) thay vì hard-code cấu trúc cứng.
- Không sử dụng tiếng việt để đặt tên cho biến, tên api, và các code liên quan.