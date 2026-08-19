-- ASEAN language feeds used for multilingual NLP ingestion.
-- URL checks make this seed idempotent with sources created through the API.

DO $$
DECLARE
    feed RECORD;
BEGIN
    FOR feed IN
        SELECT * FROM (VALUES
            ('b5fdf73d-f980-402a-8a87-c52141c51c48'::uuid, 'ASEAN Bahasa Indonesia — Health RSS', 'https://news.google.com/rss/search?q=penyakit+OR+wabah+OR+epidemi+OR+dengue&hl=id&gl=ID&ceid=ID%3Aid', 'id', 'Indonesia'),
            ('6aad7891-6d17-4073-808c-65db5a3c95ef'::uuid, 'ASEAN Bahasa Melayu — Health RSS', 'https://news.google.com/rss/search?q=penyakit+OR+wabak+OR+denggi&hl=ms&gl=MY&ceid=MY%3Ams', 'ms', 'Malaysia'),
            ('194c1e24-b1ff-4571-bfa0-5bfefcb7d7b9'::uuid, 'ASEAN ภาษาไทย — Health RSS', 'https://news.google.com/rss/search?q=%E0%B9%82%E0%B8%A3%E0%B8%84+OR+%E0%B9%84%E0%B8%82%E0%B9%89%E0%B9%80%E0%B8%A5%E0%B8%B7%E0%B8%AD%E0%B8%94%E0%B8%AD%E0%B8%AD%E0%B8%81+OR+%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%B2%E0%B8%94&hl=th&gl=TH&ceid=TH%3Ath', 'th', 'Thailand'),
            ('49fee0c4-8f03-4856-8754-a91cd0152258'::uuid, 'ASEAN Tiếng Việt — Health RSS', 'https://news.google.com/rss/search?q=b%E1%BB%87nh+OR+d%E1%BB%8Bch+OR+s%E1%BB%91t+xu%E1%BA%A5t+huy%E1%BA%BFt&hl=vi&gl=VN&ceid=VN%3Avi', 'vi', 'Vietnam'),
            ('54475d03-cd1d-43e4-8f3e-d1060cbbf160'::uuid, 'ASEAN ភាសាខ្មែរ — Health RSS', 'https://news.google.com/rss/search?q=%E1%9E%87%E1%9F%86%E1%9E%84%E1%9E%BA+OR+%E1%9E%82%E1%9F%92%E1%9E%9A%E1%9E%BB%E1%93%E1%9E%88%E1%9E%B6%E1%9E%98+OR+%E1%9E%9A%E1%9E%B6%E1%9E%8F%E1%9E%8F%E1%9F%92%E1%9E%94%E1%9E%B6%E1%9E%8F&hl=km&gl=KH&ceid=KH%3Akm', 'km', 'Cambodia'),
            ('174868ef-c700-4e79-bc33-db90969062df'::uuid, 'ASEAN ພາສາລາວ — Health RSS', 'https://news.google.com/rss/search?q=%E0%BA%9E%E0%BA%B0%E0%BA%8D%E0%BA%B2%E0%BA%94+OR+%E0%BB%84%E0%BA%82%E0%BB%89%E0%BB%80%E0%BA%A5%E0%BA%B7%E0%BA%AD%E0%BA%94%E0%BA%AD%E0%BA%AD%E0%BA%81+OR+%E0%BA%A5%E0%BA%B0%E0%BA%9A%E0%BA%B2%E0%BA%94&hl=lo&gl=LA&ceid=LA%3Alo', 'lo', 'Laos'),
            ('98c34006-c610-44cb-ba76-d604f61b3780'::uuid, 'ASEAN မြန်မာ — Health RSS', 'https://news.google.com/rss/search?q=%E1%80%9B%E1%80%B1%E1%80%AC%E1%80%82%E1%80%AB+OR+%E1%80%9E%E1%80%BD%E1%80%B1%E1%80%B8%E1%80%9C%E1%80%BD%E1%80%94%E1%80%BA%E1%80%90%E1%80%AF%E1%80%95%E1%80%BA%E1%80%80%E1%80%BD%E1%80%B1%E1%80%B8+OR+%E1%80%80%E1%80%B0%E1%80%B8%E1%80%85%E1%80%80%E1%BA%BA&hl=my&gl=MM&ceid=MM%3Amy', 'my', 'Myanmar'),
            ('e7fea443-3f14-4cd2-9419-5600a189573f'::uuid, 'ASEAN Filipino — Health RSS', 'https://news.google.com/rss/search?q=sakit+OR+dengue+OR+epidemya&hl=tl&gl=PH&ceid=PH%3Atl', 'tl', 'Philippines'),
            ('474eccac-5b70-4638-a202-904251c63e5a'::uuid, 'ASEAN English — Singapore CNA RSS', 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511', 'en', 'Singapore'),
            ('41e9a3b1-131b-4d8d-b357-56426d4a983d'::uuid, 'ASEAN Bahasa Melayu — Brunei RSS', 'https://news.google.com/rss/search?q=penyakit+OR+denggi+Brunei&hl=ms&gl=BN&ceid=BN%3Ams', 'ms', 'Brunei'),
            ('7fec6eaf-f633-485d-bff4-80dec583b417'::uuid, 'ASEAN Tetum — SBS RSS', 'https://feeds.sbs.com.au/sbs-tetum', 'tet', 'Timor-Leste')
        ) AS feeds(id, name, url, language, country)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM collector_sources WHERE config->>'url' = feed.url OR name = feed.name) THEN
            INSERT INTO collector_sources (id, name, source_type, config, schedule, enabled, created_at, updated_at)
            VALUES (
                feed.id,
                feed.name,
                'rss',
                jsonb_build_object('url', feed.url, 'language', feed.language, 'country', feed.country, 'tags', jsonb_build_array('ASEAN', 'health', feed.language)),
                'interval:120', true, NOW(), NOW()
            );
        END IF;
    END LOOP;
END $$;
