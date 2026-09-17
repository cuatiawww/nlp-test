//! Authenticated crawl-history ledger: stored manual-job matrix rows plus
//! continuous / analyze-url outcomes that did not come from those jobs.
//! Default quality is health surveillance (known disease, not UNKNOWN/non-health).
//! List queries paginate in SQL (inner LIMIT per branch) — never scan the full union.

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
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

fn export_headers() -> [&'static str; 29] {
    [
        "No",
        "Country",
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
        row["cases"].clone(),
        row["deaths"].clone(),
        row["latitude"].clone(),
        row["longitude"].clone(),
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

fn event_country_where(param: &str) -> String {
    let fold_loc = asean11_fold_sql("de.location_name");
    let fold_l = asean11_fold_sql("l.country");
    format!(
        r#"AND (
              {param}::text IS NULL
              OR (
                LOWER({param}) IN ('asean', 'asean11')
                AND (
                  {fold_loc} IN ({list})
                  OR EXISTS (
                    SELECT 1 FROM locations l
                    WHERE l.is_active = TRUE
                      AND LOWER(l.name) = LOWER(de.location_name)
                      AND {fold_l} IN ({list})
                  )
                )
              )
              OR {fold_loc} = {param}
              OR EXISTS (
                SELECT 1 FROM locations l
                WHERE l.is_active = TRUE
                  AND LOWER(l.name) = LOWER(de.location_name)
                  AND {fold_l} = {param}
              )
            )"#,
        list = ASEAN11_IN
    )
}

fn event_country_select() -> String {
    let loc = "(SELECT l.country FROM locations l WHERE l.is_active = TRUE AND LOWER(l.name) = LOWER(de.location_name) ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC LIMIT 1)";
    asean11_fold_sql(&format!("COALESCE({loc}, de.location_name)"))
}

fn skip_test_skdr(alias: &str) -> String {
    format!("LOWER(COALESCE({alias}.source_type, '')) NOT IN ('test', 'skdr', 'skdr_api')")
}

fn matrix_select_sql(evidence_chars: i32) -> String {
    let matrix_country = asean11_fold_sql("m.country");
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
            {matrix_country} AS country,
            NULLIF(m.region, '') AS region,
            COALESCE(NULLIF(m.province_city_case, ''), NULLIF(CONCAT_WS(' / ', NULLIF(m.province, ''), NULLIF(m.city, '')), '')) AS province_city_case,
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
            COALESCE(m.crawling_date::timestamp, m.created_at::timestamp) AS sort_ts
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
        matrix_known = matrix_known,
        matrix_quality = matrix_quality,
    )
}

fn event_select_sql(evidence_chars: i32) -> String {
    let event_country = event_country_select();
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
            COALESCE(NULLIF(LEFT(rr.original_text, {title}), ''), COALESCE(rr.url, de.source_url), de.location_name) AS title,
            COALESCE(rr.url, de.source_url) AS url,
            de.language,
            {event_country} AS country,
            NULLIF(de.location_name, '') AS region,
            COALESCE(NULLIF(CONCAT_WS(' / ', NULLIF(de.province, ''), NULLIF(de.city, '')), ''), NULLIF(de.location_name, '')) AS province_city_case,
            NULLIF(de.province, '') AS province,
            NULLIF(de.city, '') AS city,
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
            de.created_at::timestamp AS sort_ts
        FROM disease_events de
        LEFT JOIN raw_reports rr ON rr.id = de.raw_report_id
        "#,
        title = TITLE_CHARS,
        evidence = evidence_chars,
        snippet = SNIPPET_CHARS,
        event_country = event_country,
        event_known = event_known,
        pipeline_quality = pipeline_quality,
    )
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

fn event_where_sql(quality: Quality) -> String {
    let known = known_disease_sql("de.disease_classification");
    format!(
        r#"
        WHERE {quality_where}
          AND {skip}
          AND NOT EXISTS (
              SELECT 1 FROM crawl_matrix_rows mx
              WHERE mx.raw_report_id IS NOT NULL AND mx.raw_report_id = de.raw_report_id
          )
          AND ($1::text IS NULL
               OR COALESCE(de.disease_classification, '') ILIKE '%'||$1||'%'
               OR COALESCE(de.source_name, '') ILIKE '%'||$1||'%'
               OR COALESCE(de.location_name, '') ILIKE '%'||$1||'%'
               OR COALESCE(rr.url, de.source_url, '') ILIKE '%'||$1||'%')
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
        country = event_country_where("$3"),
        known = known,
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
        "title": title,
        "article_title": title,
        "url": map_opt_string(row, "url"),
        "language": map_opt_string(row, "language"),
        "country": map_opt_string(row, "country"),
        "region": map_opt_string(row, "region"),
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
    let include_matrix = matches!(parsed_channel, Channel::All | Channel::Manual);
    let include_events = job_id.is_none()
        && matches!(parsed_channel, Channel::All | Channel::Continuous | Channel::AnalyzeUrl);

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
    let matrix_sql = format!(
        "{} {} ORDER BY sort_ts DESC NULLS LAST, id DESC",
        matrix_select_sql(evidence_chars),
        matrix_where_sql(quality)
    );
    let event_sql = format!(
        "{} {} ORDER BY sort_ts DESC NULLS LAST, id DESC",
        event_select_sql(evidence_chars),
        event_where_sql(quality)
    );

    let select_sql = if include_matrix && include_events {
        format!(
            "SELECT * FROM (
                ({matrix} LIMIT $11)
                UNION ALL
                ({event} LIMIT $11)
             ) ledger
             ORDER BY sort_ts DESC NULLS LAST, id DESC
             LIMIT $12 OFFSET $13",
            matrix = matrix_sql,
            event = event_sql
        )
    } else if include_matrix {
        format!("{matrix} LIMIT $11 OFFSET $12", matrix = matrix_sql)
    } else if include_events {
        format!("{event} LIMIT $11 OFFSET $12", event = event_sql)
    } else {
        return Ok((Vec::new(), 0));
    };

    let rows = if include_matrix && include_events {
        client
            .query(&select_sql, &[&q, &channel, &country, &disease, &date_from, &date_to, &status, &query.needs_review, &query.has_geo, &job_id, &cap, &limit, &offset])
            .await
            .map_err(internal_error)?
    } else {
        client
            .query(&select_sql, &[&q, &channel, &country, &disease, &date_from, &date_to, &status, &query.needs_review, &query.has_geo, &job_id, &limit, &offset])
            .await
            .map_err(internal_error)?
    };
    let data: Vec<Value> = rows.iter().map(map_ledger_row).collect();
    if !with_total {
        let exported = data.len() as i64;
        return Ok((data, exported));
    }

    let mut total = 0_i64;
    if include_matrix {
        let count_sql = format!(
            "SELECT COUNT(*)::bigint FROM crawl_matrix_rows m
             JOIN crawl_matrix_jobs j ON j.id = m.crawl_job_id
             LEFT JOIN raw_reports rr ON rr.id = m.raw_report_id
             {}",
            matrix_where_sql(quality)
        );
        total += client
            .query_one(&count_sql, &params)
            .await
            .map_err(internal_error)?
            .get::<_, i64>(0);
    }
    if include_events {
        let count_sql = format!(
            "SELECT COUNT(*)::bigint FROM disease_events de
             LEFT JOIN raw_reports rr ON rr.id = de.raw_report_id
             {}",
            event_where_sql(quality)
        );
        total += client
            .query_one(&count_sql, &params)
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

pub async fn get_row(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<CrawlHistoryQuery>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let uuid = parse_row_id(&id)?;
    let client = state.db.get().await.map_err(internal_error)?;
    let channel = parse_channel(&query.channel);
    let try_matrix = matches!(channel, Channel::All | Channel::Manual);
    let try_events = matches!(channel, Channel::All | Channel::Continuous | Channel::AnalyzeUrl);

    let mut data = None;
    if try_matrix {
        let sql = format!(
            "{} WHERE m.id = $1 LIMIT 1",
            matrix_select_sql(EVIDENCE_DETAIL_CHARS)
        );
        if let Some(row) = client.query_opt(&sql, &[&uuid]).await.map_err(internal_error)? {
            data = Some(map_ledger_row(&row));
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

pub async fn list_jobs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CrawlHistoryJobsQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
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
        "{} WHERE m.crawl_job_id = $1
         ORDER BY COALESCE(m.crawling_date::timestamp, m.created_at::timestamp) DESC NULLS LAST, m.id DESC
         LIMIT 500",
        matrix_select_sql(EVIDENCE_LIST_CHARS)
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
    let counts = client
        .query_one(
            &format!(
                "SELECT
                    (SELECT COUNT(*)::bigint FROM crawl_matrix_jobs) AS jobs,
                    (SELECT COUNT(*)::bigint FROM crawl_matrix_rows) AS matrix_rows,
                    (SELECT COUNT(*)::bigint FROM raw_reports
                      WHERE LOWER(COALESCE(source_type, '')) NOT IN ('test', 'skdr', 'skdr_api')) AS raw_reports,
                    (SELECT COUNT(*)::bigint FROM disease_events
                      WHERE LOWER(COALESCE(source_type, '')) NOT IN ('test', 'skdr', 'skdr_api')) AS disease_events,
                    (SELECT COUNT(*)::bigint FROM crawl_matrix_rows m
                      WHERE {matrix_surv}) AS manual_rows,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE {pred}
                        AND LOWER(COALESCE(de.source_name, '')) <> 'url analyzer'
                        AND NOT EXISTS (
                            SELECT 1 FROM crawl_matrix_rows mx
                            WHERE mx.raw_report_id IS NOT NULL AND mx.raw_report_id = de.raw_report_id
                        )) AS continuous_rows,
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
                      + (SELECT COUNT(*)::bigint FROM crawl_matrix_rows m WHERE {matrix_surv}) AS surveillance,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE de.is_health_related = TRUE
                        AND UPPER(BTRIM(COALESCE(de.disease_classification, ''))) NOT LIKE 'NEGATIVE%'
                        AND (NOT {known} OR COALESCE(de.confidence, 0) < {min})
                        AND {skip}) AS review,
                    (SELECT COUNT(*)::bigint FROM disease_events de
                      WHERE COALESCE(de.is_health_related, FALSE) IS NOT TRUE
                         OR UPPER(BTRIM(COALESCE(de.disease_classification, ''))) LIKE 'NEGATIVE%') AS noise",
                pred = pred,
                matrix_surv = known_disease_sql("m.disease_name"),
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
            "note": "Default matrix is paginated health surveillance (known disease, health-related, confidence ≥ 0.15, ASEAN-11+Timor-Leste when country is known). Summary cards are cheap COUNT queries, not a full matrix scan. Non-health RSS stays stored for Events QA.",
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
        let event_where = event_where_sql(Quality::Surveillance);
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
    }
}
