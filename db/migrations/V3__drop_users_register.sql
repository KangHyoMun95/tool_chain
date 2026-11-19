-- Bỏ luồng "đăng ký số điện thoại chờ Admin cấp tài khoản": portal tự tạo USER ngay (xem CLAUDE.md, mục Đăng ký).
-- Xóa bảng kéo theo unique (phone_number) và khóa chính; bảng không có khóa ngoại trỏ tới / từ nó.
DROP TABLE users_register;
