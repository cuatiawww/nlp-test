-- 108_navigation_and_modules.sql
-- Dedicated relational tables and synchronization triggers for
-- Navigation Groups (Navigasi), Modules (Modul), and Sub-Modules (Sub-Modul).

-- ─── 1. TABLE: navigation_groups ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS navigation_groups (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    title_key VARCHAR(150),
    display_order INT NOT NULL DEFAULT 1,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    target_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_groups_order ON navigation_groups (display_order ASC);
CREATE INDEX IF NOT EXISTS idx_nav_groups_enabled ON navigation_groups (is_enabled);

-- ─── 2. TABLE: navigation_modules ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS navigation_modules (
    id VARCHAR(100) PRIMARY KEY,
    group_id VARCHAR(100) NOT NULL REFERENCES navigation_groups(id) ON DELETE CASCADE,
    label VARCHAR(150) NOT NULL,
    label_key VARCHAR(150),
    href VARCHAR(255),
    icon VARCHAR(100) NOT NULL DEFAULT 'Circle',
    badge VARCHAR(50),
    display_order INT NOT NULL DEFAULT 1,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    target_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_modules_group ON navigation_modules (group_id, display_order ASC);
CREATE INDEX IF NOT EXISTS idx_nav_modules_enabled ON navigation_modules (is_enabled);
CREATE INDEX IF NOT EXISTS idx_nav_modules_href ON navigation_modules (href);

-- ─── 3. TABLE: navigation_sub_modules ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS navigation_sub_modules (
    id VARCHAR(100) PRIMARY KEY,
    module_id VARCHAR(100) NOT NULL REFERENCES navigation_modules(id) ON DELETE CASCADE,
    label VARCHAR(150) NOT NULL,
    label_key VARCHAR(150),
    href VARCHAR(255) NOT NULL,
    icon VARCHAR(100) NOT NULL DEFAULT 'Circle',
    badge VARCHAR(50),
    display_order INT NOT NULL DEFAULT 1,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    target_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_subs_module ON navigation_sub_modules (module_id, display_order ASC);
CREATE INDEX IF NOT EXISTS idx_nav_subs_enabled ON navigation_sub_modules (is_enabled);
CREATE INDEX IF NOT EXISTS idx_nav_subs_href ON navigation_sub_modules (href);

-- ─── 4. VIEW: v_navigation_menu (Full JSON Tree) ──────────────────────────────
CREATE OR REPLACE VIEW v_navigation_menu AS
SELECT COALESCE(
    jsonb_agg(
        jsonb_build_object(
            'id', g.id,
            'title', g.title,
            'titleKey', g.title_key,
            'order', g.display_order,
            'enabled', g.is_enabled,
            'targetRoles', g.target_roles,
            'items', COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', m.id,
                            'label', m.label,
                            'labelKey', m.label_key,
                            'href', m.href,
                            'icon', m.icon,
                            'badge', m.badge,
                            'order', m.display_order,
                            'enabled', m.is_enabled,
                            'targetRoles', m.target_roles,
                            'subItems', COALESCE(
                                (
                                    SELECT jsonb_agg(
                                        jsonb_build_object(
                                            'id', s.id,
                                            'label', s.label,
                                            'labelKey', s.label_key,
                                            'href', s.href,
                                            'icon', s.icon,
                                            'badge', s.badge,
                                            'order', s.display_order,
                                            'enabled', s.is_enabled,
                                            'targetRoles', s.target_roles
                                        ) ORDER BY s.display_order ASC
                                    )
                                    FROM navigation_sub_modules s
                                    WHERE s.module_id = m.id
                                ),
                                '[]'::jsonb
                            )
                        ) ORDER BY m.display_order ASC
                    )
                    FROM navigation_modules m
                    WHERE m.group_id = g.id
                ),
                '[]'::jsonb
            )
        ) ORDER BY g.display_order ASC
    ),
    '[]'::jsonb
) AS navigation_tree
FROM navigation_groups g;

-- ─── 5. FUNCTION: fn_sync_navigation_from_json ────────────────────────────────
-- Synchronizes JSON array into navigation_groups, navigation_modules, navigation_sub_modules
CREATE OR REPLACE FUNCTION fn_sync_navigation_from_json(nav_data JSONB)
RETURNS VOID AS $$
DECLARE
    g JSONB;
    m JSONB;
    s JSONB;
    grp_ids TEXT[] := ARRAY[]::TEXT[];
    mod_ids TEXT[] := ARRAY[]::TEXT[];
    sub_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF nav_data IS NULL OR jsonb_typeof(nav_data) <> 'array' THEN
        RETURN;
    END IF;

    -- Upsert navigation groups
    FOR g IN SELECT * FROM jsonb_array_elements(nav_data)
    LOOP
        IF g->>'id' IS NOT NULL THEN
            grp_ids := array_append(grp_ids, g->>'id');

            INSERT INTO navigation_groups (
                id, title, title_key, display_order, is_enabled, target_roles, updated_at
            ) VALUES (
                g->>'id',
                COALESCE(g->>'title', 'UNTITLED'),
                g->>'titleKey',
                COALESCE((g->>'order')::INT, 1),
                COALESCE((g->>'enabled')::BOOLEAN, TRUE),
                COALESCE(g->'targetRoles', '[]'::jsonb),
                NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                title_key = EXCLUDED.title_key,
                display_order = EXCLUDED.display_order,
                is_enabled = EXCLUDED.is_enabled,
                target_roles = EXCLUDED.target_roles,
                updated_at = NOW();

            -- Upsert modules
            IF g ? 'items' AND jsonb_typeof(g->'items') = 'array' THEN
                FOR m IN SELECT * FROM jsonb_array_elements(g->'items')
                LOOP
                    IF m->>'id' IS NOT NULL THEN
                        mod_ids := array_append(mod_ids, m->>'id');

                        INSERT INTO navigation_modules (
                            id, group_id, label, label_key, href, icon, badge, display_order, is_enabled, target_roles, updated_at
                        ) VALUES (
                            m->>'id',
                            g->>'id',
                            COALESCE(m->>'label', 'Untitled Module'),
                            m->>'labelKey',
                            m->>'href',
                            COALESCE(m->>'icon', 'Folder'),
                            m->>'badge',
                            COALESCE((m->>'order')::INT, 1),
                            COALESCE((m->>'enabled')::BOOLEAN, TRUE),
                            COALESCE(m->'targetRoles', '[]'::jsonb),
                            NOW()
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            group_id = EXCLUDED.group_id,
                            label = EXCLUDED.label,
                            label_key = EXCLUDED.label_key,
                            href = EXCLUDED.href,
                            icon = EXCLUDED.icon,
                            badge = EXCLUDED.badge,
                            display_order = EXCLUDED.display_order,
                            is_enabled = EXCLUDED.is_enabled,
                            target_roles = EXCLUDED.target_roles,
                            updated_at = NOW();

                        -- Upsert sub-modules
                        IF m ? 'subItems' AND jsonb_typeof(m->'subItems') = 'array' THEN
                            FOR s IN SELECT * FROM jsonb_array_elements(m->'subItems')
                            LOOP
                                IF s->>'id' IS NOT NULL THEN
                                    sub_ids := array_append(sub_ids, s->>'id');

                                    INSERT INTO navigation_sub_modules (
                                        id, module_id, label, label_key, href, icon, badge, display_order, is_enabled, target_roles, updated_at
                                    ) VALUES (
                                        s->>'id',
                                        m->>'id',
                                        COALESCE(s->>'label', 'Untitled Sub-Module'),
                                        s->>'labelKey',
                                        COALESCE(s->>'href', '#'),
                                        COALESCE(s->>'icon', 'Circle'),
                                        s->>'badge',
                                        COALESCE((s->>'order')::INT, 1),
                                        COALESCE((s->>'enabled')::BOOLEAN, TRUE),
                                        COALESCE(s->'targetRoles', '[]'::jsonb),
                                        NOW()
                                    )
                                    ON CONFLICT (id) DO UPDATE SET
                                        module_id = EXCLUDED.module_id,
                                        label = EXCLUDED.label,
                                        label_key = EXCLUDED.label_key,
                                        href = EXCLUDED.href,
                                        icon = EXCLUDED.icon,
                                        badge = EXCLUDED.badge,
                                        display_order = EXCLUDED.display_order,
                                        is_enabled = EXCLUDED.is_enabled,
                                        target_roles = EXCLUDED.target_roles,
                                        updated_at = NOW();
                                END IF;
                            END LOOP;
                        END IF;
                    END IF;
                END LOOP;
            END IF;
        END IF;
    END LOOP;

    -- Clean up removed sub-modules
    IF array_length(sub_ids, 1) > 0 THEN
        DELETE FROM navigation_sub_modules WHERE NOT (id = ANY(sub_ids));
    ELSE
        DELETE FROM navigation_sub_modules;
    END IF;

    -- Clean up removed modules
    IF array_length(mod_ids, 1) > 0 THEN
        DELETE FROM navigation_modules WHERE NOT (id = ANY(mod_ids));
    ELSE
        DELETE FROM navigation_modules;
    END IF;

    -- Clean up removed groups
    IF array_length(grp_ids, 1) > 0 THEN
        DELETE FROM navigation_groups WHERE NOT (id = ANY(grp_ids));
    ELSE
        DELETE FROM navigation_groups;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ─── 6. TRIGGER: Auto-sync on system_settings change ──────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_sync_navigation_menu()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id = 'branding' AND (NEW.config_data ? 'navigation_menu') THEN
        PERFORM fn_sync_navigation_from_json(NEW.config_data->'navigation_menu');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_system_settings_navigation ON system_settings;
CREATE TRIGGER trg_sync_system_settings_navigation
AFTER INSERT OR UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION trg_fn_sync_navigation_menu();

-- ─── 7. INITIAL POPULATION & SEEDING ──────────────────────────────────────────
DO $$
DECLARE
    existing_menu JSONB;
BEGIN
    -- Check if system_settings already has navigation_menu configured
    SELECT config_data->'navigation_menu'
    INTO existing_menu
    FROM system_settings
    WHERE id = 'branding';

    IF existing_menu IS NOT NULL AND jsonb_typeof(existing_menu) = 'array' AND jsonb_array_length(existing_menu) > 0 THEN
        -- Populate tables directly from existing settings
        PERFORM fn_sync_navigation_from_json(existing_menu);
    ELSE
        -- Seed standard default navigation hierarchy
        INSERT INTO navigation_groups (id, title, title_key, display_order, is_enabled)
        VALUES
            ('grp_monitoring', 'HOME', 'sidebar.sections.monitoring', 1, TRUE),
            ('grp_dashboard', 'DASHBOARD', NULL, 2, TRUE),
            ('grp_configuration', 'CONFIGURATION', 'sidebar.sections.configuration', 3, TRUE),
            ('grp_documentation', 'DOCUMENTATION', 'sidebar.sections.documentation', 4, TRUE)
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            display_order = EXCLUDED.display_order,
            is_enabled = EXCLUDED.is_enabled;

        -- Seed Modules for HOME
        INSERT INTO navigation_modules (id, group_id, label, label_key, href, icon, display_order, is_enabled)
        VALUES
            ('mod_home', 'grp_monitoring', 'Home', 'sidebar.items.home', '/', 'Home', 1, TRUE),
            ('mod_regions', 'grp_monitoring', 'Regions/Country', 'sidebar.items.regionsCountry', '/countries', 'Globe2', 2, TRUE),
            ('mod_diseases', 'grp_monitoring', 'Diseases', 'sidebar.items.diseases', '/diseases', 'Stethoscope', 3, TRUE),
            ('mod_sources', 'grp_monitoring', 'Data Sources', 'sidebar.items.sources', '/sources', 'Radio', 4, TRUE),
            ('mod_events', 'grp_monitoring', 'Events', 'sidebar.items.events', '/events', 'Database', 5, TRUE),
            ('mod_analyze', 'grp_monitoring', 'URL Analysis', 'sidebar.items.analyze', '/analyze', 'Search', 6, TRUE),
            ('mod_crawler', 'grp_monitoring', 'Manual Crawler', 'sidebar.items.manualCrawler', '/manual-crawler', 'FileText', 7, TRUE),
            ('mod_crawl_history', 'grp_monitoring', 'Crawl History', NULL, '/crawl-history', 'History', 8, TRUE),
            ('mod_processing', 'grp_monitoring', 'Processing', 'sidebar.items.processing', '/processing', 'Activity', 9, TRUE),
            ('mod_reports', 'grp_monitoring', 'Reports', 'sidebar.items.reports', '/reports', 'FileText', 10, TRUE),
            ('mod_matrix', 'grp_monitoring', 'Matrix & ledger', 'sidebar.items.eventMatrix', '/reports/matrix', 'FileSpreadsheet', 11, TRUE)
        ON CONFLICT (id) DO NOTHING;

        -- Seed Sub-Modules for mod_analyze
        INSERT INTO navigation_sub_modules (id, module_id, label, href, icon, display_order, is_enabled)
        VALUES
            ('sub_analyze_live', 'mod_analyze', 'Live Article Analysis', '/analyze', 'Search', 1, TRUE),
            ('sub_analyze_manual', 'mod_analyze', 'Manual Crawler Job', '/manual-crawler', 'FileText', 2, TRUE)
        ON CONFLICT (id) DO NOTHING;

        -- Seed Sub-Modules for mod_reports
        INSERT INTO navigation_sub_modules (id, module_id, label, href, icon, display_order, is_enabled)
        VALUES
            ('sub_reports_list', 'mod_reports', 'Sitrep Bulletins', '/reports', 'FileText', 1, TRUE),
            ('sub_reports_matrix', 'mod_reports', 'Matrix & Ledger', '/reports/matrix', 'FileSpreadsheet', 2, TRUE)
        ON CONFLICT (id) DO NOTHING;

        -- Seed Modules for CONFIGURATION
        INSERT INTO navigation_modules (id, group_id, label, label_key, href, icon, display_order, is_enabled)
        VALUES
            ('mod_locations', 'grp_configuration', 'Locations', 'sidebar.items.locations', '/locations', 'MapPin', 1, TRUE),
            ('mod_disease_master', 'grp_configuration', 'Disease Master', 'sidebar.items.diseaseMaster', '/disease-master', 'Stethoscope', 2, TRUE),
            ('mod_credibility', 'grp_configuration', 'Credibility', 'sidebar.items.credibility', '/source-credibility', 'ShieldCheck', 3, TRUE),
            ('mod_outbreak_rules', 'grp_configuration', 'Outbreak Rules', 'sidebar.items.outbreakRules', '/outbreak-rules', 'AlertTriangle', 4, TRUE),
            ('mod_nlp', 'grp_configuration', 'NLP Configuration', NULL, '/nlp-labels', 'Cpu', 5, TRUE),
            ('mod_nlp_labels', 'grp_configuration', 'NLP Labels', 'sidebar.items.nlpLabels', '/nlp-labels', 'Tags', 6, TRUE),
            ('mod_nlp_keywords', 'grp_configuration', 'NLP Keywords', 'sidebar.items.nlpKeywords', '/nlp-keywords', 'BookText', 7, TRUE),
            ('mod_interoperability', 'grp_configuration', 'Interoperability', NULL, '/interoperability', 'Settings', 8, TRUE)
        ON CONFLICT (id) DO NOTHING;

        -- Seed Sub-Modules for mod_nlp
        INSERT INTO navigation_sub_modules (id, module_id, label, label_key, href, icon, display_order, is_enabled)
        VALUES
            ('sub_nlp_labels', 'mod_nlp', 'NLP Labels', 'sidebar.items.nlpLabels', '/nlp-labels', 'Tags', 1, TRUE),
            ('sub_nlp_keywords', 'mod_nlp', 'NLP Keywords', 'sidebar.items.nlpKeywords', '/nlp-keywords', 'BookText', 2, TRUE),
            ('sub_nlp_markers', 'mod_nlp', 'Language Markers', 'sidebar.items.languageMarkers', '/language-markers', 'Languages', 3, TRUE),
            ('sub_nlp_extraction', 'mod_nlp', 'Extraction Rules', 'sidebar.items.extractionRules', '/extraction-rules', 'Braces', 4, TRUE),
            ('sub_nlp_models', 'mod_nlp', 'Language Models', 'sidebar.items.languageModels', '/language-models', 'Cpu', 5, TRUE)
        ON CONFLICT (id) DO NOTHING;

        -- Seed Modules for DOCUMENTATION
        INSERT INTO navigation_modules (id, group_id, label, href, icon, display_order, is_enabled)
        VALUES
            ('mod_business_process', 'grp_documentation', 'Business Process', '/business-process', 'BookText', 1, TRUE)
        ON CONFLICT (id) DO NOTHING;

        -- Also write seeded tree to system_settings
        UPDATE system_settings
        SET config_data = jsonb_set(
            config_data,
            '{navigation_menu}',
            (SELECT navigation_tree FROM v_navigation_menu)
        )
        WHERE id = 'branding';
    END IF;
END $$;
