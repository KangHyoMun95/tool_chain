-- Số điện thoại đăng ký từ portal (POST /api/users-register). Admin xem danh sách này để cấp tài khoản.
-- Chỉ có hai trường; phone_number UNIQUE để một số điện thoại không bị ghi nhiều lần.
CREATE TABLE users_register (
    user_register_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number     VARCHAR(20) NOT NULL UNIQUE
);
