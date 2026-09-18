-- Migration 093: Seed Native ASEAN Script Aliases (Thai, Khmer, Burmese, Lao, Vietnamese)
-- Enables instant, zero-translation, sub-millisecond recognition of native script city mentions

DO $$
BEGIN
    -- Ensure helper function exists
    CREATE OR REPLACE FUNCTION _seed_location_alias(
        p_canonical_name TEXT,
        p_country TEXT,
        p_alias TEXT,
        p_lang VARCHAR(12),
        p_preferred BOOLEAN DEFAULT FALSE
    ) RETURNS VOID AS $fn$
    DECLARE
        v_loc_id UUID;
    BEGIN
        SELECT id INTO v_loc_id
        FROM locations
        WHERE LOWER(name) = LOWER(p_canonical_name)
          AND LOWER(country) = LOWER(p_country)
        LIMIT 1;

        IF v_loc_id IS NOT NULL THEN
            INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
            VALUES (v_loc_id, p_alias, p_lang, p_preferred)
            ON CONFLICT (location_id, alias_name, language)
            DO UPDATE SET alias_name = EXCLUDED.alias_name, is_preferred = EXCLUDED.is_preferred;
        END IF;
    END;
    $fn$ LANGUAGE plpgsql;

    -- =========================================================================
    -- THAILAND (Aksara Thai)
    -- =========================================================================
    PERFORM _seed_location_alias('Thailand', 'Thailand', 'ประเทศไทย', 'th', true);
    PERFORM _seed_location_alias('Thailand', 'Thailand', 'ไทย', 'th', false);
    PERFORM _seed_location_alias('Bangkok', 'Thailand', 'กรุงเทพฯ', 'th', true);
    PERFORM _seed_location_alias('Bangkok', 'Thailand', 'กรุงเทพมหานคร', 'th', false);
    PERFORM _seed_location_alias('Bangkok', 'Thailand', 'กทม.', 'th', false);
    PERFORM _seed_location_alias('Chiang Mai', 'Thailand', 'เชียงใหม่', 'th', true);
    PERFORM _seed_location_alias('Phuket', 'Thailand', 'ภูเก็ต', 'th', true);
    PERFORM _seed_location_alias('Pattaya', 'Thailand', 'พัทยา', 'th', true);
    PERFORM _seed_location_alias('Nonthaburi', 'Thailand', 'นนทบุรี', 'th', true);
    PERFORM _seed_location_alias('Samut Prakan', 'Thailand', 'สมุทรปราการ', 'th', true);
    PERFORM _seed_location_alias('Chon Buri', 'Thailand', 'ชลบุรี', 'th', true);
    PERFORM _seed_location_alias('Songkhla', 'Thailand', 'สงขลา', 'th', true);
    PERFORM _seed_location_alias('Hat Yai', 'Thailand', 'หาดใหญ่', 'th', true);
    PERFORM _seed_location_alias('Nakhon Ratchasima', 'Thailand', 'นครราชสีมา', 'th', true);
    PERFORM _seed_location_alias('Nakhon Ratchasima', 'Thailand', 'โคราช', 'th', false);
    PERFORM _seed_location_alias('Khon Kaen', 'Thailand', 'ขอนแก่น', 'th', true);
    PERFORM _seed_location_alias('Udon Thani', 'Thailand', 'อุดรธานี', 'th', true);
    PERFORM _seed_location_alias('Surat Thani', 'Thailand', 'สุราษฎร์ธานี', 'th', true);
    PERFORM _seed_location_alias('Krabi', 'Thailand', 'กระบี่', 'th', true);

    -- =========================================================================
    -- CAMBODIA (Aksara Khmer)
    -- =========================================================================
    PERFORM _seed_location_alias('Cambodia', 'Cambodia', 'កម្ពុជា', 'km', true);
    PERFORM _seed_location_alias('Cambodia', 'Cambodia', 'ប្រទេសកម្ពុជា', 'km', false);
    PERFORM _seed_location_alias('Phnom Penh', 'Cambodia', 'ភ្នំពេញ', 'km', true);
    PERFORM _seed_location_alias('Siem Reap', 'Cambodia', 'សៀមរាប', 'km', true);
    PERFORM _seed_location_alias('Battambang', 'Cambodia', 'បាត់ដំបង', 'km', true);
    PERFORM _seed_location_alias('Sihanoukville', 'Cambodia', 'ព្រះសីហនុ', 'km', true);
    PERFORM _seed_location_alias('Kampong Cham', 'Cambodia', 'កំពង់ចាម', 'km', true);

    -- =========================================================================
    -- MYANMAR (Aksara Burma)
    -- =========================================================================
    PERFORM _seed_location_alias('Myanmar', 'Myanmar', 'မြန်မာ', 'my', true);
    PERFORM _seed_location_alias('Myanmar', 'Myanmar', 'မြန်မာနိုင်ငံ', 'my', false);
    PERFORM _seed_location_alias('Yangon', 'Myanmar', 'ရန်ကုန်', 'my', true);
    PERFORM _seed_location_alias('Mandalay', 'Myanmar', 'မန္တလေး', 'my', true);
    PERFORM _seed_location_alias('Naypyidaw', 'Myanmar', 'နေပြည်တော်', 'my', true);
    PERFORM _seed_location_alias('Bago', 'Myanmar', 'ပဲခူး', 'my', true);
    PERFORM _seed_location_alias('Mawlamyine', 'Myanmar', 'မော်လမြိုင်', 'my', true);

    -- =========================================================================
    -- LAOS (Aksara Lao)
    -- =========================================================================
    PERFORM _seed_location_alias('Laos', 'Laos', 'ລາວ', 'lo', true);
    PERFORM _seed_location_alias('Laos', 'Laos', 'ປະເທດລາວ', 'lo', false);
    PERFORM _seed_location_alias('Vientiane', 'Laos', 'ວຽງຈັນ', 'lo', true);
    PERFORM _seed_location_alias('Luang Prabang', 'Laos', 'ຫລວງພະບາງ', 'lo', true);
    PERFORM _seed_location_alias('Pakse', 'Laos', 'ປາກເຊ', 'lo', true);
    PERFORM _seed_location_alias('Savannakhet', 'Laos', 'ສະຫວັນນະເຂດ', 'lo', true);

    -- =========================================================================
    -- VIETNAM (Diacritics & Official Shorthand)
    -- =========================================================================
    PERFORM _seed_location_alias('Vietnam', 'Vietnam', 'Việt Nam', 'vi', true);
    PERFORM _seed_location_alias('Hanoi', 'Vietnam', 'Hà Nội', 'vi', true);
    PERFORM _seed_location_alias('Hanoi', 'Vietnam', 'Thủ đô Hà Nội', 'vi', false);
    PERFORM _seed_location_alias('Ho Chi Minh City', 'Vietnam', 'Hồ Chí Minh', 'vi', true);
    PERFORM _seed_location_alias('Ho Chi Minh City', 'Vietnam', 'Thành phố Hồ Chí Minh', 'vi', false);
    PERFORM _seed_location_alias('Ho Chi Minh City', 'Vietnam', 'TP.HCM', 'vi', false);
    PERFORM _seed_location_alias('Ho Chi Minh City', 'Vietnam', 'TP HCM', 'vi', false);
    PERFORM _seed_location_alias('Ho Chi Minh City', 'Vietnam', 'Sài Gòn', 'vi', false);
    PERFORM _seed_location_alias('Ho Chi Minh City', 'Vietnam', 'Saigon', 'en', false);
    PERFORM _seed_location_alias('Da Nang', 'Vietnam', 'Đà Nẵng', 'vi', true);
    PERFORM _seed_location_alias('Hai Phong', 'Vietnam', 'Hải Phòng', 'vi', true);
    PERFORM _seed_location_alias('Can Tho', 'Vietnam', 'Cần Thơ', 'vi', true);

END $$;
