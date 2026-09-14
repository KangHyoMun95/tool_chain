---
name: typeorm-migration
description: Dùng skill này khi cần thêm/sửa entity TypeORM hoặc tạo migration mới trong apps/api của ToolHackChain. Đảm bảo migration được sinh đúng quy trình, không sửa tay migration cũ, và đặt tên nhất quán.
---

# Quy trình migration TypeORM cho ToolHackChain

## Luật bắt buộc

1. Không bao giờ sửa trực tiếp một file migration đã tồn tại và đã chạy — luôn tạo migration mới.
2. Không dùng `synchronize: true` trong bất kỳ môi trường nào (kể cả local).
3. Sau khi sửa entity, luôn sinh migration bằng lệnh:
   ```
   pnpm --filter api typeorm migration:generate -- src/migrations/<TenMoTaNgan> -d src/data-source.ts
   ```
4. Đặt tên migration theo dạng PascalCase mô tả hành động: `CreateAdminHostTable`, `AddPointsColumnToUser`, `CreateHomepageConfigTable`.
5. Sau khi sinh migration, LUÔN đọc lại nội dung file migration để xác nhận:
   - Foreign key đúng hướng (`AdminCon.hostId -> Admin.id`, `User.managedByAdminConId -> AdminCon.id`)
   - Có `down()` method hợp lệ (rollback được)
   - Không có thay đổi ngoài ý muốn (migration:generate đôi khi bắt luôn diff không liên quan)
6. Không chạy `migration:run` tự động — luôn để người dùng xác nhận trước khi chạy lên database thật.

## Khi được yêu cầu "tạo/sửa entity X"

Luôn thực hiện theo thứ tự: sửa entity → sinh migration → đọc lại migration → báo cáo tóm tắt thay đổi cho người dùng trước khi đề xuất chạy.
