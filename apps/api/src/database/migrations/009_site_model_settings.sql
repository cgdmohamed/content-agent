-- Per-site AI model controls. NULL means "inherit system settings / allow every model".
ALTER TABLE sites ADD COLUMN IF NOT EXISTS allowed_models JSONB;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS operation_models JSONB;
