//! Crawl-history ledger GET is public like Events (HTML page still uses AuthGuard).
//! Stored manual-job matrix rows plus continuous / analyze-url outcomes.
//! Default quality is health surveillance (known disease, not UNKNOWN/non-health).
//! List queries paginate in SQL (inner LIMIT per branch) — never scan the full union.

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    asean11_fold_sql, build_pagination, calc_total_pages, internal_error, ApiResponse, AppState,
};

const EXPORT_CAP: i64 = 5_000;
const TITLE_CHARS: i32 = 220;
const EVIDENCE_LIST_CHARS: i32 = 180;
const EVIDENCE_DETAIL_CHARS: i32 = 2_000;
const SNIPPET_CHARS: i32 = 800;
const SURVEILLANCE_MIN_CONFIDENCE: &str = "0.15";
const ASEAN11_IN: &str = "'Brunei','Cambodia','Indonesia','Laos','Malaysia','Myanmar','Philippines','Singapore','Thailand','Timor-Leste','Vietnam'";
const DEFAULT_PAGE_SIZE: i64 = 25;

fn scope_sql(country_expr: &str) -> String {
    format!(
        "CASE WHEN {country} IN ({members}) THEN 'ASEAN' WHEN NULLIF(BTRIM({country}), '') IS NOT NULL THEN 'Outside ASEAN' ELSE NULL END",
        country = asean11_fold_sql(country_expr),
        members = ASEAN11_IN,
    )
}

fn source_country_sql() -> &'static str {
    "NULLIF(BTRIM(COALESCE(rr.source_country, '')), '')"
}

#[derive(Debug, Deserialize, Default)]
pub struct CrawlHistoryQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub q: Option<String>,
    pub channel: Option<String>,
    pub country: Option<String>,
    pub disease: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub status: Option<String>,
    pub needs_review: Option<bool>,
    pub has_geo: Option<bool>,
    pub job_id: Option<String>,
    pub format: Option<String>,
    pub quality: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct CrawlHistoryJobsQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub q: Option<String>,
    pub status: Option<String>,
    pub country: Option<String>,
    pub disease: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Channel {
    All,
    Manual,
    Continuous,
    AnalyzeUrl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Quality {
    Surveillance,
    Review,
    Noise,
    All,
}

fn opt_text(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn parse_channel(raw: &Option<String>) -> Channel {
    match opt_text(raw)
        .unwrap_or_default()
        .to_ascii_lowercase()
        .replace('_', "-")
        .as_str()
    {
        "" | "all" => Channel::All,
        "manual" | "manual-crawler" | "matrix" => Channel::Manual,
        "continuous" | "collector" | "pipeline" => Channel::Continuous,
        "analyze-url" | "analyze" | "url" => Channel::AnalyzeUrl,
        _ => Channel::All,
    }
}

fn channel_sql(channel: Channel) -> Option<&'static str> {
    match channel {
        Channel::All => None,
        Channel::Manual => Some("manual"),
        Channel::Continuous => Some("continuous"),
        Channel::AnalyzeUrl => Some("analyze-url"),
    }
}

fn parse_quality(raw: &Option<String>) -> Quality {
    match opt_text(raw)
        .unwrap_or_default()
        .to_ascii_lowercase()
        .replace('-', "_")
        .as_str()
    {
        "all" | "events" | "raw" => Quality::All,
        "review" | "needs_review" | "unknown" => Quality::Review,
        "noise" | "non_health" | "junk" => Quality::Noise,
        _ => Quality::Surveillance,
    }
}

fn quality_sql(quality: Quality) -> Option<&'static str> {
    match quality {
        Quality::All => None,
        Quality::Surveillance => Some("surveillance"),
        Quality::Review => Some("review"),
        Quality::Noise => Some("noise"),
    }
}

fn known_disease_sql(expr: &str) -> String {
    format!(
        "({expr} IS NOT NULL AND BTRIM({expr}) <> '' AND UPPER(BTRIM({expr})) <> 'UNKNOWN' AND UPPER(BTRIM({expr})) NOT LIKE 'NEGATIVE%')"
    )
}

fn matrix_quality_sql() -> String {
    r#"CASE
                WHEN UPPER(BTRIM(COALESCE(m.disease_name, ''))) LIKE 'NEGATIVE%' THEN 'noise'
                WHEN m.disease_name IS NULL OR UPPER(BTRIM(m.disease_name)) IN ('UNKNOWN', '') THEN 'review'
                ELSE 'surveillance'
            END"#
        .into()
}

fn pipeline_quality_sql() -> String {
    format!(
        r#"CASE
                WHEN COALESCE(de.is_health_related, FALSE) IS NOT TRUE
                     OR UPPER(BTRIM(COALESCE(de.disease_classification, ''))) LIKE 'NEGATIVE%'
                    THEN 'noise'
                WHEN de.disease_classification IS NULL
                     OR UPPER(BTRIM(de.disease_classification)) IN ('UNKNOWN', '')
                     OR COALESCE(de.confidence, 0) < {min_conf}
                    THEN 'review'
                ELSE 'surveillance'
            END"#,
        min_conf = SURVEILLANCE_MIN_CONFIDENCE
    )
}

fn matrix_quality_where(quality: Quality) -> String {
    match quality {
        Quality::All => "TRUE".into(),
        Quality::Surveillance => format!("{} ", known_disease_sql("m.disease_name")),
        Quality::Review => format!(
            "UPPER(BTRIM(COALESCE(m.disease_name, ''))) NOT LIKE 'NEGATIVE%' AND NOT {}",
            known_disease_sql("m.disease_name")
        ),
        Quality::Noise => "UPPER(BTRIM(COALESCE(m.disease_name, ''))) LIKE 'NEGATIVE%'".into(),
    }
}

fn event_quality_where(quality: Quality) -> String {
    let known = known_disease_sql("de.disease_classification");
    match quality {
        Quality::All => "TRUE".into(),
        Quality::Surveillance => format!(
            "de.is_health_related = TRUE AND {known} AND COALESCE(de.confidence, 0) >= {min}",
            known = known,
            min = SURVEILLANCE_MIN_CONFIDENCE
        ),
        Quality::Review => format!(
            "de.is_health_related = TRUE
             AND UPPER(BTRIM(COALESCE(de.disease_classification, ''))) NOT LIKE 'NEGATIVE%'
             AND (NOT {known} OR COALESCE(de.confidence, 0) < {min})",
            known = known,
            min = SURVEILLANCE_MIN_CONFIDENCE
        ),
        Quality::Noise => "COALESCE(de.is_health_related, FALSE) IS NOT TRUE
             OR UPPER(BTRIM(COALESCE(de.disease_classification, ''))) LIKE 'NEGATIVE%'"
            .into(),
    }
}

fn parse_status(raw: &Option<String>) -> Option<String> {
    match opt_text(raw).unwrap_or_default().to_ascii_lowercase().as_str() {
        "processed" | "needs_review" | "failed" => opt_text(raw).map(|value| value.to_ascii_lowercase()),
        _ => None,
    }
}

fn parse_job_id(raw: &Option<String>) -> Result<Option<Uuid>, (StatusCode, Json<Value>)> {
    match opt_text(raw) {
        None => Ok(None),
        Some(value) => Uuid::parse_str(&value).map(Some).map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"success": false, "error": "job_id must be a UUID"})),
            )
        }),
    }
}

fn parse_row_id(raw: &str) -> Result<Uuid, (StatusCode, Json<Value>)> {
    Uuid::parse_str(raw.trim()).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "id must be a UUID"})),
        )
    })
}

fn history_pagination(page: Option<i64>, per_page: Option<i64>) -> (i64, i64, i64) {
    let p = page.unwrap_or(1).max(1);
    let pp = per_page.unwrap_or(DEFAULT_PAGE_SIZE).max(1).min(100);
    (p, pp, (p - 1) * pp)
}

fn export_limit(per_page: Option<i64>) -> i64 {
    per_page.unwrap_or(2_000).max(1).min(EXPORT_CAP)
}

fn csv_cell(value: &Value) -> String {
    let text = match value {
        Value::Null => String::new(),
        Value::Bool(flag) => {
            if *flag {
                "True".into()
            } else {
                "False".into()
            }
        }
        Value::Number(number) => number.to_string(),
        Value::String(text) => text.clone(),
        other => other.to_string(),
    };
    format!("\"{}\"", text.replace('"', "\"\""))
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn json_text(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

fn display_or_value(row: &Value, display_key: &str, fallback_key: &str) -> Value {
    match row.get(display_key).and_then(|value| value.as_str()).filter(|text| !text.is_empty()) {
        Some(text) => json!(text),
        None => row.get(fallback_key).cloned().unwrap_or(Value::Null),
    }
}

fn export_headers() -> [&'static str; 31] {
    [
        "No",
        "Source Country",
        "Surveillance Scope",
        "Case Country",
        "Language",
        "Source URL",
        "Article Title",
        "Disease Name",
        "Crawling Date",
        "Region",
        "Province / City Case",
        "Article Date",
        "Date Case",
        "Number of Cases",
        "Number of Deaths",
        "Latitude",
        "Longitude",
        "Source Type",
        "Source Name",
        "Evidence",
        "Confidence",
        "Processing Status",
        "Event ID",
        "Is Health Related",
        "Event Type",
        "Source Credibility",
        "Credibility Label",
        "Sentiment",
        "Relevance Score",
        "Outbreak Alert",
        "Needs Review",
    ]
}

fn row_export_values(row: &Value, no: i64) -> Vec<Value> {
    vec![
        json!(no),
        row["source_country"].clone(),
        row["surveillance_scope"].clone(),
        row["country"].clone(),
        row["language"].clone(),
        row["url"].clone(),
        row["title"].clone(),
        row["disease"].clone(),
        row["crawling_date"].clone(),
        row["region"].clone(),
        row["province_city_case"].clone(),
        row["article_date"].clone(),
        row["date_case"].clone(),
        display_or_value(row, "cases_display", "cases"),
        display_or_value(row, "deaths_display", "deaths"),
        display_or_value(row, "geo_summary", "latitude"),
        if row.get("geo_summary").and_then(|value| value.as_str()).filter(|text| !text.is_empty()).is_some() {
            Value::Null
        } else {
            row["longitude"].clone()
        },
        row["source_type"].clone(),
        row["source_name"].clone(),
        row["evidence"].clone(),
        row["confidence"].clone(),
        row["status"].clone(),
        row["disease_event_id"].clone(),
        row["is_health_related"].clone(),
        row["event_type"].clone(),
        row["source_credibility"].clone(),
        row["source_credibility_label"].clone(),
        row["sentiment"].clone(),
        row["relevance_score"].clone(),
        row["outbreak_alert"].clone(),
        row["needs_review"].clone(),
    ]
}

fn to_csv(rows: &[Value]) -> String {
    let mut out = String::from('\u{feff}');
    out.push_str(&export_headers().join(","));
    out.push('\n');
    for (idx, row) in rows.iter().enumerate() {
        let line = row_export_values(row, (idx as i64) + 1)
            .iter()
            .map(csv_cell)
            .collect::<Vec<_>>()
            .join(",");
        out.push_str(&line);
        out.push('\n');
    }
    out
}

fn to_excel_xml(rows: &[Value]) -> String {
    let mut out = String::from(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Crawl History">
  <Table>
"#,
    );
    out.push_str("   <Row>");
    for header in export_headers() {
        out.push_str(&format!(
            "<Cell><Data ss:Type=\"String\">{}</Data></Cell>",
            xml_escape(header)
        ));
    }
    out.push_str("</Row>\n");
    for (idx, row) in rows.iter().enumerate() {
        out.push_str("   <Row>");
        for value in row_export_values(row, (idx as i64) + 1) {
            let text = json_text(&value);
            let is_number = matches!(value, Value::Number(_));
            if is_number {
                out.push_str(&format!(
                    "<Cell><Data ss:Type=\"Number\">{}</Data></Cell>",
                    xml_escape(&text)
                ));
            } else {
                out.push_str(&format!(
                    "<Cell><Data ss:Type=\"String\">{}</Data></Cell>",
                    xml_escape(&text)
                ));
            }
        }
        out.push_str("</Row>\n");
    }
    out.push_str("  </Table>\n </Worksheet>\n</Workbook>\n");
    out
}

fn country_filter_sql(expr: &str, param: &str) -> String {
    format!(
        r#"AND (
              {param}::text IS NULL
              OR (
                LOWER({param}) IN ('asean', 'asean11')
                AND {expr} IN ({list})
              )
              OR {expr} = {param}
            )"#,
        list = ASEAN11_IN
    )
}

fn event_resolved_country_sql() -> String {
    // Same LATERAL equality join as the ASEAN WHERE clause — do not put a
    // 3-column ORDER BY correlated subquery in SELECT (that 504'd the ledger).
    asean11_fold_sql(
        "COALESCE(loc_hist.country, NULLIF(BTRIM(de.location_name), ''), NULLIF(BTRIM(de.province), ''), NULLIF(BTRIM(de.city), ''))",
    )
}

fn event_from_sql() -> &'static str {
    r#"FROM disease_events de
        LEFT JOIN raw_reports rr ON rr.id = de.raw_report_id
        LEFT JOIN LATERAL (
            SELECT l.country
            FROM locations l
            WHERE l.is_active = TRUE
              AND LOWER(l.name) = LOWER(NULLIF(BTRIM(de.location_name), ''))
            LIMIT 1
        ) loc_hist ON TRUE"#
}

fn event_country_where(param: &str) -> String {
    // Equality join / LATERAL LIMIT 1 on location_name, not a 3-column
    // ORDER BY correlated subquery in WHERE (that 504'd the ledger).
    let expr = asean11_fold_sql(
        "COALESCE(loc_hist.country, NULLIF(BTRIM(de.location_name), ''), NULLIF(BTRIM(de.province), ''), NULLIF(BTRIM(de.city), ''))",
    );
    country_filter_sql(&expr, param)
}

fn event_key_page_sql(quality: Quality, matrix_ready: bool) -> String {
    format!(
        r#"SELECT {key} AS article_key
           {from}
           {filters}
           GROUP BY 1
           ORDER BY MAX(de.created_at) DESC NULLS LAST, MAX(de.id::text) DESC
           LIMIT $11"#,
        key = event_article_key_sql(),
        from = event_from_sql(),
        filters = event_where_sql(quality, matrix_ready),
    )
}

fn event_key_count_sql(quality: Quality, matrix_ready: bool) -> String {
    format!(
        r#"SELECT COUNT(*)::bigint FROM (
                SELECT {key} AS article_key
                {from}
                {filters}
                GROUP BY 1
           ) keys"#,
        key = event_article_key_sql(),
        from = event_from_sql(),
        filters = event_where_sql(quality, matrix_ready),
    )
}

fn event_country_select() -> String {
    event_resolved_country_sql()
}

fn skip_test_skdr(alias: &str) -> String {
    format!("LOWER(COALESCE({alias}.source_type, '')) NOT IN ('test', 'skdr', 'skdr_api')")
}

async fn matrix_tables_ready(client: &deadpool_postgres::Object) -> bool {
    client
        .query_one(
            "SELECT to_regclass('public.crawl_matrix_jobs') IS NOT NULL
                    AND to_regclass('public.crawl_matrix_rows') IS NOT NULL",
            &[],
        )
        .await
        .ok()
        .map(|row| row.get::<_, bool>(0))
        .unwrap_or(false)
}

fn place_or_null_sql(expr: &str) -> String {
    format!(
        r#"CASE
            WHEN {expr} IS NULL OR BTRIM({expr}) = '' THEN NULL
            WHEN LOWER(BTRIM({expr})) IN (
                'harian','persen','tak','percent','unknown','n/a','na','null','none',
                'the','and','of','untuk','yang','dari','pada','hari','koran','-',
                'outside asean','n/a','tidak','bukan'
            ) THEN NULL
            WHEN LENGTH(BTRIM({expr})) < 3 THEN NULL
            WHEN BTRIM({expr}) ~ '^[0-9.%]+$' THEN NULL
            WHEN BTRIM({expr}) ~ '^[[:space:];,]+$' THEN NULL
            ELSE NULLIF(BTRIM({expr}), '')
        END"#
    )
}

fn event_article_key_sql() -> &'static str {
    "COALESCE(NULLIF(BTRIM(rr.normalized_url), ''), NULLIF(BTRIM(rr.url), ''), NULLIF(BTRIM(de.source_url), ''), de.raw_report_id::text, de.id::text)"
}

fn event_display_url_sql() -> &'static str {
    "COALESCE(NULLIF(BTRIM(rr.url), ''), NULLIF(BTRIM(de.source_url), ''), NULLIF(BTRIM(rr.final_url), ''), NULLIF(BTRIM(rr.canonical_url), ''), NULLIF(BTRIM(rr.normalized_url), ''))"
}

fn matrix_article_key_sql() -> &'static str {
    "COALESCE(NULLIF(BTRIM(rr.normalized_url), ''), NULLIF(BTRIM(m.source_url), ''), NULLIF(BTRIM(rr.url), ''), m.raw_report_id::text, m.id::text)"
}

/// `Indonesia(8278); Philippines(3734)` — descending count, then label A–Z.
/// Production list uses the same ORDER BY inside `collapse_article_sql`.
/// Empty labels are dropped. `omit_zero` is used for deaths / per-disease cases.
pub fn format_label_counts(pairs: Vec<(String, i64)>) -> String {
    format_label_counts_filtered(pairs, false)
}

fn format_label_counts_filtered(mut pairs: Vec<(String, i64)>, omit_zero: bool) -> String {
    pairs.retain(|(label, n)| !label.trim().is_empty() && (!omit_zero || *n != 0));
    pairs.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.to_lowercase().cmp(&b.0.to_lowercase())));
    pairs
        .into_iter()
        .map(|(label, n)| format!("{label}({n})"))
        .collect::<Vec<_>>()
        .join("; ")
}

/// Unique labels joined with `; ` (alphabetical). SQL uses cases-desc then label.
pub fn join_unique_labels(mut labels: Vec<String>) -> String {
    labels.retain(|label| !label.trim().is_empty());
    labels.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    labels.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    labels.join("; ")
}

fn short_disease_label(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("UNKNOWN") {
        return String::new();
    }
    match trimmed.to_lowercase().as_str() {
        "respiratory syncytial virus infection" | "respiratory syncytial virus" | "rsv" => {
            "RSV".into()
        }
        "nipah virus disease" => "Nipah".into(),
        _ => trimmed.to_string(),
    }
}

#[derive(Clone, Debug, Default)]
pub struct ArticleFact {
    pub disease: Option<String>,
    pub location: Option<String>,
    pub cases: Option<i64>,
    pub deaths: Option<i64>,
}

#[derive(Clone, Debug, Default)]
pub struct CollapsedArticleDisplay {
    pub disease: String,
    pub location: String,
    pub cases_display: Option<String>,
    pub deaths_display: Option<String>,
    pub dimension: &'static str,
}

/// Collapse N atomic facts into the one-row-per-URL display contract.
/// Location(count) wins when places vary; Disease(count) only when the place is shared.
pub fn collapse_article_facts(facts: &[ArticleFact]) -> CollapsedArticleDisplay {
    let diseases = join_unique_labels(
        facts
            .iter()
            .filter_map(|fact| fact.disease.as_deref().map(short_disease_label))
            .collect(),
    );
    let locations = join_unique_labels(
        facts
            .iter()
            .filter_map(|fact| {
                fact.location
                    .as_deref()
                    .map(str::trim)
                    .filter(|label| !label.is_empty())
                    .map(|label| label.to_string())
            })
            .collect(),
    );
    let locations_vary = locations.split("; ").filter(|part| !part.is_empty()).count() > 1;
    let diseases_vary = diseases.split("; ").filter(|part| !part.is_empty()).count() > 1;

    let mut cases_by_location: Vec<(String, i64)> = Vec::new();
    let mut deaths_by_location: Vec<(String, i64)> = Vec::new();
    let mut cases_by_disease: Vec<(String, i64)> = Vec::new();
    let mut deaths_by_disease: Vec<(String, i64)> = Vec::new();
    for fact in facts {
        let loc = fact
            .location
            .as_deref()
            .map(str::trim)
            .filter(|label| !label.is_empty());
        let disease = fact
            .disease
            .as_deref()
            .map(short_disease_label)
            .filter(|label| !label.is_empty());
        if let (Some(loc), Some(n)) = (loc, fact.cases) {
            if let Some(existing) = cases_by_location.iter_mut().find(|(name, _)| name == loc) {
                existing.1 += n;
            } else {
                cases_by_location.push((loc.to_string(), n));
            }
        }
        if let (Some(loc), Some(n)) = (loc, fact.deaths) {
            if let Some(existing) = deaths_by_location.iter_mut().find(|(name, _)| name == loc) {
                existing.1 += n;
            } else {
                deaths_by_location.push((loc.to_string(), n));
            }
        }
        if let (Some(disease), Some(n)) = (disease.as_deref(), fact.cases) {
            if let Some(existing) = cases_by_disease.iter_mut().find(|(name, _)| name == disease) {
                existing.1 += n;
            } else {
                cases_by_disease.push((disease.to_string(), n));
            }
        }
        if let (Some(disease), Some(n)) = (disease.as_deref(), fact.deaths) {
            if let Some(existing) = deaths_by_disease.iter_mut().find(|(name, _)| name == disease) {
                existing.1 += n;
            } else {
                deaths_by_disease.push((disease.to_string(), n));
            }
        }
    }

    let (cases_display, deaths_display, dimension) = if locations_vary {
        (
            Some(format_label_counts(cases_by_location)).filter(|text| !text.is_empty()),
            Some(format_label_counts_filtered(deaths_by_location, true)).filter(|text| !text.is_empty()),
            "location",
        )
    } else if diseases_vary {
        (
            Some(format_label_counts_filtered(cases_by_disease, true)).filter(|text| !text.is_empty()),
            Some(format_label_counts_filtered(deaths_by_disease, true)).filter(|text| !text.is_empty()),
            "disease",
        )
    } else {
        (None, None, "single")
    };

    CollapsedArticleDisplay {
        disease: diseases,
        location: locations,
        cases_display,
        deaths_display,
        dimension,
    }
}

fn matrix_select_sql(evidence_chars: i32) -> String {
    let matrix_country = asean11_fold_sql("m.country");
    let matrix_scope = scope_sql("m.country");
    let matrix_known = known_disease_sql("m.disease_name");
    let matrix_quality = matrix_quality_sql();
    format!(
        r#"
        SELECT
            m.id,
            'manual'::text AS crawl_channel,
            m.crawl_job_id,
            m.raw_report_id,
            de.id AS disease_event_id,
            COALESCE(NULLIF(m.article_title, ''), NULLIF(LEFT(rr.original_text, {title}), ''), m.source_url) AS title,
            COALESCE(m.source_url, rr.url) AS url,
            de.language,
            NULLIF(BTRIM(COALESCE(m.source_country, rr.source_country, '')), '') AS source_country,
            {matrix_country} AS country,
            {matrix_scope} AS region,
            CASE
                WHEN NULLIF(BTRIM(m.province_city_case), '') IS NULL THEN NULL
                WHEN LOWER(BTRIM(m.province_city_case)) = LOWER(BTRIM(COALESCE(m.country, ''))) THEN NULL
                WHEN LOWER(BTRIM(m.province_city_case)) IN ('asean', 'asean11', 'asean + timor-leste', 'asean + timor leste', 'outside asean', 'global') THEN NULL
                ELSE NULLIF(BTRIM(m.province_city_case), '')
            END AS province_city_case,
            NULLIF(m.province, '') AS province,
            NULLIF(m.city, '') AS city,
            m.disease_name AS disease,
            m.icd11_code,
            m.crawling_date::text AS crawling_date,
            m.article_date::text AS article_date,
            NULLIF(m.date_case, '') AS date_case,
            m.number_of_cases::bigint AS cases,
            m.number_of_deaths::bigint AS deaths,
            m.latitude::float8 AS latitude,
            m.longitude::float8 AS longitude,
            COALESCE(m.source_type, rr.source_type) AS source_type,
            COALESCE(m.source_name, rr.source_name) AS source_name,
            LEFT(m.evidence, {evidence}) AS evidence,
            m.confidence::float8 AS confidence,
            m.processing_status AS status,
            (m.processing_status = 'needs_review' OR COALESCE(de.needs_review, FALSE)) AS needs_review,
            (m.latitude IS NOT NULL AND m.longitude IS NOT NULL) AS has_geo,
            ({matrix_known} AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL) AS mapped,
            COALESCE(de.is_health_related, TRUE) AS is_health_related,
            {matrix_quality} AS quality_class,
            de.event_type,
            de.source_credibility::float8 AS source_credibility,
            de.source_credibility_label,
            de.sentiment,
            de.relevance_score,
            de.outbreak_alert,
            m.created_at::text AS created_at,
            LEFT(COALESCE(rr.original_text, m.evidence, ''), {snippet}) AS snippet,
            rr.summary AS summary,
            COALESCE(m.crawling_date::timestamp, m.created_at::timestamp) AS sort_ts,
            NULL::uuid AS parent_event_id,
            {article_key} AS article_key
        FROM crawl_matrix_rows m
        JOIN crawl_matrix_jobs j ON j.id = m.crawl_job_id
        LEFT JOIN raw_reports rr ON rr.id = m.raw_report_id
        LEFT JOIN LATERAL (
            SELECT de0.id, de0.language, de0.needs_review, de0.is_health_related,
                   de0.event_type, de0.source_credibility, de0.source_credibility_label,
                   de0.sentiment, de0.relevance_score, de0.outbreak_alert
            FROM disease_events de0
            WHERE de0.raw_report_id IS NOT NULL AND de0.raw_report_id = m.raw_report_id
            ORDER BY de0.created_at DESC
            LIMIT 1
        ) de ON TRUE
        "#,
        title = TITLE_CHARS,
        evidence = evidence_chars,
        snippet = SNIPPET_CHARS,
        matrix_country = matrix_country,
        matrix_scope = matrix_scope,
        matrix_known = matrix_known,
        matrix_quality = matrix_quality,
        article_key = matrix_article_key_sql(),
    )
}

fn event_select_sql(evidence_chars: i32) -> String {
    let event_country = event_country_select();
    let event_scope = scope_sql(&event_country);
    let event_known = known_disease_sql("de.disease_classification");
    let pipeline_quality = pipeline_quality_sql();
    format!(
        r#"
        SELECT
            de.id,
            CASE
                WHEN LOWER(COALESCE(de.source_name, rr.source_name, '')) = 'url analyzer'
                     OR EXISTS (SELECT 1 FROM analysis_jobs aj WHERE aj.event_id = de.id)
                    THEN 'analyze-url'
                ELSE 'continuous'
            END AS crawl_channel,
            NULL::uuid AS crawl_job_id,
            de.raw_report_id,
            de.id AS disease_event_id,
            COALESCE(NULLIF(LEFT(rr.original_text, {title}), ''), {display_url}, de.location_name) AS title,
            {display_url} AS url,
            de.language,
            {source_country} AS source_country,
            {event_country} AS country,
            {event_scope} AS region,
            COALESCE(
                NULLIF(CONCAT_WS(' / ', {province}, {city}), ''),
                CASE
                    WHEN {location} IS NULL THEN NULL
                    WHEN LOWER({location}) = LOWER(COALESCE({event_country}, '')) THEN NULL
                    ELSE {location}
                END
            ) AS province_city_case,
            {province} AS province,
            CASE
                WHEN {city} IS NOT NULL THEN {city}
                WHEN {province} IS NOT NULL THEN NULL
                WHEN {location} IS NULL THEN NULL
                WHEN LOWER({location}) = LOWER(COALESCE({event_country}, '')) THEN NULL
                ELSE {location}
            END AS city,
            NULLIF(de.disease_classification, '') AS disease,
            NULL::text AS icd11_code,
            de.created_at::text AS crawling_date,
            de.published_at::text AS article_date,
            de.event_date::text AS date_case,
            de.case_count::bigint AS cases,
            de.death_count::bigint AS deaths,
            ST_Y(de.geom)::float8 AS latitude,
            ST_X(de.geom)::float8 AS longitude,
            COALESCE(de.source_type, rr.source_type) AS source_type,
            COALESCE(de.source_name, rr.source_name) AS source_name,
            LEFT(
                CASE
                    WHEN de.epidemiological_evidence IS NULL OR de.epidemiological_evidence = '[]'::jsonb THEN NULL
                    WHEN jsonb_typeof(de.epidemiological_evidence) = 'string'
                        THEN de.epidemiological_evidence #>> '{{}}'
                    WHEN jsonb_typeof(de.epidemiological_evidence) = 'array'
                        THEN de.epidemiological_evidence->>0
                    ELSE NULL
                END,
                {evidence}
            ) AS evidence,
            de.confidence::float8 AS confidence,
            rr.processing_status AS status,
            COALESCE(de.needs_review, FALSE) AS needs_review,
            (de.geom IS NOT NULL) AS has_geo,
            ({event_known} AND COALESCE(de.is_health_related, FALSE) AND de.geom IS NOT NULL) AS mapped,
            COALESCE(de.is_health_related, FALSE) AS is_health_related,
            {pipeline_quality} AS quality_class,
            de.event_type,
            de.source_credibility::float8 AS source_credibility,
            de.source_credibility_label,
            de.sentiment,
            de.relevance_score,
            de.outbreak_alert,
            de.created_at::text AS created_at,
            LEFT(COALESCE(rr.original_text, de.original_text, ''), {snippet}) AS snippet,
            rr.summary AS summary,
            de.created_at::timestamp AS sort_ts,
            de.parent_event_id,
            {article_key} AS article_key
        {from}
        "#,
        title = TITLE_CHARS,
        evidence = evidence_chars,
        snippet = SNIPPET_CHARS,
        event_country = event_country,
        event_scope = event_scope,
        source_country = source_country_sql(),
        event_known = event_known,
        pipeline_quality = pipeline_quality,
        article_key = event_article_key_sql(),
        display_url = event_display_url_sql(),
        province = place_or_null_sql("de.province"),
        city = place_or_null_sql("de.city"),
        location = place_or_null_sql("de.location_name"),
        from = event_from_sql(),
    )
}

fn collapse_article_sql(inner: &str) -> String {
    let template = r#"
        WITH raw AS (
            __INNER__
        ),
        base AS (
            SELECT r.*
            FROM raw r
            WHERE NOT EXISTS (
                SELECT 1 FROM raw child
                WHERE child.article_key = r.article_key
                  AND child.parent_event_id IS NOT NULL
            )
            OR r.parent_event_id IS NOT NULL
        ),
        by_country AS (
            SELECT article_key, country,
                   SUM(COALESCE(cases, 0)) AS cases,
                   SUM(COALESCE(deaths, 0)) AS deaths
            FROM base
            WHERE country IS NOT NULL AND BTRIM(country) <> ''
            GROUP BY article_key, country
        ),
        by_place AS (
            SELECT article_key,
                   COALESCE(NULLIF(BTRIM(province), ''), NULLIF(BTRIM(city), '')) AS label,
                   SUM(COALESCE(cases, 0)) AS cases,
                   SUM(COALESCE(deaths, 0)) AS deaths
            FROM base
            WHERE COALESCE(NULLIF(BTRIM(province), ''), NULLIF(BTRIM(city), '')) IS NOT NULL
            GROUP BY 1, 2
        ),
        country_txt AS (
            SELECT article_key,
                   COUNT(*)::int AS n,
                   string_agg(country, '; ' ORDER BY cases DESC, country) AS labels,
                   string_agg(country || '(' || cases::text || ')', '; ' ORDER BY cases DESC, country)
                       FILTER (WHERE cases > 0) AS cases_display,
                   string_agg(country || '(' || deaths::text || ')', '; ' ORDER BY deaths DESC, country)
                       FILTER (WHERE deaths > 0) AS deaths_display
            FROM by_country
            GROUP BY article_key
        ),
        place_txt AS (
            SELECT article_key,
                   COUNT(*)::int AS n,
                   string_agg(label, '; ' ORDER BY cases DESC, label) AS labels,
                   string_agg(label || '(' || cases::text || ')', '; ' ORDER BY cases DESC, label)
                       FILTER (WHERE cases > 0) AS cases_display,
                   string_agg(label || '(' || deaths::text || ')', '; ' ORDER BY deaths DESC, label)
                       FILTER (WHERE deaths > 0) AS deaths_display
            FROM by_place
            GROUP BY article_key
        ),
        disease_txt AS (
            SELECT article_key,
                   COUNT(*)::int AS n,
                   string_agg(disease, '; ' ORDER BY n DESC, disease) AS labels,
                   string_agg(disease || '(' || n::text || ')', '; ' ORDER BY n DESC, disease)
                       FILTER (WHERE n > 0) AS cases_display,
                   string_agg(disease || '(' || deaths::text || ')', '; ' ORDER BY deaths DESC, disease)
                       FILTER (WHERE deaths > 0) AS deaths_display
            FROM (
                SELECT article_key, disease, SUM(COALESCE(cases, 0)) AS n, SUM(COALESCE(deaths, 0)) AS deaths
                FROM base
                WHERE disease IS NOT NULL AND BTRIM(disease) <> ''
                GROUP BY article_key, disease
            ) d
            GROUP BY article_key
        ),
        region_txt AS (
            SELECT article_key,
                   string_agg(region, '; ' ORDER BY n DESC, region) AS labels
            FROM (
                SELECT article_key, region, SUM(COALESCE(cases, 0)) AS n
                FROM base
                WHERE region IS NOT NULL AND BTRIM(region) <> ''
                GROUP BY article_key, region
            ) r
            GROUP BY article_key
        ),
        source_txt AS (
            SELECT article_key,
                   string_agg(DISTINCT source_country, '; ' ORDER BY source_country) AS labels
            FROM base
            WHERE source_country IS NOT NULL AND BTRIM(source_country) <> ''
            GROUP BY article_key
        ),
        grouped AS (
            SELECT
                b.article_key,
                (ARRAY_AGG(b.id ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS id,
                (ARRAY_AGG(b.crawl_channel ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS crawl_channel,
                (ARRAY_AGG(b.crawl_job_id ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS crawl_job_id,
                (ARRAY_AGG(b.raw_report_id ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS raw_report_id,
                (ARRAY_AGG(b.disease_event_id ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS disease_event_id,
                (ARRAY_AGG(b.title ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS title,
                (ARRAY_AGG(b.url ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS url,
                (ARRAY_AGG(b.language ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS language,
                (ARRAY_AGG(b.source_country ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS source_country,
                (ARRAY_AGG(b.icd11_code ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS icd11_code,
                (ARRAY_AGG(b.crawling_date ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS crawling_date,
                (ARRAY_AGG(b.article_date ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS article_date,
                (ARRAY_AGG(b.date_case ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS date_case,
                (ARRAY_AGG(b.source_type ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS source_type,
                (ARRAY_AGG(b.source_name ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS source_name,
                (ARRAY_AGG(b.evidence ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS evidence,
                (ARRAY_AGG(b.status ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS status,
                (ARRAY_AGG(b.event_type ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS event_type,
                (ARRAY_AGG(b.sentiment ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS sentiment,
                (ARRAY_AGG(b.relevance_score ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS relevance_score,
                (ARRAY_AGG(b.snippet ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS snippet,
                (ARRAY_AGG(b.summary ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS summary,
                (ARRAY_AGG(b.created_at ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS created_at,
                (ARRAY_AGG(b.source_credibility_label ORDER BY b.source_credibility DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS source_credibility_label,
                string_agg(DISTINCT NULLIF(BTRIM(b.province), ''), '; ') AS province,
                string_agg(DISTINCT NULLIF(BTRIM(b.city), ''), '; ') AS city,
                COUNT(*)::bigint AS event_count,
                COUNT(DISTINCT COALESCE(NULLIF(BTRIM(b.province), ''), NULLIF(BTRIM(b.city), ''), NULLIF(BTRIM(b.region), ''), NULLIF(BTRIM(b.country), '')))::bigint AS location_count,
                SUM(COALESCE(b.cases, 0))::bigint AS cases,
                SUM(COALESCE(b.deaths, 0))::bigint AS deaths,
                MAX(b.confidence) AS confidence,
                MAX(b.source_credibility) AS source_credibility,
                BOOL_OR(b.needs_review) AS needs_review,
                BOOL_OR(COALESCE(b.outbreak_alert, FALSE)) AS outbreak_alert,
                BOOL_OR(COALESCE(b.is_health_related, FALSE)) AS is_health_related,
                BOOL_OR(b.has_geo) AS has_geo,
                BOOL_OR(b.mapped) AS mapped,
                CASE
                    WHEN BOOL_OR(b.quality_class = 'surveillance') THEN 'surveillance'
                    WHEN BOOL_OR(b.quality_class = 'review') THEN 'review'
                    ELSE 'noise'
                END AS quality_class,
                MAX(b.sort_ts) AS sort_ts,
                (ARRAY_AGG(NULLIF(BTRIM(b.country), '') ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC)
                    FILTER (WHERE NULLIF(BTRIM(b.country), '') IS NOT NULL))[1] AS primary_country,
                (ARRAY_AGG(NULLIF(BTRIM(b.disease), '') ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC)
                    FILTER (WHERE NULLIF(BTRIM(b.disease), '') IS NOT NULL AND LOWER(BTRIM(b.disease)) <> 'unknown'))[1] AS primary_disease,
                (ARRAY_AGG(
                    COALESCE(NULLIF(BTRIM(b.province), ''), NULLIF(BTRIM(b.city), ''), NULLIF(BTRIM(b.province_city_case), ''))
                    ORDER BY COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC
                ) FILTER (
                    WHERE COALESCE(NULLIF(BTRIM(b.province), ''), NULLIF(BTRIM(b.city), ''), NULLIF(BTRIM(b.province_city_case), '')) IS NOT NULL
                ))[1] AS primary_place,
                (ARRAY_AGG(b.latitude ORDER BY CASE WHEN b.latitude IS NOT NULL THEN 0 ELSE 1 END, COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS primary_latitude,
                (ARRAY_AGG(b.longitude ORDER BY CASE WHEN b.longitude IS NOT NULL THEN 0 ELSE 1 END, COALESCE(b.cases, 0) DESC NULLS LAST, b.sort_ts DESC, b.id DESC))[1] AS primary_longitude
            FROM base b
            GROUP BY b.article_key
        )
        SELECT
            g.id,
            g.crawl_channel,
            g.crawl_job_id,
            g.raw_report_id,
            g.disease_event_id,
            g.title,
            g.url,
            g.language,
            st.labels AS source_country,
            COALESCE(g.primary_country, ct.labels) AS country,
            rt.labels AS region,
            COALESCE(g.primary_place, pt.labels, g.province) AS province_city_case,
            CASE WHEN g.location_count > 1 THEN NULL ELSE g.province END AS province,
            CASE WHEN g.location_count > 1 THEN NULL ELSE g.city END AS city,
            COALESCE(g.primary_disease, dt.labels) AS disease,
            g.icd11_code,
            g.crawling_date,
            g.article_date,
            g.date_case,
            g.cases,
            g.deaths,
            CASE WHEN g.location_count > 1 THEN NULL ELSE g.primary_latitude END AS latitude,
            CASE WHEN g.location_count > 1 THEN NULL ELSE g.primary_longitude END AS longitude,
            g.source_type,
            g.source_name,
            g.evidence,
            g.confidence,
            g.status,
            g.needs_review,
            g.has_geo,
            g.mapped,
            g.is_health_related,
            g.quality_class,
            g.event_type,
            g.source_credibility,
            g.source_credibility_label,
            g.sentiment,
            g.relevance_score,
            g.outbreak_alert,
            g.created_at,
            g.snippet,
            g.sort_ts,
            g.article_key,
            CASE
                WHEN COALESCE(ct.n, 0) > 1 THEN ct.cases_display
                WHEN COALESCE(pt.n, 0) > 1 THEN pt.cases_display
                WHEN COALESCE(dt.n, 0) > 1 THEN dt.cases_display
                ELSE NULL
            END AS cases_display,
            CASE
                WHEN COALESCE(ct.n, 0) > 1 THEN ct.deaths_display
                WHEN COALESCE(pt.n, 0) > 1 THEN pt.deaths_display
                WHEN COALESCE(dt.n, 0) > 1 THEN dt.deaths_display
                ELSE NULL
            END AS deaths_display,
            CASE WHEN g.location_count > 1 THEN g.location_count::text || ' locations' ELSE NULL END AS geo_summary,
            g.event_count,
            g.location_count
        FROM grouped g
        LEFT JOIN country_txt ct ON ct.article_key = g.article_key
        LEFT JOIN source_txt st ON st.article_key = g.article_key
        LEFT JOIN place_txt pt ON pt.article_key = g.article_key
        LEFT JOIN disease_txt dt ON dt.article_key = g.article_key
        LEFT JOIN region_txt rt ON rt.article_key = g.article_key
        "#;
    template.replace("__INNER__", inner)
}

fn matrix_where_sql(quality: Quality) -> String {
    format!(
        r#"
        WHERE {quality_where}
          AND ($1::text IS NULL
               OR COALESCE(m.article_title, '') ILIKE '%'||$1||'%'
               OR COALESCE(m.source_url, '') ILIKE '%'||$1||'%'
               OR COALESCE(m.source_name, '') ILIKE '%'||$1||'%'
               OR COALESCE(m.disease_name, '') ILIKE '%'||$1||'%')
          AND ($2::text IS NULL OR $2 = 'manual')
          {country}
          AND ($4::text IS NULL OR m.disease_name ILIKE '%'||$4||'%')
          AND ($5::text IS NULL OR COALESCE(m.crawling_date::text, m.article_date::text, LEFT(m.created_at::text, 10)) >= $5)
          AND ($6::text IS NULL OR COALESCE(m.crawling_date::text, m.article_date::text, LEFT(m.created_at::text, 10)) <= $6)
          AND ($7::text IS NULL OR m.processing_status = $7)
          AND ($8::bool IS NULL OR (m.processing_status = 'needs_review') = $8)
          AND ($9::bool IS NULL OR (m.latitude IS NOT NULL AND m.longitude IS NOT NULL) = $9)
          AND ($10::uuid IS NULL OR m.crawl_job_id = $10)
        "#,
        quality_where = matrix_quality_where(quality),
        country = country_filter_sql(&asean11_fold_sql("m.country"), "$3"),
    )
}

fn event_where_sql(quality: Quality, matrix_ready: bool) -> String {
    let known = known_disease_sql("de.disease_classification");
    let skip_matrix = if matrix_ready {
        r#"AND NOT EXISTS (
              SELECT 1 FROM crawl_matrix_rows mx
              WHERE mx.raw_report_id IS NOT NULL AND mx.raw_report_id = de.raw_report_id
          )"#
    } else {
        ""
    };
    format!(
        r#"
        WHERE {quality_where}
          AND {skip}
          {skip_matrix}
          AND ($1::text IS NULL
               OR COALESCE(de.disease_classification, '') ILIKE '%'||$1||'%'
               OR COALESCE(de.source_name, '') ILIKE '%'||$1||'%'
               OR COALESCE(de.location_name, '') ILIKE '%'||$1||'%'
               OR COALESCE({display_url}, '') ILIKE '%'||$1||'%'
               OR LEFT(COALESCE(rr.original_text, ''), 1000) ILIKE '%'||$1||'%'
               OR COALESCE(rr.summary, '') ILIKE '%'||$1||'%')
          AND (
                $2::text IS NULL
                OR ($2 = 'continuous' AND LOWER(COALESCE(de.source_name, rr.source_name, '')) <> 'url analyzer'
                    AND NOT EXISTS (SELECT 1 FROM analysis_jobs aj WHERE aj.event_id = de.id))
                OR ($2 = 'analyze-url' AND (
                    LOWER(COALESCE(de.source_name, rr.source_name, '')) = 'url analyzer'
                    OR EXISTS (SELECT 1 FROM analysis_jobs aj WHERE aj.event_id = de.id)
                ))
              )
          {country}
          AND ($4::text IS NULL OR COALESCE(de.disease_classification, '') ILIKE '%'||$4||'%')
          AND ($5::text IS NULL OR COALESCE(de.published_at::text, LEFT(de.created_at::text, 10)) >= $5)
          AND ($6::text IS NULL OR COALESCE(de.published_at::text, LEFT(de.created_at::text, 10)) <= $6)
          AND (
                $7::text IS NULL
                OR ($7 = 'needs_review' AND COALESCE(de.needs_review, FALSE))
                OR ($7 = 'processed' AND NOT COALESCE(de.needs_review, FALSE) AND {known})
                OR ($7 = 'failed' AND NOT {known})
              )
          AND ($8::bool IS NULL OR COALESCE(de.needs_review, FALSE) = $8)
          AND ($9::bool IS NULL OR (de.geom IS NOT NULL) = $9)
          AND $10::uuid IS NULL
        "#,
        quality_where = event_quality_where(quality),
        skip = skip_test_skdr("de"),
        skip_matrix = skip_matrix,
        country = event_country_where("$3"),
        known = known,
        display_url = event_display_url_sql(),
    )
}

fn map_opt_string(row: &tokio_postgres::Row, col: &str) -> Value {
    json!(row.try_get::<_, Option<String>>(col).ok().flatten())
}

fn map_opt_f64(row: &tokio_postgres::Row, col: &str) -> Value {
    json!(row.try_get::<_, Option<f64>>(col).ok().flatten())
}

fn map_opt_i64(row: &tokio_postgres::Row, col: &str) -> Value {
    json!(row.try_get::<_, Option<i64>>(col).ok().flatten())
}

fn map_opt_bool(row: &tokio_postgres::Row, col: &str) -> Value {
    json!(row.try_get::<_, Option<bool>>(col).ok().flatten())
}

fn map_ledger_row(row: &tokio_postgres::Row) -> Value {
    let title = row.try_get::<_, Option<String>>("title").ok().flatten();
    json!({
        "id": row.get::<_, Uuid>("id"),
        "crawl_channel": row.get::<_, String>("crawl_channel"),
        "job_id": row.try_get::<_, Option<Uuid>>("crawl_job_id").ok().flatten(),
        "raw_report_id": row.try_get::<_, Option<Uuid>>("raw_report_id").ok().flatten(),
        "disease_event_id": row.try_get::<_, Option<Uuid>>("disease_event_id").ok().flatten(),
        "parent_event_id": row.try_get::<_, Option<Uuid>>("parent_event_id").ok().flatten(),
        "title": title,
        "article_title": title,
        "url": map_opt_string(row, "url"),
        "language": map_opt_string(row, "language"),
        "source_country": map_opt_string(row, "source_country"),
        "country": map_opt_string(row, "country"),
        "case_country": map_opt_string(row, "country"),
        "region": map_opt_string(row, "region"),
        "surveillance_scope": map_opt_string(row, "region"),
        "province_city_case": map_opt_string(row, "province_city_case"),
        "province": map_opt_string(row, "province"),
        "city": map_opt_string(row, "city"),
        "disease": map_opt_string(row, "disease"),
        "disease_name": map_opt_string(row, "disease"),
        "icd11_code": map_opt_string(row, "icd11_code"),
        "crawling_date": map_opt_string(row, "crawling_date"),
        "article_date": map_opt_string(row, "article_date"),
        "published_at": map_opt_string(row, "article_date"),
        "date_case": map_opt_string(row, "date_case"),
        "cases": map_opt_i64(row, "cases"),
        "deaths": map_opt_i64(row, "deaths"),
        "latitude": map_opt_f64(row, "latitude"),
        "longitude": map_opt_f64(row, "longitude"),
        "source_type": map_opt_string(row, "source_type"),
        "source_name": map_opt_string(row, "source_name"),
        "evidence": map_opt_string(row, "evidence"),
        "confidence": map_opt_f64(row, "confidence"),
        "status": map_opt_string(row, "status"),
        "needs_review": row.try_get::<_, bool>("needs_review").ok().unwrap_or(false),
        "has_geo": row.try_get::<_, bool>("has_geo").ok().unwrap_or(false),
        "mapped": row.try_get::<_, bool>("mapped").ok().unwrap_or(false),
        "is_health_related": map_opt_bool(row, "is_health_related"),
        "quality_class": map_opt_string(row, "quality_class"),
        "event_type": map_opt_string(row, "event_type"),
        "source_credibility": map_opt_f64(row, "source_credibility"),
        "source_credibility_label": map_opt_string(row, "source_credibility_label"),
        "sentiment": map_opt_string(row, "sentiment"),
        "relevance_score": map_opt_string(row, "relevance_score"),
        "outbreak_alert": map_opt_bool(row, "outbreak_alert"),
        "created_at": map_opt_string(row, "created_at"),
        "snippet": map_opt_string(row, "snippet"),
        "article_key": map_opt_string(row, "article_key"),
        "cases_display": map_opt_string(row, "cases_display"),
        "deaths_display": map_opt_string(row, "deaths_display"),
        "geo_summary": map_opt_string(row, "geo_summary"),
        "event_count": map_opt_i64(row, "event_count"),
        "location_count": map_opt_i64(row, "location_count"),
        "summary": map_opt_string(row, "summary"),
    })
}

fn filter_params<'a>(
    q: &'a Option<String>,
    channel: &'a Option<String>,
    country: &'a Option<String>,
    disease: &'a Option<String>,
    date_from: &'a Option<String>,
    date_to: &'a Option<String>,
    status: &'a Option<String>,
    needs_review: &'a Option<bool>,
    has_geo: &'a Option<bool>,
    job_id: &'a Option<Uuid>,
) -> [&'a (dyn tokio_postgres::types::ToSql + Sync); 10] {
    [
        q, channel, country, disease, date_from, date_to, status, needs_review, has_geo, job_id,
    ]
}

async fn load_filtered_rows(
    state: &AppState,
    query: &CrawlHistoryQuery,
    limit: i64,
    offset: i64,
    with_total: bool,
    evidence_chars: i32,
) -> Result<(Vec<Value>, i64), (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let q = opt_text(&query.q);
    let parsed_channel = parse_channel(&query.channel);
    let channel = channel_sql(parsed_channel).map(|value| value.to_string());
    let country = match opt_text(&query.country) {
        Some(value) if value.eq_ignore_ascii_case("all") || value == "*" => None,
        other => other,
    };
    let disease = opt_text(&query.disease);
    let date_from = opt_text(&query.date_from);
    let date_to = opt_text(&query.date_to);
    let status = parse_status(&query.status);
    let job_id = parse_job_id(&query.job_id)?;
    let quality = parse_quality(&query.quality);
    let matrix_ready = matrix_tables_ready(&client).await;
    let include_matrix = matrix_ready && matches!(parsed_channel, Channel::All | Channel::Manual);
    let include_events = job_id.is_none()
        && matches!(parsed_channel, Channel::All | Channel::Continuous | Channel::AnalyzeUrl);
    // An Analyze URL re-run can target an article that already has a
    // continuous/manual matrix row. Let the explicit Analyze URL view read
    // the persisted disease event instead of hiding it behind the matrix guard.
    let event_matrix_ready = matrix_ready && !matches!(parsed_channel, Channel::AnalyzeUrl);

    let params = filter_params(
        &q,
        &channel,
        &country,
        &disease,
        &date_from,
        &date_to,
        &status,
        &query.needs_review,
        &query.has_geo,
        &job_id,
    );
    let cap = (offset + limit).max(limit).min(EXPORT_CAP);
    let mut combined: Vec<Value> = Vec::new();

    if include_matrix {
        let matrix_sql = format!(
            "{} ORDER BY sort_ts DESC NULLS LAST, id DESC LIMIT $11",
            collapse_article_sql(&format!(
                "{} {}",
                matrix_select_sql(evidence_chars),
                matrix_where_sql(quality)
            ))
        );
        let rows = client
            .query(
                &matrix_sql,
                &[
                    &q,
                    &channel,
                    &country,
                    &disease,
                    &date_from,
                    &date_to,
                    &status,
                    &query.needs_review,
                    &query.has_geo,
                    &job_id,
                    &cap,
                ],
            )
            .await
            .map_err(internal_error)?;
        combined.extend(rows.iter().map(map_ledger_row));
    }

    if include_events {
        let key_rows = client
            .query(
                &event_key_page_sql(quality, event_matrix_ready),
                &[
                    &q,
                    &channel,
                    &country,
                    &disease,
                    &date_from,
                    &date_to,
                    &status,
                    &query.needs_review,
                    &query.has_geo,
                    &job_id,
                    &cap,
                ],
            )
            .await
            .map_err(internal_error)?;
        let keys: Vec<String> = key_rows
            .iter()
            .filter_map(|row| row.try_get::<_, Option<String>>(0).ok().flatten())
            .filter(|key| !key.is_empty())
            .collect();
        if !keys.is_empty() {
            let event_sql = format!(
                "{} ORDER BY sort_ts DESC NULLS LAST, id DESC",
                collapse_article_sql(&format!(
                    "{} {} AND {key} = ANY($11::text[])",
                    event_select_sql(evidence_chars),
                    event_where_sql(quality, event_matrix_ready),
                    key = event_article_key_sql(),
                ))
            );
            let rows = client
                .query(
                    &event_sql,
                    &[
                        &q,
                        &channel,
                        &country,
                        &disease,
                        &date_from,
                        &date_to,
                        &status,
                        &query.needs_review,
                        &query.has_geo,
                        &job_id,
                        &keys,
                    ],
                )
                .await
                .map_err(internal_error)?;
            combined.extend(rows.iter().map(map_ledger_row));
        }
    }

    let mut seen = HashSet::new();
    combined.retain(|row| {
        let key = row
            .get("article_key")
            .and_then(|value| value.as_str())
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| row.get("id").map(|value| value.to_string()).unwrap_or_default());
        seen.insert(key)
    });
    combined.sort_by(|left, right| {
        let left_ts = left.get("created_at").and_then(|value| value.as_str()).unwrap_or("");
        let right_ts = right.get("created_at").and_then(|value| value.as_str()).unwrap_or("");
        right_ts.cmp(left_ts)
    });
    let data: Vec<Value> = combined
        .into_iter()
        .skip(offset.max(0) as usize)
        .take(limit.max(0) as usize)
        .collect();
    if !with_total {
        let exported = data.len() as i64;
        return Ok((data, exported));
    }

    let mut total = 0_i64;
    if include_matrix {
        let count_sql = format!(
            "SELECT COUNT(*)::bigint FROM (
                SELECT {key} AS article_key
                FROM crawl_matrix_rows m
                JOIN crawl_matrix_jobs j ON j.id = m.crawl_job_id
                LEFT JOIN raw_reports rr ON rr.id = m.raw_report_id
                {filters}
                GROUP BY 1
             ) keys",
            key = matrix_article_key_sql(),
            filters = matrix_where_sql(quality)
        );
        total += client
            .query_one(&count_sql, &params)
            .await
            .map_err(internal_error)?
            .get::<_, i64>(0);
    }
    if include_events {
        total += client
            .query_one(&event_key_count_sql(quality, event_matrix_ready), &params)
            .await
            .map_err(internal_error)?
            .get::<_, i64>(0);
    }
    Ok((data, total))
}

pub async fn list_rows(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CrawlHistoryQuery>,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let format = opt_text(&query.format)
        .unwrap_or_else(|| "json".into())
        .to_ascii_lowercase();
    let export = matches!(format.as_str(), "csv" | "xlsx" | "xls" | "excel");
    let (limit, offset, page, per_page) = if export {
        (export_limit(query.per_page), 0_i64, 1_i64, export_limit(query.per_page))
    } else {
        let (page, per_page, offset) = history_pagination(query.page, query.per_page);
        (per_page, offset, page, per_page)
    };
    let (data, total) = load_filtered_rows(&state, &query, limit, offset, !export, EVIDENCE_LIST_CHARS).await?;
    if format == "csv" {
        let body = to_csv(&data);
        return Ok((
            StatusCode::OK,
            [
                (
                    header::CONTENT_TYPE,
                    HeaderValue::from_static("text/csv; charset=utf-8"),
                ),
                (
                    header::CONTENT_DISPOSITION,
                    HeaderValue::from_static("attachment; filename=\"crawl-history.csv\""),
                ),
            ],
            body,
        )
            .into_response());
    }
    if matches!(format.as_str(), "xlsx" | "xls" | "excel") {
        let body = to_excel_xml(&data);
        return Ok((
            StatusCode::OK,
            [
                (
                    header::CONTENT_TYPE,
                    HeaderValue::from_static("application/vnd.ms-excel; charset=utf-8"),
                ),
                (
                    header::CONTENT_DISPOSITION,
                    HeaderValue::from_static("attachment; filename=\"crawl-history.xls\""),
                ),
            ],
            body,
        )
            .into_response());
    }
    Ok(Json(ApiResponse {
        success: true,
        data,
        total: Some(total),
        page: Some(page),
        per_page: Some(per_page),
        total_pages: Some(calc_total_pages(total, per_page)),
    })
    .into_response())
}

async fn expand_article_row(
    client: &deadpool_postgres::Object,
    data: &mut Value,
    from_matrix: bool,
) -> Result<(), (StatusCode, Json<Value>)> {
    let Some(key) = data["article_key"].as_str().map(str::to_string).filter(|item| !item.is_empty()) else {
        return Ok(());
    };
    let inner = if from_matrix {
        format!(
            "{} WHERE {} = $1",
            matrix_select_sql(EVIDENCE_DETAIL_CHARS),
            matrix_article_key_sql()
        )
    } else {
        format!(
            "{} WHERE {} = $1 AND {}",
            event_select_sql(EVIDENCE_DETAIL_CHARS),
            event_article_key_sql(),
            skip_test_skdr("de")
        )
    };
    let collapsed_sql = format!("{} LIMIT 1", collapse_article_sql(&inner));
    if let Some(row) = client
        .query_opt(&collapsed_sql, &[&key])
        .await
        .map_err(internal_error)?
    {
        let children_hold = data.get("children").cloned();
        *data = map_ledger_row(&row);
        if let Some(children) = children_hold {
            data["children"] = children;
        }
    }
    let child_sql = if from_matrix {
        format!(
            "{} WHERE {} = $1 ORDER BY cases DESC NULLS LAST, sort_ts DESC, id DESC LIMIT 80",
            matrix_select_sql(EVIDENCE_DETAIL_CHARS),
            matrix_article_key_sql()
        )
    } else {
        format!(
            "{} WHERE {} = $1 AND {} ORDER BY cases DESC NULLS LAST, sort_ts DESC, id DESC LIMIT 80",
            event_select_sql(EVIDENCE_DETAIL_CHARS),
            event_article_key_sql(),
            skip_test_skdr("de")
        )
    };
    let kids = client
        .query(&child_sql, &[&key])
        .await
        .map_err(internal_error)?;
    data["children"] = json!(kids.iter().map(map_ledger_row).collect::<Vec<_>>());

    // The detail view may show the captured article without re-fetching the
    // publisher page. Keep this out of list_rows: full text is intentionally a
    // detail-only payload so large crawl-history pages stay fast.
    if let Some(raw_report_id) = data["raw_report_id"]
        .as_str()
        .and_then(|value| Uuid::parse_str(value).ok())
    {
        let content = client
            .query_opt(
                "SELECT NULLIF(BTRIM(original_text), '') FROM raw_reports WHERE id = $1",
                &[&raw_report_id],
            )
            .await
            .map_err(internal_error)?
            .and_then(|row| row.try_get::<_, Option<String>>(0).ok().flatten());
        data["content"] = json!(content);
    }
    Ok(())
}

pub async fn get_row(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<CrawlHistoryQuery>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let uuid = parse_row_id(&id)?;
    let client = state.db.get().await.map_err(internal_error)?;
    let channel = parse_channel(&query.channel);
    let matrix_ready = matrix_tables_ready(&client).await;
    let try_matrix = matrix_ready && matches!(channel, Channel::All | Channel::Manual);
    let try_events = matches!(channel, Channel::All | Channel::Continuous | Channel::AnalyzeUrl);

    let mut data = None;
    let mut from_matrix = false;
    if try_matrix {
        let sql = format!(
            "{} WHERE m.id = $1 LIMIT 1",
            matrix_select_sql(EVIDENCE_DETAIL_CHARS)
        );
        if let Some(row) = client.query_opt(&sql, &[&uuid]).await.map_err(internal_error)? {
            data = Some(map_ledger_row(&row));
            from_matrix = true;
        }
    }
    if data.is_none() && try_events {
        let sql = format!(
            "{} WHERE de.id = $1 LIMIT 1",
            event_select_sql(EVIDENCE_DETAIL_CHARS)
        );
        if let Some(row) = client.query_opt(&sql, &[&uuid]).await.map_err(internal_error)? {
            data = Some(map_ledger_row(&row));
        }
    }
    let Some(mut data) = data else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "error": "Crawl history row was not found"})),
        ));
    };
    expand_article_row(&client, &mut data, from_matrix).await?;

    if let Some(job_id) = data["job_id"].as_str().and_then(|value| Uuid::parse_str(value).ok()) {
        if let Ok(Some(job)) = client
            .query_opt(
                "SELECT status, disease_names, region, country, province_city,
                        date_from::text, date_to::text, max_articles, query,
                        discovered_count, processed_count, row_count,
                        created_at::text, completed_at::text
                 FROM crawl_matrix_jobs WHERE id = $1",
                &[&job_id],
            )
            .await
        {
            data["job"] = json!({
                "status": job.get::<_, String>(0),
                "disease_names": job.get::<_, Value>(1),
                "region": job.get::<_, Option<String>>(2),
                "country": job.get::<_, Option<String>>(3),
                "province_city": job.get::<_, Option<String>>(4),
                "date_from": job.get::<_, Option<String>>(5),
                "date_to": job.get::<_, Option<String>>(6),
                "max_articles": job.get::<_, i32>(7),
                "query": job.get::<_, Value>(8),
                "discovered_count": job.get::<_, i32>(9),
                "processed_count": job.get::<_, i32>(10),
                "row_count": job.get::<_, i32>(11),
                "created_at": job.get::<_, Option<String>>(12),
                "completed_at": job.get::<_, Option<String>>(13),
            });
        }
    }
    Ok(Json(ApiResponse {
        success: true,
        data,
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
}

pub async fn delete_row(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let (_user_id, username) = crate::require_admin(&state, &headers).await?;
    if username.to_lowercase() != "webmaster" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"success": false, "error": "Hanya akun dengan username webmaster yang dapat menghapus data crawl history"})),
        ));
    }
    let uuid = parse_row_id(&id)?;
    let client = state.db.get().await.map_err(internal_error)?;

    let mut raw_report_ids: Vec<Uuid> = Vec::new();
    let mut source_urls: Vec<String> = Vec::new();
    let mut event_ids: Vec<Uuid> = Vec::new();

    if let Ok(rows) = client
        .query(
            "SELECT id, raw_report_id, source_url FROM crawl_matrix_rows WHERE id = $1 OR raw_report_id = $1",
            &[&uuid],
        )
        .await
    {
        for r in rows {
            if let Ok(Some(raw_id)) = r.try_get::<_, Option<Uuid>>(1) {
                raw_report_ids.push(raw_id);
            }
            if let Ok(Some(u)) = r.try_get::<_, Option<String>>(2) {
                let trimmed = u.trim();
                if !trimmed.is_empty() {
                    source_urls.push(trimmed.to_string());
                }
            }
        }
    }

    if let Ok(rows) = client
        .query(
            "SELECT id, raw_report_id, source_url FROM disease_events WHERE id = $1 OR raw_report_id = $1",
            &[&uuid],
        )
        .await
    {
        for r in rows {
            let ev_id: Uuid = r.get(0);
            event_ids.push(ev_id);
            if let Ok(Some(raw_id)) = r.try_get::<_, Option<Uuid>>(1) {
                raw_report_ids.push(raw_id);
            }
            if let Ok(Some(u)) = r.try_get::<_, Option<String>>(2) {
                let trimmed = u.trim();
                if !trimmed.is_empty() {
                    source_urls.push(trimmed.to_string());
                }
            }
        }
    }

    let _ = client
        .execute(
            "DELETE FROM disease_events WHERE parent_event_id = $1 OR parent_event_id = ANY($2::uuid[])",
            &[&uuid, &event_ids],
        )
        .await;

    let _ = client
        .execute(
            "DELETE FROM analysis_jobs WHERE event_id = $1 OR event_id = ANY($2::uuid[])",
            &[&uuid, &event_ids],
        )
        .await;

    let events_deleted = client
        .execute(
            "DELETE FROM disease_events WHERE id = $1 OR id = ANY($2::uuid[]) OR (raw_report_id IS NOT NULL AND raw_report_id = ANY($3::uuid[]))",
            &[&uuid, &event_ids, &raw_report_ids],
        )
        .await
        .unwrap_or(0);

    let matrix_deleted = client
        .execute(
            "DELETE FROM crawl_matrix_rows WHERE id = $1 OR (raw_report_id IS NOT NULL AND raw_report_id = ANY($2::uuid[]))",
            &[&uuid, &raw_report_ids],
        )
        .await
        .unwrap_or(0);

    let reports_deleted = if !raw_report_ids.is_empty() {
        client
            .execute(
                "DELETE FROM raw_reports WHERE id = ANY($1::uuid[])",
                &[&raw_report_ids],
            )
            .await
            .unwrap_or(0)
    } else {
        0
    };

    if !source_urls.is_empty() {
        let _ = client
            .execute(
                "DELETE FROM crawler_nlp_cache WHERE source_url = ANY($1::text[])",
                &[&source_urls],
            )
            .await;
    }

    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "message": "Data crawl history berhasil dihapus",
            "events_deleted": events_deleted,
            "matrix_deleted": matrix_deleted,
            "reports_deleted": reports_deleted,
            "id": id,
        }),
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
}

pub async fn list_jobs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CrawlHistoryJobsQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    if !matrix_tables_ready(&client).await {
        let (page, per_page, _) = build_pagination(query.page, query.per_page);
        return Ok(Json(ApiResponse {
            success: true,
            data: Vec::new(),
            total: Some(0),
            page: Some(page),
            per_page: Some(per_page),
            total_pages: Some(0),
        }));
    }
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);
    let q = opt_text(&query.q);
    let status = match opt_text(&query.status).unwrap_or_default().to_ascii_lowercase().as_str() {
        "queued" | "processing" | "completed" | "partial" | "failed" => opt_text(&query.status),
        _ => None,
    };
    let country = match opt_text(&query.country) {
        Some(value) if value.eq_ignore_ascii_case("all") => None,
        other => other,
    };
    let disease = opt_text(&query.disease);
    let date_from = opt_text(&query.date_from);
    let date_to = opt_text(&query.date_to);
    let rows = client
        .query(
            "SELECT id, status, disease_names, region, country, province_city,
                    date_from::text, date_to::text, max_articles, query,
                    discovered_count, processed_count, row_count, warnings, error,
                    created_at::text, updated_at::text, completed_at::text
             FROM crawl_matrix_jobs
             WHERE ($1::text IS NULL
                    OR country ILIKE '%'||$1||'%'
                    OR region ILIKE '%'||$1||'%'
                    OR disease_names::text ILIKE '%'||$1||'%'
                    OR id::text ILIKE '%'||$1||'%')
               AND ($2::text IS NULL OR status = $2)
               AND ($3::text IS NULL OR country ILIKE '%'||$3||'%' OR region ILIKE '%'||$3||'%')
               AND ($4::text IS NULL OR disease_names::text ILIKE '%'||$4||'%')
               AND ($5::text IS NULL OR created_at::date >= $5::date)
               AND ($6::text IS NULL OR created_at::date <= $6::date)
             ORDER BY created_at DESC
             LIMIT $7 OFFSET $8",
            &[&q, &status, &country, &disease, &date_from, &date_to, &per_page, &offset],
        )
        .await
        .map_err(internal_error)?;
    let data = rows
        .into_iter()
        .map(|row| {
            json!({
                "job_id": row.get::<_, Uuid>(0),
                "status": row.get::<_, String>(1),
                "disease_names": row.get::<_, Value>(2),
                "region": row.get::<_, Option<String>>(3),
                "country": row.get::<_, Option<String>>(4),
                "province_city": row.get::<_, Option<String>>(5),
                "date_from": row.get::<_, Option<String>>(6),
                "date_to": row.get::<_, Option<String>>(7),
                "max_articles": row.get::<_, i32>(8),
                "query": row.get::<_, Value>(9),
                "discovered_count": row.get::<_, i32>(10),
                "processed_count": row.get::<_, i32>(11),
                "row_count": row.get::<_, i32>(12),
                "warnings": row.get::<_, Value>(13),
                "error": row.get::<_, Option<String>>(14),
                "created_at": row.get::<_, Option<String>>(15),
                "updated_at": row.get::<_, Option<String>>(16),
                "completed_at": row.get::<_, Option<String>>(17),
            })
        })
        .collect();
    let total: i64 = client
        .query_one(
            "SELECT COUNT(*)::bigint FROM crawl_matrix_jobs
             WHERE ($1::text IS NULL
                    OR country ILIKE '%'||$1||'%'
                    OR region ILIKE '%'||$1||'%'
                    OR disease_names::text ILIKE '%'||$1||'%'
                    OR id::text ILIKE '%'||$1||'%')
               AND ($2::text IS NULL OR status = $2)
               AND ($3::text IS NULL OR country ILIKE '%'||$3||'%' OR region ILIKE '%'||$3||'%')
               AND ($4::text IS NULL OR disease_names::text ILIKE '%'||$4||'%')
               AND ($5::text IS NULL OR created_at::date >= $5::date)
               AND ($6::text IS NULL OR created_at::date <= $6::date)",
            &[&q, &status, &country, &disease, &date_from, &date_to],
        )
        .await
        .map_err(internal_error)?
        .get(0);
    Ok(Json(ApiResponse {
        success: true,
        data,
        total: Some(total),
        page: Some(page),
        per_page: Some(per_page),
        total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

pub async fn get_job(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let job_id = parse_row_id(&id)?;
    let client = state.db.get().await.map_err(internal_error)?;
    if !matrix_tables_ready(&client).await {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "error": "Manual crawler job was not found"})),
        ));
    }
    let job = client
        .query_opt(
            "SELECT id, status, disease_names, region, country, province_city,
                    date_from::text, date_to::text, max_articles, query,
                    discovered_count, processed_count, row_count, warnings, error,
                    created_at::text, updated_at::text, completed_at::text
             FROM crawl_matrix_jobs WHERE id = $1",
            &[&job_id],
        )
        .await
        .map_err(internal_error)?;
    let Some(job) = job else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "error": "Manual crawler job was not found"})),
        ));
    };
    let row_sql = format!(
        "{} ORDER BY sort_ts DESC NULLS LAST, id DESC LIMIT 500",
        collapse_article_sql(&format!(
            "{} WHERE m.crawl_job_id = $1",
            matrix_select_sql(EVIDENCE_LIST_CHARS)
        ))
    );
    let rows = client
        .query(&row_sql, &[&job_id])
        .await
        .map_err(internal_error)?;
    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "job_id": job.get::<_, Uuid>(0),
            "status": job.get::<_, String>(1),
            "disease_names": job.get::<_, Value>(2),
            "region": job.get::<_, Option<String>>(3),
            "country": job.get::<_, Option<String>>(4),
            "province_city": job.get::<_, Option<String>>(5),
            "date_from": job.get::<_, Option<String>>(6),
            "date_to": job.get::<_, Option<String>>(7),
            "max_articles": job.get::<_, i32>(8),
            "query": job.get::<_, Value>(9),
            "discovered_count": job.get::<_, i32>(10),
            "processed_count": job.get::<_, i32>(11),
            "row_count": job.get::<_, i32>(12),
            "warnings": job.get::<_, Value>(13),
            "error": job.get::<_, Option<String>>(14),
            "created_at": job.get::<_, Option<String>>(15),
            "updated_at": job.get::<_, Option<String>>(16),
            "completed_at": job.get::<_, Option<String>>(17),
            "rows": rows.iter().map(map_ledger_row).collect::<Vec<_>>(),
        }),
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
}

fn surveillance_event_pred(alias: &str) -> String {
    format!(
        "{alias}.is_health_related = TRUE
         AND {known}
         AND COALESCE({alias}.confidence, 0) >= {min}
         AND {skip}",
        alias = alias,
        known = known_disease_sql(&format!("{alias}.disease_classification")),
        min = SURVEILLANCE_MIN_CONFIDENCE,
        skip = skip_test_skdr(alias),
    )
}

pub async fn summary(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let pred = surveillance_event_pred("de");
    let matrix_ready = matrix_tables_ready(&client).await;
    let matrix_jobs = if matrix_ready {
        "(SELECT COUNT(*)::bigint FROM crawl_matrix_jobs)"
    } else {
        "0::bigint"
    };
    let matrix_rows = if matrix_ready {
        "(SELECT COUNT(*)::bigint FROM crawl_matrix_rows)"
    } else {
        "0::bigint"
    };
    let matrix_surv = known_disease_sql("m.disease_name");
    let manual_rows = if matrix_ready {
        format!("(SELECT COUNT(*)::bigint FROM crawl_matrix_rows m WHERE {matrix_surv})")
    } else {
        "0::bigint".into()
    };
    let skip_matrix = if matrix_ready {
        r#"AND NOT EXISTS (
                            SELECT 1 FROM crawl_matrix_rows mx
                            WHERE mx.raw_report_id IS NOT NULL AND mx.raw_report_id = de.raw_report_id
                        )"#
    } else {
        ""
    };
    let surveillance_extra = if matrix_ready {
        format!("+ (SELECT COUNT(*)::bigint FROM crawl_matrix_rows m WHERE {matrix_surv})")
    } else {
        String::new()
    };
    let counts = client
        .query_one(
            &format!(
                "SELECT
                    {matrix_jobs} AS jobs,
                    {matrix_rows} AS matrix_rows,
                    (SELECT COUNT(*)::bigint FROM raw_reports
                      WHERE LOWER(COALESCE(source_type, '')) NOT IN ('test', 'skdr', 'skdr_api')) AS raw_reports,
                    (SELECT COUNT(*)::bigint FROM disease_events
                      WHERE LOWER(COALESCE(source_type, '')) NOT IN ('test', 'skdr', 'skdr_api')) AS disease_events,
                    {manual_rows} AS manual_rows,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE {pred}
                        AND LOWER(COALESCE(de.source_name, '')) <> 'url analyzer'
                        {skip_matrix}) AS continuous_rows,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE {pred}
                        AND LOWER(COALESCE(de.source_name, '')) = 'url analyzer') AS analyze_url_rows,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE {pred} AND de.geom IS NOT NULL) AS with_geo,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE {pred} AND de.geom IS NULL) AS without_geo,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE {pred} AND COALESCE(de.needs_review, FALSE)) AS needs_review,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE {pred} AND de.geom IS NOT NULL) AS mapped,
                    (SELECT COUNT(*)::bigint FROM disease_events de WHERE {pred})
                      {surveillance_extra} AS surveillance,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE de.is_health_related = TRUE
                        AND UPPER(BTRIM(COALESCE(de.disease_classification, ''))) NOT LIKE 'NEGATIVE%'
                        AND (NOT {known} OR COALESCE(de.confidence, 0) < {min})
                        AND {skip}) AS review,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE COALESCE(de.is_health_related, FALSE) IS NOT TRUE
                         OR UPPER(BTRIM(COALESCE(de.disease_classification, ''))) LIKE 'NEGATIVE%') AS noise",
                pred = pred,
                known = known_disease_sql("de.disease_classification"),
                min = SURVEILLANCE_MIN_CONFIDENCE,
                skip = skip_test_skdr("de"),
            ),
            &[],
        )
        .await
        .map_err(internal_error)?;
    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "phase": "phase2",
            "note": "",
            "default_quality": "surveillance",
            "jobs": counts.get::<_, i64>(0),
            "matrix_rows": counts.get::<_, i64>(1),
            "raw_reports": counts.get::<_, i64>(2),
            "disease_events": counts.get::<_, i64>(3),
            "by_channel": {
                "manual": counts.get::<_, i64>(4),
                "continuous": counts.get::<_, i64>(5),
                "analyze_url": counts.get::<_, i64>(6),
            },
            "with_geo": counts.get::<_, i64>(7),
            "without_geo": counts.get::<_, i64>(8),
            "needs_review": counts.get::<_, i64>(9),
            "mapped": counts.get::<_, i64>(10),
            "quality": {
                "surveillance": counts.get::<_, i64>(11),
                "review": counts.get::<_, i64>(12),
                "noise": counts.get::<_, i64>(13),
            },
            "noise_excluded": counts.get::<_, i64>(13),
            "fields": export_headers(),
        }),
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_aliases_map_to_storage_tokens() {
        assert_eq!(parse_channel(&None), Channel::All);
        assert_eq!(parse_channel(&Some("ALL".into())), Channel::All);
        assert_eq!(parse_channel(&Some("manual_crawler".into())), Channel::Manual);
        assert_eq!(parse_channel(&Some("continuous".into())), Channel::Continuous);
        assert_eq!(parse_channel(&Some("analyze_url".into())), Channel::AnalyzeUrl);
        assert_eq!(channel_sql(Channel::AnalyzeUrl), Some("analyze-url"));
        assert_eq!(channel_sql(Channel::All), None);
    }

    #[test]
    fn export_helpers_escape_and_cap() {
        assert_eq!(export_limit(None), 2_000);
        assert_eq!(export_limit(Some(99_000)), EXPORT_CAP);
        assert_eq!(csv_cell(&json!("a\"b")), "\"a\"\"b\"");
        assert_eq!(xml_escape("<H5N1 & flu>"), "&lt;H5N1 &amp; flu&gt;");
        let csv = to_csv(&[json!({
            "title": "Measles, Singapore",
            "url": "https://example.org/a",
            "article_date": "2026-01-02",
            "country": "Singapore",
            "region": null,
            "province_city_case": null,
            "disease": "Measles",
            "cases": 43,
            "deaths": 0,
            "confidence": 0.9,
            "source_type": "news",
            "source_name": "MOH",
            "language": "en",
            "crawling_date": "2026-09-17",
            "date_case": "2026-01-02",
            "status": "processed",
            "disease_event_id": "00000000-0000-0000-0000-000000000001",
            "is_health_related": true,
            "needs_review": false,
            "outbreak_alert": false,
        })]);
        assert!(csv.starts_with('\u{feff}'));
        assert!(csv.contains("No,Country,Language,Source URL,Article Title,Disease Name"));
        assert!(csv.contains("Measles, Singapore"));
        assert!(csv.contains("43"));
        assert!(csv.contains("True"));
        let xls = to_excel_xml(&[json!({"title": "<x>", "cases": 1, "deaths": 0})]);
        assert!(xls.contains("&lt;x&gt;"));
        assert!(xls.contains("ss:Type=\"Number\""));
    }

    #[test]
    fn status_filter_ignores_unknown_tokens() {
        assert_eq!(parse_status(&Some("needs_review".into())).as_deref(), Some("needs_review"));
        assert_eq!(parse_status(&Some("bogus".into())), None);
        assert!(parse_job_id(&Some("not-a-uuid".into())).is_err());
        assert!(parse_job_id(&None).unwrap().is_none());
        let (page, per_page, offset) = history_pagination(None, None);
        assert_eq!((page, per_page, offset), (1, 25, 0));
    }

    #[test]
    fn quality_defaults_to_surveillance_and_paginates_in_sql() {
        assert_eq!(parse_quality(&None), Quality::Surveillance);
        assert_eq!(parse_quality(&Some("".into())), Quality::Surveillance);
        assert_eq!(parse_quality(&Some("surveillance".into())), Quality::Surveillance);
        assert_eq!(parse_quality(&Some("ALL".into())), Quality::All);
        assert_eq!(parse_quality(&Some("non-health".into())), Quality::Noise);
        assert_eq!(quality_sql(Quality::Surveillance), Some("surveillance"));
        assert_eq!(quality_sql(Quality::All), None);
        let event_where = event_where_sql(Quality::Surveillance, true);
        assert!(event_where.contains("is_health_related = TRUE"));
        assert!(event_where.contains("0.15"));
        assert!(!event_where.contains("DISTINCT ON"));
        let event_sql = event_select_sql(180);
        assert!(event_sql.contains("de.language"));
        assert!(event_sql.contains("province_city_case"));
        assert!(event_sql.contains("crawling_date"));
        assert!(!event_sql.contains("DISTINCT ON"));
        let matrix_where = matrix_where_sql(Quality::Surveillance);
        assert!(matrix_where.contains("LIMIT") == false);
        assert!(matrix_where.contains("disease_name"));
        assert!(event_sql.contains("article_key"));
        let inner = "SELECT de.epidemiological_evidence #>> '{}' AS evidence, 1 AS article_key";
        let collapsed = collapse_article_sql(inner);
        assert!(collapsed.contains("GROUP BY b.article_key"));
        assert!(collapsed.contains("cases_display"));
        assert!(collapsed.contains("deaths_display"));
        assert!(collapsed.contains("geo_summary"));
        assert!(collapsed.contains("location_count"));
        assert!(!collapsed.contains("__INNER__"));
        assert!(collapsed.contains("#>> '{}'"));
        let country_sql = event_country_select();
        assert!(country_sql.contains("loc_hist.country"));
        assert!(country_sql.contains("de.province"));
        assert!(country_sql.contains("de.city"));
        assert!(!country_sql.contains("ORDER BY CASE"));
        assert!(!event_sql.contains("ORDER BY CASE"));
        let places = place_or_null_sql("de.province");
        assert!(places.contains("harian"));
        assert!(event_where_sql(Quality::Surveillance, false).contains("is_health_related = TRUE"));
        assert!(!event_where_sql(Quality::Surveillance, false).contains("crawl_matrix_rows mx"));
    }

    #[test]
    fn event_list_filter_avoids_per_row_locations_lookup() {
        let where_sql = event_where_sql(Quality::Surveillance, false);
        assert!(
            !where_sql.contains("ORDER BY CASE"),
            "ASEAN filter must not correlated-scan locations per disease_events row"
        );
        assert!(where_sql.contains("loc_hist.country"));
        assert!(where_sql.contains("de.location_name"));
        let keys = event_key_page_sql(Quality::Surveillance, false);
        assert!(keys.contains("GROUP BY 1"));
        assert!(keys.contains("LIMIT $11"));
        assert!(keys.contains("original_text"));
        assert!(keys.contains("summary"));
        assert!(!keys.contains("epidemiological_evidence"));
        assert!(keys.contains("loc_hist"));
        let count_sql = event_key_count_sql(Quality::Surveillance, false);
        assert!(count_sql.contains("COUNT(*)"));
        assert!(!count_sql.contains("ORDER BY CASE"));
    }

    #[test]
    fn multi_location_display_matches_sheet_pattern() {
        assert_eq!(
            format_label_counts(vec![
                ("Philippines".into(), 3734),
                ("Indonesia".into(), 8278),
            ]),
            "Indonesia(8278); Philippines(3734)"
        );
        assert_eq!(
            format_label_counts(vec![("Indonesia".into(), 12), ("".into(), 9)]),
            "Indonesia(12)"
        );
        assert_eq!(
            join_unique_labels(vec!["Philippines".into(), "Indonesia".into(), "Indonesia".into()]),
            "Indonesia; Philippines"
        );
        let csv = to_csv(&[json!({
            "country": "Indonesia; Philippines",
            "disease": "Dengue; Measles",
            "cases_display": "Indonesia(8278); Philippines(3734)",
            "deaths_display": "Indonesia(12); Philippines(3)",
            "geo_summary": "2 locations",
            "latitude": 1.2,
            "longitude": 103.8,
            "is_health_related": true,
        })]);
        assert!(csv.contains("Indonesia(8278); Philippines(3734)"));
        assert!(csv.contains("Indonesia(12); Philippines(3)"));
        let flu_rsv = collapse_article_facts(&[
            ArticleFact {
                disease: Some("Influenza".into()),
                location: Some("Bangkok".into()),
                cases: Some(120),
                deaths: Some(0),
            },
            ArticleFact {
                disease: Some("Respiratory syncytial virus infection".into()),
                location: Some("Bangkok".into()),
                cases: Some(45),
                deaths: Some(0),
            },
        ]);
        assert_eq!(flu_rsv.disease, "Influenza; RSV");
        assert_eq!(flu_rsv.location, "Bangkok");
        assert_eq!(flu_rsv.cases_display.as_deref(), Some("Influenza(120); RSV(45)"));
        assert_eq!(flu_rsv.dimension, "disease");
        let mixed = collapse_article_facts(&[
            ArticleFact {
                disease: Some("Influenza".into()),
                location: Some("Indonesia".into()),
                cases: Some(8278),
                deaths: Some(12),
            },
            ArticleFact {
                disease: Some("RSV".into()),
                location: Some("Philippines".into()),
                cases: Some(3734),
                deaths: Some(3),
            },
        ]);
        assert_eq!(mixed.disease, "Influenza; RSV");
        assert_eq!(mixed.location, "Indonesia; Philippines");
        assert_eq!(mixed.cases_display.as_deref(), Some("Indonesia(8278); Philippines(3734)"));
        assert_eq!(mixed.deaths_display.as_deref(), Some("Indonesia(12); Philippines(3)"));
        assert_eq!(mixed.dimension, "location");
        assert!(csv.contains("2 locations"));
        assert!(!csv.contains("103.8"));
        assert_eq!(display_or_value(&json!({"cases_display": "", "cases": 9}), "cases_display", "cases"), json!(9));
        let sql = collapse_article_sql("SELECT 1 AS article_key, NULL::uuid AS parent_event_id");
        assert!(sql.contains("dt.cases_display"));
        assert!(sql.contains("parent_event_id"));
        assert!(sql.contains("primary_place"));
        assert!(sql.contains("primary_country"));
        assert!(sql.contains("FILTER (WHERE cases > 0)"));
    }
}
