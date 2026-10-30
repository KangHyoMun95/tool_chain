-- Unify users.status with the other tables: uppercase values.
-- active -> ACTIVE, inactive -> DEACTIVE, deleted -> DELETED (soft delete).

ALTER TABLE users DROP CONSTRAINT users_status_check;

UPDATE users
SET status = CASE status
    WHEN 'active'   THEN 'ACTIVE'
    WHEN 'inactive' THEN 'DEACTIVE'
    WHEN 'deleted'  THEN 'DELETED'
    ELSE status
END;

ALTER TABLE users ALTER COLUMN status SET DEFAULT 'ACTIVE';

ALTER TABLE users
    ADD CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'DEACTIVE', 'DELETED'));
