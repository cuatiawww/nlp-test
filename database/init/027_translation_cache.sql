CREATE TABLE IF NOT EXISTS translation_cache (
    content_hash VARCHAR(64) PRIMARY KEY,
    source_language VARCHAR(20) NOT NULL,
    provider VARCHAR(40) NOT NULL,
    translated_text TEXT NOT NULL,
    structured_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_last_used_at
    ON translation_cache(last_used_at);
