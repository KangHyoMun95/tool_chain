-- Dữ liệu khởi tạo: 3 role. role_id do DB tự sinh (UUID), code tra role theo role_name.
-- KHÔNG tạo tài khoản ở đây: HOST / ADMIN tạo bằng CLI (pnpm --filter @toolhackchain/api create-host / create-user).
INSERT INTO roles (role_name) VALUES ('HOST'), ('ADMIN'), ('USER');
