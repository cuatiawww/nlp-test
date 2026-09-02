-- 035_system_settings.sql
-- System Configuration & Audit Logs for Console Module
CREATE TABLE IF NOT EXISTS system_settings (
    id          VARCHAR(50) PRIMARY KEY,
    config_data JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(100)
);

INSERT INTO system_settings (id, config_data)
SELECT 'branding', json_build_object(
    'app_name', 'ASEAN Disease Outbreak Surveillance AI',
    'app_tagline', 'Real-time Multilingual Disease Monitoring',
    'sidebar_logo_url', '',
    'login_logo_url', '',
    'favicon_url', '',
    'footer_text', 'Disease Surveillance AI',
    'ticker_text', ''
)::jsonb
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE id = 'branding');

CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    username    VARCHAR(100),
    action      VARCHAR(100) NOT NULL,
    resource    VARCHAR(100),
    detail      JSONB,
    ip_address  VARCHAR(50),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
