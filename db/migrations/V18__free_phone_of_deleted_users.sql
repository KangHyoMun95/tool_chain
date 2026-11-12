-- Xóa user là xóa mềm nhưng phone_number UNIQUE khiến số của user đã xóa không dùng lại được.
-- Từ nay lúc xóa, api đổi phone_number thành '<số gốc>_<epoch ms>' (số gốc vẫn là phần trước dấu '_', không mất dữ liệu).
-- 1) Nới độ dài: số 20 chữ số + '_' + 13 chữ số epoch ms = 34 ký tự.
ALTER TABLE users ALTER COLUMN phone_number TYPE VARCHAR(40);

-- 2) User đã bị xóa trước đây: giải phóng số theo cùng quy ước (số hợp lệ chỉ gồm chữ số nên chưa có '_' nghĩa là chưa đổi).
UPDATE users
SET phone_number = phone_number || '_' || (extract(epoch FROM clock_timestamp()) * 1000)::bigint
WHERE status = 'DELETED' AND position('_' IN phone_number) = 0;
