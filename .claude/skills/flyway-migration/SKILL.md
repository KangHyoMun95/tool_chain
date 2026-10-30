---
name: flyway-migration
description: Dùng skill này khi cần thêm/sửa bảng, cột, constraint, index hoặc entity TypeORM trong apps/api của ToolHackChain. Flyway là công cụ duy nhất quản lý schema; TypeORM chỉ dùng để truy vấn.
---

# Quy trình migration Flyway cho ToolHackChain

Migration nằm ở `db/migrations/`, chạy bằng service `flyway` trong `docker-compose.yml`.

## Luật bắt buộc

1. Không bao giờ sửa file migration đã được apply (kể cả thêm comment — Flyway so checksum). Muốn đổi thì tạo file mới.
2. Không bật `synchronize`, không bật `migrationsRun`, không dùng `flyway clean`. Không dùng TypeORM để sinh/chạy migration.
3. Đặt tên: `V<số tăng dần>__<mo_ta_snake_case>.sql` (vd `V4__add_stream_fee.sql`); view/function dùng `R__<mo_ta>.sql`. Mỗi file một mục đích, có comment đầu file mô tả thay đổi.
4. Một thay đổi schema = file Flyway mới + sửa entity trong `apps/api/src/database/entities/` trong cùng commit. SQL là nguồn sự thật, entity theo SQL (tên bảng, tên cột, kiểu, nullable).
5. Dùng một kiểu ràng buộc thống nhất cho status/enum: `VARCHAR` + `CHECK`, giá trị chữ HOA.
6. `game_sessions` và `predictions` không dùng ID tự sinh (ID sinh trước khi vào batch).
7. Mọi `*_id` tham chiếu bảng khác phải có FK (trừ `stream_information.streamer_id` là text) và index nếu hay được lọc.

## Quy trình

1. Viết file SQL mới trong `db/migrations/`, đọc lại để chắc chắn không phá dữ liệu hiện có (backfill trước khi thêm `NOT NULL`/`CHECK`).
2. Sửa entity tương ứng.
3. Kiểm tra trên DB tạm trước khi đề xuất chạy thật: `pnpm db:validate`, `pnpm db:info`.
4. Không tự chạy `pnpm db:migrate` lên DB thật — để người dùng xác nhận.
