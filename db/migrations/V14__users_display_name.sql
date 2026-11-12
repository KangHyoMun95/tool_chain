-- Tên hiển thị của user (hiện thay số điện thoại ở portal và ở cột "Người cấp" của web-admin).
-- NULL = chưa đặt (user cũ). Không unique: chỉ phone_number là định danh. Đã trim, 1–50 ký tự.
ALTER TABLE users ADD COLUMN display_name VARCHAR(50);
ALTER TABLE users ADD CONSTRAINT users_display_name_check
    CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 50 AND display_name = btrim(display_name)));
