---
name: nextjs-frontend
description: Dùng skill này khi tạo hoặc sửa bất kỳ trang, component, hook, hoặc logic gọi API nào trong apps/web (Next.js) của ToolHackChain. Quy định cấu trúc route theo role, cách dùng Tailwind, TanStack Query và tổ chức component.
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

## Tailwind CSS

- Không viết CSS module hay style riêng trừ khi thật sự cần animation phức tạp.
- Ưu tiên tổ hợp class trực tiếp trong JSX; nếu 1 tổ hợp class lặp lại ≥ 3 nơi, tách thành component thay vì tách class.
- Dùng `clsx` (hoặc `cn` helper) khi class có điều kiện, không nối chuỗi thủ công.
- Định nghĩa màu/spacing theo theme trong `tailwind.config.ts`, không hardcode mã hex trong JSX.

## Tổ chức component

```
apps/web/components/
├── ui/           # component thuần UI, tái sử dụng được (Button, Table, Modal...)
├── host/         # component đặc thù cho phần Host
├── admin/        # component đặc thù cho phần Admin Con
└── shared/       # component dùng chung nhiều nơi (vd PointsBadge)
```

- Component trong `ui/` không được biết gì về domain (không import type `User`, `AdminCon`...).
- Form dùng `react-hook-form` + `zod` để validate, schema đặt cạnh file form hoặc trong `lib/schemas/`.

## Framework UI:

- Sử dụng thư viện Antd Degin component

## Khi review code frontend

Tự kiểm tra và báo nếu phát hiện:
- Gọi `fetch`/axios trực tiếp trong component thay vì qua hook TanStack Query
- Thiếu kiểm tra role ở `layout.tsx` của route group
- Style viết tay bằng hex/px thay vì dùng token Tailwind
- Component trong `ui/` bị lẫn logic nghiệp vụ
