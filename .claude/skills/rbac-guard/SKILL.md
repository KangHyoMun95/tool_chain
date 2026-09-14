---
name: rbac-guard
description: Dùng skill này bất cứ khi nào tạo hoặc sửa API endpoint, service method, hoặc query liên quan tới Admin (Host), Admin (Con), hoặc User trong ToolHackChain. Đảm bảo mọi thao tác dữ liệu đều scope đúng theo phân cấp quyền, tránh leak dữ liệu chéo giữa các Admin Con.
---

# RBAC Guard cho ToolHackChain

Mô hình phân quyền:

```
Admin (Host) -> quản lý nhiều Admin (Con) -> mỗi Admin (Con) quản lý nhiều User
```

## Checklist bắt buộc khi sinh code liên quan tới quyền

1. **Xác định route thuộc role nào**: HOST / ADMIN_CON / USER. Không đoán — nếu không rõ, hỏi lại người dùng.
2. **Guard ở tầng controller**: mọi route của Admin Con hoặc User phải qua `RolesGuard` + decorator `@Roles(...)`.
3. **Scope ở tầng service/query**: không bao giờ query User hoặc AdminCon theo `id` đơn thuần. Luôn kèm điều kiện sở hữu:
   - Query User: phải kèm `WHERE managedByAdminConId = :currentAdminConId`
   - Query AdminCon: phải kèm `WHERE hostId = :currentHostId` (khi Host thao tác)
   - Admin Con KHÔNG được có bất kỳ query nào chạm tới AdminCon khác hoặc User không thuộc mình.
4. **Cấp/trừ điểm**: không cộng/trừ trực tiếp field điểm. Luôn đi qua `PointsService` và ghi `PointTransaction` (audit trail).
5. **Homepage Config**: chỉ Host được ghi (write). User chỉ đọc, và chỉ đọc đúng config của AdminCon đang quản lý mình.

## Khi review code (được yêu cầu review/audit)

Tự kiểm tra và báo cáo rõ nếu phát hiện:
- Endpoint thiếu `@Roles()` guard
- Query thiếu điều kiện scope theo cấp trên
- Có đường nào để Admin Con A đọc/sửa được dữ liệu của Admin Con B
- Điểm bị cộng/trừ trực tiếp mà không qua PointsService/PointTransaction
