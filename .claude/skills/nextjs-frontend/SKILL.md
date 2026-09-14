---
name: nextjs-frontend
description: Dùng skill này khi tạo hoặc sửa bất kỳ trang, component, hook, hoặc logic gọi API nào trong apps/web (Next.js) của ToolHackChain. Quy định cấu trúc route theo role, cách dùng @ant-design/pro-components (ProTable/ProForm/ProLayout), TanStack Query và tổ chức component.
---

# Convention Frontend cho ToolHackChain (apps/web)

## Routing theo role (App Router)

```
apps/web/app/
├── (host)/
│   └── host/
│       ├── admins/            # danh sách + quản lý Admin (Con)
│       ├── admins/[id]/       # chi tiết / chỉnh sửa 1 Admin Con
│       └── layout.tsx         # kiểm tra role HOST, redirect nếu không đúng
├── (admin)/
│   └── admin/
│       ├── users/              # danh sách + quản lý User
│       ├── users/[id]/
│       └── layout.tsx         # kiểm tra role ADMIN_CON
├── (public)/
│   └── page.tsx                # trang chủ hiển thị cho User, load theo AdminCon quản lý
└── login/
```

- Mỗi nhóm route (`(host)`, `(admin)`) có `layout.tsx` riêng để kiểm tra role — không kiểm tra role rải rác trong từng page.
- Đặt tên thư mục/route bằng danh từ số nhiều cho danh sách (`admins`, `users`), số ít + `[id]` cho chi tiết.

## Gọi API — TanStack Query

- Không gọi `fetch` trực tiếp trong component. Luôn bọc qua custom hook trong `lib/api/`:
  ```
  apps/web/lib/api/
  ├── admin-con.ts   # useAdminConList(), useCreateAdminCon(), ...
  ├── user.ts        # useUserList(), useCreateUser(), useUpdateUserPoints(), ...
  └── client.ts       # instance axios/fetch dùng chung, tự đính JWT vào header
  ```
- Query key đặt theo mảng có cấu trúc: `['admin-cons']`, `['admin-cons', id]`, `['users', adminConId]` — để invalidate đúng phạm vi sau mutation.
- Mọi mutation (tạo/sửa/xoá/deactive/cấp điểm) phải gọi `queryClient.invalidateQueries` đúng key liên quan ngay trong `onSuccess`.
- Wrap toàn app bằng 1 `QueryClientProvider` ở `app/providers.tsx`.

## UI Library — @ant-design/pro-components

- Toàn bộ UI dùng `antd` + `@ant-design/pro-components`, KHÔNG dùng Tailwind (đã bỏ, xem lịch sử: ban đầu chọn Tailwind, đổi sang antd để tận dụng ProTable/ProForm/ProLayout dựng sẵn cho khu vực quản trị).
- Layout gốc của mỗi route group (`(host)`, `(admin)`) dùng `ProLayout` (menu sidebar theo role, header, breadcrumb tự sinh).
- Danh sách (Admin Con, User) dùng `ProTable`: filter/search/pagination lấy trực tiếp từ props `request`, không tự viết state phân trang tay.
- Form tạo/sửa (Admin Con, User, cấp điểm) dùng `ProForm` (hoặc `ModalForm` khi mở trong popup) — không viết `<form>` tay, không dùng `react-hook-form`/`zod` nữa (ProForm tự có validate qua `rules` của antd Form).
- Popup xác nhận (deactive, xoá) dùng `Modal.confirm()` của antd, không tự viết modal riêng.
- Không hardcode màu/spacing — dùng theme token của antd (`ConfigProvider theme={{ token: {...} }}`) đặt 1 chỗ trong `app/providers.tsx`.
- Icon dùng `@ant-design/icons`, không mix thêm thư viện icon khác.

## Tổ chức component

```
apps/web/components/
├── host/         # ProTable/ProForm đặc thù cho phần Host (quản lý Admin Con)
├── admin/        # ProTable/ProForm đặc thù cho phần Admin Con (quản lý User)
└── shared/       # component dùng chung nhiều nơi (vd PointsBadge, RoleGuard)
```

- Không cần thư mục `ui/` riêng như trước — antd/pro-components đã đóng vai trò design system, chỉ tạo component custom trong `shared/` khi thực sự không có sẵn trong antd.

## Khi review code frontend

Tự kiểm tra và báo nếu phát hiện:
- Gọi `fetch`/axios trực tiếp trong component thay vì qua hook TanStack Query
- Thiếu kiểm tra role ở `layout.tsx` của route group
- Dùng class Tailwind hoặc CSS tay thay vì component/token của antd
- Tự viết bảng có phân trang/filter tay thay vì dùng `ProTable`
- Tự viết `<form>` thay vì dùng `ProForm`/`ModalForm`
