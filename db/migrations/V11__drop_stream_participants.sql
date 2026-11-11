-- Participant của stream giờ nằm trong RAM của API (một instance), nhật ký kết nối ở stream_connections (V10).
-- Bảng stream_participants chưa từng được code nào đọc / ghi: xóa (mất dữ liệu nếu có, đã thống nhất).
DROP TABLE stream_participants;
