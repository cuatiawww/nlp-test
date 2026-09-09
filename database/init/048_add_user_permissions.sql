-- Add permissions column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '["*"]'::jsonb;

-- Ensure admin users have wildcard permission
UPDATE users SET permissions = '["*"]'::jsonb WHERE LOWER(role) = 'admin';
