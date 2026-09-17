//! Authenticated crawl-history ledger: stored manual-job matrix rows plus
//! continuous / analyze-url outcomes that did not come from those jobs.
//! Empty tables return empty pages — never dummy rows.

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
const SNIPPET_CHARS: i32 = 800;
const TITLE_CHARS: i32 = 220;

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

fn export_limit(per_page: Option<i64>) -> i64 {
    per_page.unwrap_or(2_000).max(1).min(EXPORT_CAP)
}

fn csv_cell(value: &Value) -> String {
    let text = match value {
        Value::Null => String::new(),
        Value::Bool(flag) => {
            if *flag {
                "true".into()
            } else {
                "false".into()
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

fn export_headers() -> [&'static str; 18] {
    [
        "title",
        "url",
        "published_at",
        "country",
        "province",
        "city",
        "disease",
        "cases",
        "deaths",
        "confidence",
        "source",
        "crawl_channel",
        "job_id",
        "mapped",
        "needs_review",
        "has_geo",
        "raw_report_id",
        "status",
    ]
}

fn row_export_values(row: &Value) -> Vec<Value> {
    vec![
        row["title"].clone(),
        row["url"].clone(),
        row["published_at"].clone(),
        row["country"].clone(),
        row["province"].clone(),
        row["city"].clone(),
        row["disease"].clone(),
        row["cases"].clone(),
        row["deaths"].clone(),
        row["confidence"].clone(),
        json!(format!(
            "{} / {}",
            json_text(&row["source_type"]),
            json_text(&row["source_name"])
        )),
        row["crawl_channel"].clone(),
        row["job_id"].clone(),
        row["mapped"].clone(),
        row["needs_review"].clone(),
        row["has_geo"].clone(),
        row["raw_report_id"].clone(),
        row["status"].clone(),
    ]
}

fn to_csv(rows: &[Value]) -> String {
    let mut out = String::from('\u{feff}');
    out.push_str(&export_headers().join(","));
    out.push('\n');
    for row in rows {
        let line = row_export_values(row)
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
    for row in rows {
        out.push_str("   <Row>");
        for value in row_export_values(row) {
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
                AND {expr} IN ('Brunei','Cambodia','Indonesia','Laos','Malaysia','Myanmar','Philippines','Singapore','Thailand','Timor-Leste','Vietnam')
              )
              OR {expr} = {param}
            )"#
    )
}

fn unified_source_sql() -> String {
    let matrix_country = asean11_fold_sql("m.country");
    let event_country = asean11_fold_sql("COALESCE(loc.country, de.location_name)");
    format!(
        r#"
        SELECT
            m.id,
            'manual'::text AS crawl_channel,
            m.crawl_job_id,
            m.raw_report_id,
            de.id AS disease_event_id,
            COALESCE(NULLIF(m.article_title, ''), NULLIF(LEFT(rr.original_text, {TITLE_CHARS}), ''), m.source_url) AS title,
            COALESCE(m.source_url, rr.url) AS url,
            COALESCE(m.article_date, rr.published_at, m.crawling_date)::text AS published_at,
            {matrix_country} AS country,
            NULLIF(m.province, '') AS province,
            NULLIF(m.city, '') AS city,
            m.disease_name AS disease,
            m.icd11_code,
            COALESCE(m.number_of_cases, 0)::bigint AS cases,
            COALESCE(m.number_of_deaths, 0)::bigint AS deaths,
            m.confidence::float8 AS confidence,
            COALESCE(m.source_type, rr.source_type, 'news') AS source_type,
            COALESCE(m.source_name, rr.source_name) AS source_name,
            m.processing_status AS status,
            (m.processing_status = 'needs_review' OR COALESCE(de.needs_review, FALSE)) AS needs_review,
            (m.latitude IS NOT NULL AND m.longitude IS NOT NULL) AS has_geo,
            (de.id IS NOT NULL OR (m.latitude IS NOT NULL AND m.longitude IS NOT NULL)) AS mapped,
            m.latitude::float8 AS latitude,
            m.longitude::float8 AS longitude,
            m.created_at::text AS created_at,
            m.evidence,
            LEFT(COALESCE(rr.original_text, m.evidence, ''), {SNIPPET_CHARS}) AS snippet
        FROM crawl_matrix_rows m
        JOIN crawl_matrix_jobs j ON j.id = m.crawl_job_id
        LEFT JOIN raw_reports rr ON rr.id = m.raw_report_id
        LEFT JOIN LATERAL (
            SELECT de0.id, de0.needs_review
            FROM disease_events de0
            WHERE de0.raw_report_id IS NOT NULL AND de0.raw_report_id = m.raw_report_id
            ORDER BY de0.created_at DESC
            LIMIT 1
        ) de ON TRUE

        UNION ALL

        SELECT
            de.id,
            CASE
                WHEN aj.id IS NOT NULL OR LOWER(COALESCE(de.source_name, rr.source_name, '')) = 'url analyzer'
                    THEN 'analyze-url'
                ELSE 'continuous'
            END AS crawl_channel,
            NULL::uuid AS crawl_job_id,
            de.raw_report_id,
            de.id AS disease_event_id,
            COALESCE(NULLIF(LEFT(rr.original_text, {TITLE_CHARS}), ''), rr.url, de.location_name) AS title,
            rr.url,
            COALESCE(de.published_at, rr.published_at)::text AS published_at,
            {event_country} AS country,
            NULLIF(de.province, '') AS province,
            NULLIF(de.city, '') AS city,
            COALESCE(de.disease_classification, '') AS disease,
            NULL::text AS icd11_code,
            COALESCE(de.case_count, 0)::bigint AS cases,
            COALESCE(de.death_count, 0)::bigint AS deaths,
            de.confidence::float8 AS confidence,
            COALESCE(de.source_type, rr.source_type) AS source_type,
            COALESCE(de.source_name, rr.source_name) AS source_name,
            CASE
                WHEN COALESCE(de.needs_review, FALSE) THEN 'needs_review'
                WHEN de.disease_classification IS NULL OR UPPER(de.disease_classification) IN ('UNKNOWN', '') THEN 'failed'
                ELSE 'processed'
            END AS status,
            COALESCE(de.needs_review, FALSE) AS needs_review,
            (de.geom IS NOT NULL) AS has_geo,
            (de.geom IS NOT NULL OR NULLIF(de.location_name, '') IS NOT NULL) AS mapped,
            ST_Y(de.geom)::float8 AS latitude,
            ST_X(de.geom)::float8 AS longitude,
            de.created_at::text AS created_at,
            LEFT(COALESCE(de.original_text, ''), 400) AS evidence,
            LEFT(COALESCE(rr.original_text, de.original_text, ''), {SNIPPET_CHARS}) AS snippet
        FROM disease_events de
        LEFT JOIN raw_reports rr ON rr.id = de.raw_report_id
        LEFT JOIN LATERAL (
            SELECT l.country
            FROM locations l
            WHERE l.is_active = TRUE AND LOWER(l.name) = LOWER(de.location_name)
            ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
            LIMIT 1
        ) loc ON TRUE
        LEFT JOIN LATERAL (
            SELECT aj0.id
            FROM analysis_jobs aj0
            WHERE aj0.event_id = de.id
            ORDER BY aj0.created_at DESC
            LIMIT 1
        ) aj ON TRUE
        WHERE NOT EXISTS (
            SELECT 1 FROM crawl_matrix_rows m
            WHERE m.raw_report_id IS NOT NULL AND m.raw_report_id = de.raw_report_id
        )
          AND LOWER(COALESCE(de.source_type, '')) NOT IN ('test', 'skdr', 'skdr_api')
        "#,
        TITLE_CHARS = TITLE_CHARS,
        SNIPPET_CHARS = SNIPPET_CHARS,
        matrix_country = matrix_country,
        event_country = event_country,
    )
}

fn filter_sql(country_expr: &str) -> String {
    format!(
        r#"
        WHERE ($1::text IS NULL
               OR title ILIKE '%'||$1||'%'
               OR COALESCE(url, '') ILIKE '%'||$1||'%'
               OR COALESCE(source_name, '') ILIKE '%'||$1||'%'
               OR COALESCE(disease, '') ILIKE '%'||$1||'%')
          AND ($2::text IS NULL OR crawl_channel = $2)
          {country}
          AND ($4::text IS NULL OR disease ILIKE '%'||$4||'%')
          AND ($5::text IS NULL OR COALESCE(published_at, LEFT(created_at, 10)) >= $5)
          AND ($6::text IS NULL OR COALESCE(published_at, LEFT(created_at, 10)) <= $6)
          AND ($7::text IS NULL OR status = $7)
          AND ($8::bool IS NULL OR needs_review = $8)
          AND ($9::bool IS NULL OR has_geo = $9)
          AND ($10::uuid IS NULL OR crawl_job_id = $10)
        "#,
        country = country_filter_sql(country_expr, "$3")
    )
}

fn map_ledger_row(row: &tokio_postgres::Row) -> Value {
    json!({
        "id": row.get::<_, Uuid>(0),
        "crawl_channel": row.get::<_, String>(1),
        "job_id": row.get::<_, Option<Uuid>>(2),
        "raw_report_id": row.get::<_, Option<Uuid>>(3),
        "disease_event_id": row.get::<_, Option<Uuid>>(4),
        "title": row.get::<_, Option<String>>(5),
        "url": row.get::<_, Option<String>>(6),
        "published_at": row.get::<_, Option<String>>(7),
        "country": row.get::<_, Option<String>>(8),
        "province": row.get::<_, Option<String>>(9),
        "city": row.get::<_, Option<String>>(10),
        "disease": row.get::<_, Option<String>>(11),
        "icd11_code": row.get::<_, Option<String>>(12),
        "cases": row.get::<_, i64>(13),
        "deaths": row.get::<_, i64>(14),
        "confidence": row.get::<_, Option<f64>>(15),
        "source_type": row.get::<_, Option<String>>(16),
        "source_name": row.get::<_, Option<String>>(17),
        "status": row.get::<_, Option<String>>(18),
        "needs_review": row.get::<_, bool>(19),
        "has_geo": row.get::<_, bool>(20),
        "mapped": row.get::<_, bool>(21),
        "latitude": row.get::<_, Option<f64>>(22),
        "longitude": row.get::<_, Option<f64>>(23),
        "created_at": row.get::<_, Option<String>>(24),
        "evidence": row.get::<_, Option<String>>(25),
        "snippet": row.get::<_, Option<String>>(26),
    })
}

async fn load_filtered_rows(
    state: &AppState,
    query: &CrawlHistoryQuery,
    limit: i64,
    offset: i64,
    with_total: bool,
) -> Result<(Vec<Value>, i64), (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let q = opt_text(&query.q);
    let channel = channel_sql(parse_channel(&query.channel)).map(|value| value.to_string());
    let country = match opt_text(&query.country) {
        Some(value) if value.eq_ignore_ascii_case("all") || value == "*" => None,
        other => other,
    };
    let disease = opt_text(&query.disease);
    let date_from = opt_text(&query.date_from);
    let date_to = opt_text(&query.date_to);
    let status = parse_status(&query.status);
    let job_id = parse_job_id(&query.job_id)?;
    let source = unified_source_sql();
    let filters = filter_sql("country");
    let select_sql = format!(
        "SELECT id, crawl_channel, crawl_job_id, raw_report_id, disease_event_id, title, url,
                published_at, country, province, city, disease, icd11_code, cases, deaths,
                confidence, source_type, source_name, status, needs_review, has_geo, mapped,
                latitude, longitude, created_at, evidence, snippet
         FROM ({source}) ledger
         {filters}
         ORDER BY COALESCE(published_at, LEFT(created_at, 10)) DESC NULLS LAST, created_at DESC
         LIMIT $11 OFFSET $12"
    );
    let count_sql = format!("SELECT COUNT(*)::bigint FROM ({source}) ledger {filters}", source = source, filters = filters);

    let rows = client
        .query(
            &select_sql,
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
                &limit,
                &offset,
            ],
        )
        .await
        .map_err(internal_error)?;
    let data: Vec<Value> = rows.iter().map(map_ledger_row).collect();
    if !with_total {
        let exported = data.len() as i64;
        return Ok((data, exported));
    }
    let total: i64 = client
        .query_one(
            &count_sql,
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
            ],
        )
        .await
        .map_err(internal_error)?
        .get(0);
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
        let (page, per_page, offset) = build_pagination(query.page, query.per_page);
        (per_page, offset, page, per_page)
    };
    let (data, total) = load_filtered_rows(&state, &query, limit, offset, !export).await?;
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
    let source = unified_source_sql();
    let sql = format!(
        "SELECT id, crawl_channel, crawl_job_id, raw_report_id, disease_event_id, title, url,
                published_at, country, province, city, disease, icd11_code, cases, deaths,
                confidence, source_type, source_name, status, needs_review, has_geo, mapped,
                latitude, longitude, created_at, evidence, snippet
         FROM ({source}) ledger
         WHERE id = $1 AND ($2::text IS NULL OR crawl_channel = $2)
         LIMIT 1"
    );
    let channel_param = channel_sql(channel).map(|value| value.to_string());
    let row = client
        .query_opt(&sql, &[&uuid, &channel_param])
        .await
        .map_err(internal_error)?;
    let Some(row) = row else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "error": "Crawl history row was not found"})),
        ));
    };
    let mut data = map_ledger_row(&row);

    if let Some(event_id) = data["disease_event_id"].as_str().and_then(|value| Uuid::parse_str(value).ok()) {
        if let Ok(Some(extra)) = client
            .query_opt(
                "SELECT de.language, de.sentiment, de.event_type, de.relevance_score,
                        de.source_credibility::float8, de.source_credibility_label,
                        de.is_health_related, de.outbreak_alert, de.location_name,
                        de.symptoms, de.disease_extracted, de.needs_review
                 FROM disease_events de WHERE de.id = $1",
                &[&event_id],
            )
            .await
        {
            data["language"] = json!(extra.get::<_, Option<String>>(0));
            data["sentiment"] = json!(extra.get::<_, Option<String>>(1));
            data["event_type"] = json!(extra.get::<_, Option<String>>(2));
            data["relevance_score"] = json!(extra.get::<_, Option<String>>(3));
            data["source_credibility"] = json!(extra.get::<_, Option<f64>>(4));
            data["source_credibility_label"] = json!(extra.get::<_, Option<String>>(5));
            data["is_health_related"] = json!(extra.get::<_, Option<bool>>(6));
            data["outbreak_alert"] = json!(extra.get::<_, Option<bool>>(7));
            data["location_name"] = json!(extra.get::<_, Option<String>>(8));
            data["symptoms"] = extra
                .get::<_, Option<Value>>(9)
                .unwrap_or_else(|| json!([]));
            data["disease_extracted"] = extra
                .get::<_, Option<Value>>(10)
                .unwrap_or_else(|| json!([]));
            if extra.get::<_, Option<bool>>(11).unwrap_or(false) {
                data["needs_review"] = json!(true);
            }
        }
    }
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
    let source = unified_source_sql();
    let row_sql = format!(
        "SELECT id, crawl_channel, crawl_job_id, raw_report_id, disease_event_id, title, url,
                published_at, country, province, city, disease, icd11_code, cases, deaths,
                confidence, source_type, source_name, status, needs_review, has_geo, mapped,
                latitude, longitude, created_at, evidence, snippet
         FROM ({source}) ledger
         WHERE crawl_job_id = $1
         ORDER BY COALESCE(published_at, LEFT(created_at, 10)) DESC NULLS LAST, created_at DESC
         LIMIT 500"
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

pub async fn summary(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let source = unified_source_sql();
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
                    COUNT(*) FILTER (WHERE crawl_channel = 'manual')::bigint AS manual_rows,
                    COUNT(*) FILTER (WHERE crawl_channel = 'continuous')::bigint AS continuous_rows,
                    COUNT(*) FILTER (WHERE crawl_channel = 'analyze-url')::bigint AS analyze_url_rows,
                    COUNT(*) FILTER (WHERE has_geo)::bigint AS with_geo,
                    COUNT(*) FILTER (WHERE NOT has_geo)::bigint AS without_geo,
                    COUNT(*) FILTER (WHERE needs_review)::bigint AS needs_review,
                    COUNT(*) FILTER (WHERE mapped)::bigint AS mapped
                 FROM ({source}) ledger"
            ),
            &[],
        )
        .await
        .map_err(internal_error)?;
    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "phase": "phase2",
            "note": "Live Phase 2 stored counts. Phase 1 totals are not invented here; compare volume and field richness (province/city, geo, confidence, channel, job id, mapped, needs_review) against a Phase 1 export when that system is reachable.",
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
            "fields": [
                "title","url","published_at","country","province","city","disease",
                "cases","deaths","confidence","source","crawl_channel","job_id",
                "mapped","needs_review","raw_report_id","evidence","geo"
            ],
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
            "published_at": "2026-01-02",
            "country": "Singapore",
            "province": null,
            "city": null,
            "disease": "Measles",
            "cases": 43,
            "deaths": 0,
            "confidence": 0.9,
            "source_type": "news",
            "source_name": "MOH",
            "crawl_channel": "manual",
            "job_id": null,
            "mapped": true,
            "needs_review": false,
            "has_geo": true,
            "raw_report_id": null,
            "status": "processed",
        })]);
        assert!(csv.starts_with('\u{feff}'));
        assert!(csv.contains("Measles, Singapore"));
        assert!(csv.contains("43"));
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
    }
}
