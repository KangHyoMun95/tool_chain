-- Seed the default HOST account (phone 0000000000).
-- The password is an argon2id hash (m=19456, t=2, p=1), same parameters as the API (apps/api/src/auth/password.ts).
-- WARNING: the initial password is known and committed to the repository. Change it before any
-- non-local deployment. Never edit this file after it has been applied (Flyway checksum); use a new migration.
-- Idempotent: does nothing if the phone number already exists.
INSERT INTO users (phone_number, password, role_id, refer_user_id, status)
SELECT '0000000000', '$argon2id$v=19$m=19456,p=1,t=2$OcCU2koSdT12g7YsaSTn3A$563qwswULjqyrumgsRs6EQmfl2mkJdzK3dSRGUnN5qU', r.role_id, NULL, 'ACTIVE'
FROM roles r
WHERE r.role_name = 'HOST'
ON CONFLICT (phone_number) DO NOTHING;
