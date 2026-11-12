-- Lần đăng nhập / làm mới phiên gần nhất của user (dashboard: "không đăng nhập > 7 ngày"). NULL = chưa từng (user cũ / chưa đăng nhập).
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
