-- Add the standalone Manual Crawler module to existing standard roles.
UPDATE user_roles
SET permissions = permissions || '["manual_crawler"]'::jsonb,
    updated_at = NOW()
WHERE id IN ('data_analyst', 'epidemiologi', 'skk')
  AND NOT (permissions ? 'manual_crawler')
  AND NOT (permissions ? '*');
