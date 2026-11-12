-- Ngày đăng ký của số điện thoại chờ cấp tài khoản (hiển thị ở trang "Quản lý người mới" của HOST).
-- Nullable, không default: dòng cũ NULL (không biết ngày); api ghi now() tường minh cho dòng mới.
ALTER TABLE users_register ADD COLUMN created_at TIMESTAMPTZ;
