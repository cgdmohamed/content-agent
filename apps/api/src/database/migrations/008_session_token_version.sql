-- Allows server-side session revocation: the signed session cookie carries the
-- token_version it was issued with, and any bump invalidates older cookies.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
