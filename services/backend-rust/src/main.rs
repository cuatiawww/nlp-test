use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use chrono::{Datelike, NaiveDate};
use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{env, net::SocketAddr, sync::Arc};
use tokio_postgres::{Config, NoTls};
use lapin::{
    options::{BasicPublishOptions, QueueDeclareOptions},
    types::FieldTable,
    BasicProperties, Connection, ConnectionProperties,
};
use tower_http::cors::CorsLayer;
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    db: Pool,
    http: Client,
    nlp_service_url: String,
    collector_url: String,
    amqp_channel: lapin::Channel,
    dashboard_api_token: String,
}

#[derive(Debug, Deserialize)]
struct IngestRequest {
    source_type: String,
    source_name: Option<String>,
    published_at: Option<String>,
    text: String,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnalyzeUrlRequest {
    url: String,
}

#[derive(Debug, Deserialize)]
struct CollectorExtractData {
    title: String,
    content: String,
    #[serde(default)]
    fetch_mode: Option<String>,
    #[serde(default)]
    http_status: Option<i32>,
    #[serde(default)]
    source_country: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CollectorExtractResponse {
    success: bool,
    data: CollectorExtractData,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct LocationItem {
    name: String,
    #[serde(default)]
    latitude: Option<f64>,
    #[serde(default)]
    longitude: Option<f64>,
    #[serde(default)]
    country: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct NlpResponse {
    language: String,
    normalized_text: String,
    location_name: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    #[serde(default)]
    country: Option<String>,
    #[serde(default)]
    translated: bool,
    #[serde(default)]
    translation_provider: String,
    #[serde(default)]
    translated_text: String,
    #[serde(default)]
    original_location_name: Option<String>,
    symptoms: Vec<String>,
    disease_extracted: Vec<String>,
    disease_classification: String,
    case_count: i32,
    death_count: i32,
    confidence: f64,
    outbreak_alert: bool,
    #[serde(default)]
    sentiment: Option<String>,
    #[serde(default)]
    sentiment_score: Option<f64>,
    #[serde(default)]
    event_type: Option<String>,
    #[serde(default)]
    event_confidence: Option<f64>,
    #[serde(default)]
    relevance_score: Option<String>,
    #[serde(default)]
    relevance_confidence: Option<f64>,
    #[serde(default)]
    source_credibility: Option<f64>,
    #[serde(default)]
    source_credibility_label: Option<String>,
    #[serde(default)]
    needs_review: Option<bool>,
    #[serde(default)]
    is_health_related: Option<bool>,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    locations: Vec<LocationItem>,
}

#[derive(Debug, Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    total: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_pages: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct CreateSourceRequest {
    name: String,
    source_type: String,
    #[serde(default)]
    config: Value,
    schedule: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateSourceRequest {
    name: Option<String>,
    source_type: Option<String>,
    config: Option<Value>,
    schedule: Option<String>,
    enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RunsQuery {
    source_id: Option<Uuid>,
    page: Option<i64>,
    per_page: Option<i64>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct PublicDashboardQuery {
    country: Option<String>,
    year: Option<i32>,
    source: Option<String>,
}


#[derive(Debug, Deserialize)]
struct CreateUserRequest {
    username: String,
    password: String,
    display_name: Option<String>,
    role: Option<String>,
    email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateUserRequest {
    password: Option<String>,
    display_name: Option<String>,
    role: Option<String>,
    email: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CreateRuleRequest {
    disease_name: String,
    display_label: Option<String>,
    min_case_count: i32,
    is_active: Option<bool>,
    priority: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct LabelQuery {
    category: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CreateLabelRequest {
    category: String,
    label: String,
    priority: Option<i32>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateLabelRequest {
    label: Option<String>,
    priority: Option<i32>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct KeywordQuery {
    category: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CreateKeywordRequest {
    category: String,
    keyword: String,
    target_label: String,
    priority: Option<i32>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateKeywordRequest {
    keyword: Option<String>,
    target_label: Option<String>,
    priority: Option<i32>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateRuleRequest {
    disease_name: Option<String>,
    display_label: Option<String>,
    min_case_count: Option<i32>,
    is_active: Option<bool>,
    priority: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct CreateLocationRequest {
    name: String,
    latitude: f64,
    longitude: f64,
    country: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateLocationRequest {
    name: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    country: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CreateSourceCredibilityRequest {
    source_type: String,
    score: f64,
}

#[derive(Debug, Deserialize)]
struct UpdateSourceCredibilityRequest {
    source_type: Option<String>,
    score: Option<f64>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct EventsQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    disease: Option<String>,
    source_type: Option<String>,
    outbreak_alert: Option<bool>,
    date_from: Option<String>,
    date_to: Option<String>,
    is_health_related: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct SourcesQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    source_type: Option<String>,
    enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UsersQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    role: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RulesQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CreateLanguageMarkerRequest {
    word: String,
    language: String,
}

#[derive(Debug, Deserialize)]
struct UpdateLanguageMarkerRequest {
    word: Option<String>,
    language: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CreateExtractionRuleRequest {
    field_name: String,
    regex_pattern: String,
    priority: Option<i32>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateExtractionRuleRequest {
    field_name: Option<String>,
    regex_pattern: Option<String>,
    priority: Option<i32>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CreateLanguageModelRequest {
    language: String,
    model_key: String,
}

#[derive(Debug, Deserialize)]
struct UpdateLanguageModelRequest {
    language: Option<String>,
    model_key: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct LocationsQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    country: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SummaryQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    disease: Option<String>,
}


#[derive(Debug, Deserialize)]
struct UpdateSystemSettingsRequest {
    config_data: Value,
}

#[derive(Debug, Deserialize)]
struct AuditLogsQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    user_id: Option<Uuid>,
    action: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()))
        .init();

    let database_url = env::var("DATABASE_URL")?;
    let nlp_service_url = env::var("NLP_SERVICE_URL").unwrap_or_else(|_| "http://nlp-python:8000".to_string());
    let collector_url = env::var("COLLECTOR_URL").unwrap_or_else(|_| "http://collector-python:8002".to_string());
    let port = env::var("BACKEND_PORT").unwrap_or_else(|_| "8080".to_string());
    let dashboard_api_token = env::var("API_TOKEN")
        .expect("API_TOKEN must be configured");

    let pg_config: Config = database_url.parse()?;
    let mgr_config = ManagerConfig { recycling_method: RecyclingMethod::Fast };
    let mgr = Manager::from_config(pg_config, NoTls, mgr_config);
    let pool = Pool::builder(mgr).max_size(16).build()?;

    let init_dir = env::var("INIT_SQL_DIR").unwrap_or_else(|_| "/init".to_string());
    run_init_sql(&pool, &init_dir).await?;

    let amqp_url = env::var("RABBITMQ_URL").unwrap_or_else(|_| "amqp://guest:guest@rabbitmq:5672/%2f".to_string());
    let amqp_conn = Connection::connect(&amqp_url, ConnectionProperties::default()).await?;
    let amqp_channel = amqp_conn.create_channel().await?;
    amqp_channel
        .queue_declare(
            "disease.raw",
            QueueDeclareOptions { durable: true, ..Default::default() },
            FieldTable::default(),
        )
        .await?;
    tracing::info!("connected to RabbitMQ");

    let state = Arc::new(AppState {
        db: pool,
        http: Client::new(),
        nlp_service_url,
        collector_url,
        amqp_channel,
        dashboard_api_token,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/v1/ingest", post(ingest))
        .route("/api/v1/analyze-url", post(analyze_url))
        .route("/api/v1/events", get(list_events))
        .route("/api/v1/events/stats", get(dashboard_stats))
        .route("/api/v1/summary", get(summary))
        .route("/api/v1/public-dashboard", get(public_dashboard))
        .route("/api/v1/skdr-reports", get(list_skdr_reports))
        .route("/api/v1/dashboard/summary", get(dashboard_summary))
        .route("/api/v1/sources", get(list_sources).post(create_source))
        .route("/api/v1/sources/collect-all", post(trigger_collect_all))
        .route(
            "/api/v1/sources/:id",
            get(get_source).put(update_source).delete(delete_source),
        )
        .route("/api/v1/sources/:id/collect", post(trigger_collect))
        .route("/api/v1/runs", get(list_runs))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/v1/users", get(list_users).post(create_user))
        .route("/api/v1/users/:id", get(get_user).delete(delete_user))
        .route("/api/v1/users/:id/edit", post(update_user))
        .route("/api/v1/outbreak-rules", get(list_rules).post(create_rule))
        .route("/api/v1/outbreak-rules/:id", get(get_rule).delete(delete_rule))
        .route("/api/v1/outbreak-rules/:id/edit", post(update_rule))
        .route("/api/v1/nlp-labels", get(list_labels).post(create_label))
        .route("/api/v1/nlp-labels/:id", put(update_label).delete(delete_label))
        .route("/api/v1/nlp-keywords", get(list_keywords).post(create_keyword))
        .route("/api/v1/nlp-keywords/:id", put(update_keyword).delete(delete_keyword))
        .route("/api/v1/data/cleanup-events", post(cleanup_events))
        .route("/api/v1/locations", get(list_locations).post(create_location))
        .route("/api/v1/locations/:id", put(update_location).delete(delete_location))
        .route("/api/v1/source-credibility", get(list_source_credibility).post(create_source_credibility))
        .route("/api/v1/source-credibility/:id", put(update_source_credibility).delete(delete_source_credibility))
        .route(
            "/api/v1/language-markers",
            get(list_language_markers).post(create_language_marker),
        )
        .route(
            "/api/v1/language-markers/:id",
            put(update_language_marker).delete(delete_language_marker),
        )
        .route(
            "/api/v1/extraction-rules",
            get(list_extraction_rules).post(create_extraction_rule),
        )
        .route(
            "/api/v1/extraction-rules/:id",
            put(update_extraction_rule).delete(delete_extraction_rule),
        )
        .route(
            "/api/v1/language-models",
            get(list_language_models).post(create_language_model),
        )
        .route(
            "/api/v1/language-models/:id",
            put(update_language_model).delete(delete_language_model),
        )
                .route("/api/v1/console/settings", get(get_system_settings).put(update_system_settings))
        .route("/api/v1/console/audit-logs", get(list_audit_logs))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse()?;
    tracing::info!("backend-rust listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": "backend-rust" }))
}

async fn ingest(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<IngestRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let raw_id: Uuid = client
        .query_one(
            "INSERT INTO raw_reports (source_type, source_name, published_at, original_text, url, processing_status)
             VALUES ($1, $2, $3, $4, $5, 'NEW') RETURNING id",
            &[
                &payload.source_type,
                &payload.source_name,
                &parse_date(payload.published_at.as_deref()),
                &payload.text,
                &payload.url,
            ],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    let message = json!({
        "raw_report_id": raw_id,
        "source_type": payload.source_type,
        "source_name": payload.source_name,
        "published_at": payload.published_at,
        "text": payload.text,
        "url": payload.url,
        "object_path": Value::Null,
    });

    let publish_result = state
        .amqp_channel
        .basic_publish(
            "",
            "disease.raw",
            BasicPublishOptions::default(),
            &message.to_string().as_bytes(),
            BasicProperties::default(),
        )
        .await;

    match publish_result {
        Ok(_) => Ok(Json(ApiResponse {
            success: true,
            data: json!({ "raw_report_id": raw_id, "status": "queued" }),
            total: None, page: None, per_page: None, total_pages: None,
        })),
        Err(e) => {
            tracing::warn!("RabbitMQ unavailable, processing synchronously: {:?}", e);
            let nlp_url = format!("{}/nlp/analyze", state.nlp_service_url.trim_end_matches('/'));
            let nlp: NlpResponse = state
                .http
                .post(nlp_url)
                .json(&json!({
                    "text": payload.text,
                    "source_type": payload.source_type,
                    "source_name": payload.source_name,
                    "published_at": payload.published_at
                }))
                .send()
                .await
                .map_err(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": "RabbitMQ unavailable and NLP service unreachable" })),
                    )
                })?
                .json()
                .await
                .map_err(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": "RabbitMQ unavailable and NLP response invalid" })),
                    )
                })?;

            let _ = client
                .execute(
                    "UPDATE raw_reports SET processing_status='PROCESSED' WHERE id=$1",
                    &[&raw_id],
                )
                .await;

            client
                .execute(
                    "INSERT INTO disease_events (
                raw_report_id, source_type, source_name, published_at, original_text, language,
                location_name, geom, symptoms, disease_extracted, disease_classification,
                case_count, death_count, confidence, outbreak_alert,
                sentiment, event_type, relevance_score
             ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7,
                CASE WHEN $8::float8 IS NULL OR $9::float8 IS NULL THEN NULL
                     ELSE ST_SetSRID(ST_MakePoint($9, $8), 4326)
                END,
                $10::jsonb, $11::jsonb, $12,
                $13, $14, $15, $16,
                $17, $18, $19
             )",
            &[
                        &raw_id,
                        &payload.source_type,
                        &payload.source_name,
                        &parse_date(payload.published_at.as_deref()),
                        &payload.text,
                        &nlp.language,
                        &nlp.location_name,
                        &nlp.latitude,
                        &nlp.longitude,
                        &json!(nlp.symptoms),
                        &json!(nlp.disease_extracted),
                        &nlp.disease_classification,
                        &nlp.case_count,
                        &nlp.death_count,
                        &nlp.confidence,
                        &nlp.outbreak_alert,
                        &nlp.sentiment,
                        &nlp.event_type,
                        &nlp.relevance_score,
                    ],
                )
                .await
                .map_err(|err| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": format!("Sync processing failed: {}", err) })),
                    )
                })?;

            Ok(Json(ApiResponse {
                success: true,
                data: json!({ "raw_report_id": raw_id, "nlp": nlp, "status": "processed_sync" }),
                total: None, page: None, per_page: None, total_pages: None,
            }))
        }
    }
}

fn extract_title_from_html(html: &str) -> String {
    let lower = html.to_lowercase();
    let tag_start = lower.find("<title>").or_else(|| lower.find("<title "));
    match tag_start {
        Some(start) => {
            let after_open = html[start..].find('>').map(|i| start + i + 1).unwrap_or(start);
            let remaining = &html[after_open..];
            let end = remaining.to_lowercase().find("</title>").unwrap_or(0);
            if end > 0 {
                remaining[..end].trim().to_string()
            } else {
                String::new()
            }
        }
        None => String::new(),
    }
}

fn find_iso_date_after(html: &str, marker: &str) -> Option<NaiveDate> {
    let lower = html.to_lowercase();
    let marker_lower = marker.to_lowercase();
    let bytes = html.as_bytes();

    for (marker_pos, _) in lower.match_indices(&marker_lower) {
        let start = marker_pos.saturating_sub(32);
        let end = (marker_pos + 768).min(html.len());
        let mut index = start;
        while index + 10 <= end {
            if bytes[index].is_ascii_digit()
                && bytes[index + 4] == b'-'
                && bytes[index + 7] == b'-'
                && bytes[index + 5].is_ascii_digit()
                && bytes[index + 6].is_ascii_digit()
                && bytes[index + 8].is_ascii_digit()
                && bytes[index + 9].is_ascii_digit()
            {
                if let Ok(value) = std::str::from_utf8(&bytes[index..index + 10]) {
                    if let Ok(date) = NaiveDate::parse_from_str(value, "%Y-%m-%d") {
                        return Some(date);
                    }
                }
            }
            index += 1;
        }
    }
    None
}

fn extract_published_date(html: &str) -> Option<NaiveDate> {
    [
        "datepublished",
        "article:published_time",
        "published_time",
        "datecreated",
        "pubdate",
    ]
    .iter()
    .find_map(|marker| find_iso_date_after(html, marker))
}

fn html_tag_name(tag: &str) -> String {
    tag.trim_start_matches(|c: char| c.is_whitespace() || c == '/' || c == '<' || c == '>')
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == ':')
        .collect::<String>()
        .to_lowercase()
}

fn extract_element_by_marker(html: &str, marker: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let marker_pos = lower.find(&marker.to_lowercase())?;
    let open_start = lower[..=marker_pos].rfind('<')?;
    if lower[open_start..].starts_with("</") {
        return None;
    }
    let open_end = lower[open_start..].find('>').map(|i| open_start + i)?;
    let tag_name = html_tag_name(&html[open_start..=open_end]);
    if tag_name.is_empty() {
        return None;
    }

    let mut depth = 1i32;
    let mut cursor = open_end + 1;
    while cursor < html.len() {
        let relative = lower[cursor..].find('<')?;
        let tag_start = cursor + relative;
        if lower[tag_start..].starts_with("<!--") {
            cursor = lower[tag_start..]
                .find("-->")
                .map(|i| tag_start + i + 3)
                .unwrap_or(html.len());
            continue;
        }
        let tag_end = lower[tag_start..].find('>').map(|i| tag_start + i)?;
        let inside = &html[tag_start + 1..tag_end];
        let trimmed = inside.trim_start();
        let is_closing = trimmed.starts_with('/');
        let candidate_name = html_tag_name(inside);
        if candidate_name == tag_name {
            if is_closing {
                depth -= 1;
                if depth == 0 {
                    return Some(html[open_start..=tag_end].to_string());
                }
            } else if !trimmed.ends_with('/') {
                depth += 1;
            }
        }
        cursor = tag_end + 1;
    }
    None
}

fn strip_html_text(html: &str) -> String {
    let mut result = String::new();
    let chars: Vec<char> = html.chars().collect();
    let n = chars.len();
    let mut i = 0;
    let mut in_tag = false;
    let mut in_skip = false;
    let mut skip_tag = String::new();

    while i < n {
        match chars[i] {
            '<' => {
                in_tag = true;
                if i + 1 < n {
                    let mut j = i + 1;
                    while j < n && chars[j].is_whitespace() { j += 1; }
                    let mut name = String::new();
                    while j < n && (chars[j].is_ascii_alphanumeric() || chars[j] == '/') {
                        if chars[j] != '/' { name.push(chars[j].to_ascii_lowercase()); }
                        j += 1;
                    }
                    if !in_skip && matches!(name.as_str(), "script" | "style" | "noscript" | "template" | "svg" | "iframe" | "nav" | "header" | "footer" | "aside" | "form") {
                        in_skip = true;
                        skip_tag = name;
                    } else if in_skip
                        && name == skip_tag
                        && i + 1 < n
                        && chars[i + 1] == '/'
                    {
                        in_skip = false;
                        skip_tag.clear();
                    }
                }
            }
            '>' => {
                in_tag = false;
                if !in_skip { result.push(' '); }
            }
            _ if !in_tag && !in_skip => result.push(chars[i]),
            _ => {}
        }
        i += 1;
    }

    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn extract_body_text(html: &str) -> String {
    // Prefer the article body. The old implementation flattened the complete
    // page, so related stories and navigation locations could win extraction.
    let markers = [
        "itemprop=\"articlebody\"",
        "wrap__article-detail-content",
        "class=\"article-content\"",
        "class=\"field-body\"",
        "post-content",
        "article-body",
        "article-content",
        "story-body",
        "entry-content",
        "<article",
        "<main",
    ];
    for marker in markers {
        if let Some(fragment) = extract_element_by_marker(html, marker) {
            let mut text = strip_html_text(&fragment);
            for boundary in [" Baca juga:", " Pewarta:", " Editor:", " Copyright ©", " Dilarang keras"] {
                if let Some(pos) = text.find(boundary) {
                    text.truncate(pos);
                }
            }
            if text.split_whitespace().count() >= 20 {
                return text;
            }
        }
    }
    strip_html_text(html)
}

async fn analyze_url(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AnalyzeUrlRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let url = payload.url.trim().to_string();

    if url.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(json!({ "success": false, "error": "URL tidak boleh kosong" }))));
    }

    let client = state.db.get().await.map_err(internal_error)?;

    let row = client
        .query_opt(
            "SELECT de.id, de.raw_report_id, de.original_text, de.language,
                    COALESCE(de.published_at, rr.published_at) AS published_at,
                    COALESCE(
                        CASE WHEN LOWER(de.location_name) IN ('sudan', 'south sudan')
                             THEN 'OUTSIDE ASEAN' ELSE l.country END,
                        CASE
                            WHEN LOWER(de.location_name) IN ('brunei', 'brunei darussalam') THEN 'Brunei'
                            WHEN LOWER(de.location_name) IN ('cambodia', 'indonesia', 'laos', 'malaysia', 'myanmar', 'philippines', 'singapore', 'thailand', 'timor-leste', 'vietnam')
                              THEN INITCAP(LOWER(de.location_name))
                            ELSE 'OUTSIDE ASEAN'
                        END
                    ) AS country,
                    de.location_name, ST_X(de.geom) as longitude, ST_Y(de.geom) as latitude,
                    de.symptoms, de.disease_extracted,
                    de.disease_classification, de.case_count, de.death_count, de.confidence,
                    de.outbreak_alert, de.sentiment, de.needs_review, de.event_type,
                    de.event_confidence::float8, de.relevance_score, de.relevance_confidence::float8,
                    de.source_credibility::float8, de.source_credibility_label, de.is_health_related
             FROM disease_events de
             JOIN raw_reports rr ON de.raw_report_id = rr.id
             LEFT JOIN locations l ON LOWER(l.name) = LOWER(de.location_name)
             WHERE rr.url = $1
               AND de.created_at > NOW() - INTERVAL '7 days'
               AND de.disease_classification IS NOT NULL
               AND de.disease_classification != 'UNKNOWN'
               AND de.disease_classification != 'Unknown Disease'
               AND de.confidence >= 0.50
             ORDER BY de.created_at DESC
             LIMIT 1",
            &[&url],
        )
        .await
        .map_err(internal_error)?;

    if let Some(row) = row {
        let original_text: String = row.get("original_text");
        let (cached_title, cached_content) = if let Some(pos) = original_text.find(".\n") {
            (original_text[..pos].to_string(), original_text[pos + 2..].to_string())
        } else {
            (String::new(), original_text.clone())
        };

        let symptoms_val: serde_json::Value = row.get("symptoms");
        let symptoms: Vec<String> = serde_json::from_value(symptoms_val).unwrap_or_default();
        let disease_val: serde_json::Value = row.get("disease_extracted");
        let disease_extracted: Vec<String> = serde_json::from_value(disease_val).unwrap_or_default();

        let event_id: Uuid = row.get("id");
        let raw_report_id: Uuid = row.get("raw_report_id");

        let mut sources = serde_json::Map::new();
        let cached_msg = "Data retrieved from database (previous analysis result)";
        sources.insert("title".to_string(), json!(cached_msg));
        sources.insert("content".to_string(), json!(cached_msg));
        sources.insert("language".to_string(), json!(cached_msg));
        sources.insert("location_name".to_string(), json!(cached_msg));
        sources.insert("symptoms".to_string(), json!(cached_msg));
        sources.insert("disease_extracted".to_string(), json!(cached_msg));
        sources.insert("disease_classification".to_string(), json!(cached_msg));
        sources.insert("case_count".to_string(), json!(cached_msg));
        sources.insert("death_count".to_string(), json!(cached_msg));
        sources.insert("confidence".to_string(), json!(cached_msg));
        sources.insert("outbreak_alert".to_string(), json!(cached_msg));
        sources.insert("sentiment".to_string(), json!(cached_msg));
        sources.insert("event_type".to_string(), json!(cached_msg));
        sources.insert("relevance_score".to_string(), json!(cached_msg));
        sources.insert("source_credibility".to_string(), json!(cached_msg));
        sources.insert("is_health_related".to_string(), json!(cached_msg));
        sources.insert("published_at".to_string(), json!(cached_msg));

        let loc_rows = client
            .query(
                "SELECT de.location_name, ST_X(de.geom) as longitude, ST_Y(de.geom) as latitude, l.country
                 FROM disease_events de
                 LEFT JOIN locations l ON LOWER(l.name) = LOWER(de.location_name)
                 WHERE de.raw_report_id = $1 AND de.location_name IS NOT NULL
                 GROUP BY de.location_name, de.geom, l.country
                 ORDER BY MIN(de.created_at) ASC",
                &[&raw_report_id],
            )
            .await
            .unwrap_or_default();
        let cached_locations: Vec<serde_json::Value> = loc_rows.iter().map(|r| {
            json!({
                "name": r.get::<_, String>("location_name"),
                "latitude": r.get::<_, Option<f64>>("latitude"),
                "longitude": r.get::<_, Option<f64>>("longitude"),
                "country": r.get::<_, Option<String>>("country"),
            })
        }).collect();

        return Ok(Json(ApiResponse {
            success: true,
            data: json!({
                "title": cached_title,
                "content": cached_content,
                "url": url,
                "published_at": row.get::<_, Option<NaiveDate>>("published_at").map(|date| date.to_string()),
                "language": row.get::<_, String>("language"),
                "location_name": row.get::<_, Option<String>>("location_name"),
                "latitude": row.get::<_, Option<f64>>("latitude"),
                "longitude": row.get::<_, Option<f64>>("longitude"),
                "country": row.get::<_, Option<String>>("country"),
                "locations": cached_locations,
                "symptoms": symptoms,
                "disease_extracted": disease_extracted,
                "disease_classification": row.get::<_, String>("disease_classification"),
                "case_count": row.get::<_, i32>("case_count"),
                "death_count": row.get::<_, i32>("death_count"),
                "confidence": row.get::<_, f64>("confidence"),
                "outbreak_alert": row.get::<_, bool>("outbreak_alert"),
                "sentiment": row.get::<_, Option<String>>("sentiment"),
                "sentiment_score": Value::Null,
                "event_type": row.get::<_, Option<String>>("event_type"),
                "event_confidence": row.get::<_, Option<f64>>("event_confidence"),
                "relevance_score": row.get::<_, Option<String>>("relevance_score"),
                "relevance_confidence": row.get::<_, Option<f64>>("relevance_confidence"),
                "source_credibility": row.get::<_, Option<f64>>("source_credibility"),
                "source_credibility_label": row.get::<_, Option<String>>("source_credibility_label"),
                "needs_review": row.get::<_, Option<bool>>("needs_review"),
                "is_health_related": row.get::<_, Option<bool>>("is_health_related"),
                "raw_report_id": raw_report_id,
                "event_id": event_id,
                "sources": Value::Object(sources),
            }),
            total: None,
            page: None,
            per_page: None,
            total_pages: None,
        }))
    }

    let collector_endpoint = format!("{}/extract-url", state.collector_url.trim_end_matches('/'));
    let resp = state
        .http
        .post(&collector_endpoint)
        .json(&json!({ "url": url, "fetch_mode": "auto", "timeout_ms": 18000 }))
        .timeout(std::time::Duration::from_secs(25))
        .send()
        .await
        .map_err(|e| {
            let err_str = e.to_string();
            let is_timeout = e.is_timeout() || err_str.contains("timed out") || err_str.contains("timeout");
            let msg = if is_timeout {
                "Waktu ekstraksi URL habis (timeout). Website sumber artikel mungkin lambat atau memblokir crawler.".to_string()
            } else {
                format!("Collector tidak dapat mengambil URL: {}", e)
            };
            (
                StatusCode::GATEWAY_TIMEOUT,
                Json(json!({ "success": false, "error": msg })),
            )
        })?;
    if !resp.status().is_success() {
        let status = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        let parsed_error = serde_json::from_str::<serde_json::Value>(&detail)
            .ok()
            .and_then(|v| v.get("detail").or_else(|| v.get("error")).and_then(|d| d.as_str()).map(String::from))
            .unwrap_or(detail);
        return Err((StatusCode::BAD_REQUEST, Json(json!({
            "success": false, "error": format!("Gagal mengambil URL: {}", parsed_error)
        }))));
    }
    let extracted: CollectorExtractResponse = resp.json().await.map_err(|_| (
        StatusCode::BAD_GATEWAY,
        Json(json!({ "success": false, "error": "Response collector tidak valid" })),
    ))?;
    if !extracted.success {
        return Err((StatusCode::BAD_GATEWAY, Json(json!({ "success": false, "error": "Collector gagal mengekstrak URL" }))));
    }
    let CollectorExtractData {
        title,
        content: body_text,
        fetch_mode,
        http_status,
        source_country,
        published_at,
    } = extracted.data;
    let published_date: Option<NaiveDate> = published_at
        .as_deref()
        .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
    let max_len: usize = env::var("ANALYZE_MAX_CONTENT_LENGTH")
        .unwrap_or_else(|_| "10000".to_string())
        .parse()
        .unwrap_or(10000);
    let content = if body_text.len() > max_len {
        // `max_len` is a byte-oriented limit, but Rust strings are UTF-8.
        // Truncate on a character boundary so Khmer/Lao/Myanmar content
        // cannot panic the request handler.
        let safe_prefix: String = body_text.chars().take(max_len).collect();
        format!("{}...", safe_prefix)
    } else {
        body_text
    };

    let text = if title.is_empty() {
        content.clone()
    } else {
        format!("{}.\n{}", title, content)
    };

    let nlp_url = format!("{}/nlp/analyze", state.nlp_service_url.trim_end_matches('/'));
    let nlp: NlpResponse = state
        .http
        .post(&nlp_url)
        .json(&json!({
            "text": text,
            "source_type": "web",
            "source_name": "URL Analyzer",
            "source_country": source_country,
            "published_at": published_at,
        }))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            let err_str = e.to_string();
            let is_timeout = e.is_timeout() || err_str.contains("timed out") || err_str.contains("timeout");
            let msg = if is_timeout {
                "Proses analisis NLP melebihi batas waktu (timeout).".to_string()
            } else {
                "NLP service tidak dapat dijangkau".to_string()
            };
            (
                StatusCode::GATEWAY_TIMEOUT,
                Json(json!({ "success": false, "error": msg })),
            )
        })?
        .json()
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "Response NLP tidak valid" })),
            )
        })?;

    let published_date = published_date.or_else(|| {
        nlp.published_at.as_deref().and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
    });

    let client = state.db.get().await.map_err(internal_error)?;

    // Clean any prior incomplete/stale record for this URL before writing the fresh analysis
    let _ = client
        .execute(
            "DELETE FROM disease_events WHERE raw_report_id IN (SELECT id FROM raw_reports WHERE url = $1);
             DELETE FROM raw_reports WHERE url = $1;",
            &[&url],
        )
        .await;

    let raw_id: Uuid = client
        .query_one(
            "INSERT INTO raw_reports (source_type, source_name, original_text, url, processing_status)
             VALUES ($1, $2, $3, $4, 'PROCESSED') RETURNING id",
            &[&"web", &"URL Analyzer", &text, &url],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    if let Some(date) = published_date {
        client
            .execute(
                "UPDATE raw_reports SET published_at=$1 WHERE id=$2",
                &[&date, &raw_id],
            )
            .await
            .map_err(internal_error)?;
    }

    let event_id: Uuid = client
        .query_one(
            "INSERT INTO disease_events (
                raw_report_id, source_type, source_name, original_text, language,
                location_name, geom, symptoms, disease_extracted, disease_classification,
                case_count, death_count, confidence, outbreak_alert,
                sentiment, needs_review, event_type, event_confidence,
                relevance_score, relevance_confidence, source_credibility,
                source_credibility_label, is_health_related
             ) VALUES (
                $1, $2, $3, $4, $5,
                $6,
                CASE WHEN $7::float8 IS NULL OR $8::float8 IS NULL THEN NULL
                     ELSE ST_SetSRID(ST_MakePoint($8, $7), 4326)
                END,
                $9::jsonb, $10::jsonb, $11,
                $12, $13, $14, $15,
                 $16, $17, $18, $19::float8,
                 $20, $21::float8, $22::float8,
                 $23, $24
             ) RETURNING id",
            &[
                &raw_id,
                &"web",
                &"URL Analyzer",
                &text,
                &nlp.language,
                &nlp.location_name,
                &nlp.latitude,
                &nlp.longitude,
                &json!(nlp.symptoms),
                &json!(nlp.disease_extracted),
                &nlp.disease_classification,
                &nlp.case_count,
                &nlp.death_count,
                &nlp.confidence,
                &nlp.outbreak_alert,
                &nlp.sentiment,
                &nlp.needs_review.unwrap_or(false),
                &nlp.event_type,
                &nlp.event_confidence,
                &nlp.relevance_score,
                &nlp.relevance_confidence,
                &nlp.source_credibility,
                &nlp.source_credibility_label,
                &nlp.is_health_related,
            ],
        )
        .await
        .map_err(|e| {
            tracing::error!("Error inserting disease_event: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": format!("Gagal menyimpan event: {}", e) })),
            )
        })?
        .get(0);

    if let Some(date) = published_date {
        client
            .execute(
                "UPDATE disease_events SET published_at=$1 WHERE id=$2",
                &[&date, &event_id],
            )
            .await
            .map_err(internal_error)?;
    }

    for loc in &nlp.locations {
        if Some(&loc.name) == nlp.location_name.as_ref() {
            continue;
        }
        let sec_event_id: Option<Uuid> = client
            .query_opt(
                "INSERT INTO disease_events (
                    raw_report_id, source_type, source_name, original_text, language,
                    location_name, geom, symptoms, disease_extracted, disease_classification,
                    case_count, death_count, confidence, outbreak_alert,
                    sentiment, needs_review, event_type, event_confidence,
                    relevance_score, relevance_confidence, source_credibility,
                    source_credibility_label, is_health_related
                 ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6,
                    CASE WHEN $7::float8 IS NULL OR $8::float8 IS NULL THEN NULL
                         ELSE ST_SetSRID(ST_MakePoint($8, $7), 4326)
                    END,
                    $9::jsonb, $10::jsonb, $11,
                    $12, $13, $14, $15,
                    $16, $17, $18, $19::float8,
                    $20, $21::float8, $22::float8,
                    $23, $24
                 ) RETURNING id",
                &[
                    &raw_id,
                    &"web",
                    &"URL Analyzer",
                    &text,
                    &nlp.language,
                    &loc.name,
                    &loc.latitude,
                    &loc.longitude,
                    &json!(nlp.symptoms),
                    &json!(nlp.disease_extracted),
                    &nlp.disease_classification,
                    &nlp.case_count,
                    &nlp.death_count,
                    &nlp.confidence,
                    &nlp.outbreak_alert,
                    &nlp.sentiment,
                    &nlp.needs_review.unwrap_or(false),
                    &nlp.event_type,
                    &nlp.event_confidence,
                    &nlp.relevance_score,
                    &nlp.relevance_confidence,
                    &nlp.source_credibility,
                    &nlp.source_credibility_label,
                    &nlp.is_health_related,
                ],
            )
            .await
            .ok()
            .flatten()
            .map(|r| r.get(0));

        if let (Some(sec_id), Some(date)) = (sec_event_id, published_date) {
            let _ = client
                .execute(
                    "UPDATE disease_events SET published_at=$1 WHERE id=$2",
                    &[&date, &sec_id],
                )
                .await;
        }
    }

    let mut sources = serde_json::Map::new();
    sources.insert("title".to_string(), json!("Extracted by Scrapling/Trafilatura from article title"));
    sources.insert("content".to_string(), json!(format!(
        "Clean main content extracted via collector (mode: {}, HTTP: {})",
        fetch_mode.as_deref().unwrap_or("unknown"),
        http_status.map(|s| s.to_string()).unwrap_or_else(|| "unknown".to_string())
    )));
    sources.insert("language".to_string(), json!("Detected by Language Detection library (langdetect)"));
    sources.insert("location_name".to_string(), json!("Matched from geographic database (locations table) based on place name mentions in text"));
    sources.insert("symptoms".to_string(), json!("Identified via symptom keyword matching from NLP Keywords database ('symptom' category)"));
    sources.insert("disease_extracted".to_string(), json!("Identified via disease keyword matching from NLP Keywords database ('disease' category)"));
    sources.insert("disease_classification".to_string(), json!("Classified by XLM-RoBERTa AI model using zero-shot classification with disease labels from NLP Labels database"));
    sources.insert("case_count".to_string(), json!("Extracted using regex patterns: numeric count followed by terms like 'cases', 'patients', or 'residents'"));
    sources.insert("death_count".to_string(), json!("Extracted using regex patterns: numeric count followed by terms like 'deaths' or 'fatalities'"));
    sources.insert("confidence".to_string(), json!("Confidence score from the AI classification model — higher indicates higher certainty"));
    sources.insert("outbreak_alert".to_string(), json!("Determined by comparing case count against the minimum threshold in Outbreak Rules database for the respective disease"));
    sources.insert("sentiment".to_string(), json!("Classified by XLM-RoBERTa AI model with sentiment labels: positive, negative, or neutral"));
    sources.insert("event_type".to_string(), json!("Classified by XLM-RoBERTa AI model with event type labels from NLP Labels database ('event_type' category)"));
    sources.insert("relevance_score".to_string(), json!("Classified by XLM-RoBERTa AI model whether text is health-related or not"));
    sources.insert("source_credibility".to_string(), json!("Credibility score based on source type from Source Credibility database. Type 'web' defaults to 0.50"));
    sources.insert("published_at".to_string(), json!("Extracted from article web metadata (og:published_time meta tag, JSON-LD, URL path, or article dateline)"));

    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "title": title,
            "content": content,
            "fetch_mode": fetch_mode,
            "http_status": http_status,
            "url": url,
            "published_at": published_date.map(|date| date.to_string()),
            "language": nlp.language,
            "location_name": nlp.location_name,
            "latitude": nlp.latitude,
            "longitude": nlp.longitude,
            "country": nlp.country,
            "translated": nlp.translated,
            "translation_provider": nlp.translation_provider,
            "translated_text": nlp.translated_text,
            "original_location_name": nlp.original_location_name,
            "symptoms": nlp.symptoms,
            "disease_extracted": nlp.disease_extracted,
            "disease_classification": nlp.disease_classification,
            "case_count": nlp.case_count,
            "death_count": nlp.death_count,
            "confidence": nlp.confidence,
            "outbreak_alert": nlp.outbreak_alert,
            "sentiment": nlp.sentiment,
            "sentiment_score": nlp.sentiment_score,
            "event_type": nlp.event_type,
            "event_confidence": nlp.event_confidence,
            "relevance_score": nlp.relevance_score,
            "relevance_confidence": nlp.relevance_confidence,
            "source_credibility": nlp.source_credibility,
            "source_credibility_label": nlp.source_credibility_label,
            "needs_review": nlp.needs_review,
            "locations": nlp.locations,
            "is_health_related": nlp.is_health_related,
            "raw_report_id": raw_id,
            "event_id": event_id,
            "sources": Value::Object(sources),
        }),
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
}

fn build_pagination(page: Option<i64>, per_page: Option<i64>) -> (i64, i64, i64) {
    let p = page.unwrap_or(1).max(1);
    let pp = per_page.unwrap_or(20).max(1).min(100);
    let offset = (p - 1) * pp;
    (p, pp, offset)
}

fn calc_total_pages(total: i64, per_page: i64) -> i64 {
    if total == 0 { 1 } else { (total as f64 / per_page as f64).ceil() as i64 }
}

async fn list_events(
    State(state): State<Arc<AppState>>,
    Query(query): Query<EventsQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);

    let sql = "SELECT e.id, e.source_type, e.source_name, e.published_at::text, e.language, e.location_name, loc.country,
                    e.disease_classification, e.case_count, e.death_count, e.confidence::float8 AS confidence, e.outbreak_alert,
                    ST_Y(e.geom) AS latitude, ST_X(e.geom) AS longitude, e.created_at::text,
                    e.sentiment, e.event_type, e.relevance_score,
                    e.source_credibility::float8 AS source_credibility, e.source_credibility_label, e.needs_review,
                    r.url, SUBSTRING(r.original_text FROM 1 FOR 200) AS title,
                    e.is_health_related
             FROM disease_events e
             LEFT JOIN raw_reports r ON r.id = e.raw_report_id
             LEFT JOIN LATERAL (
                 SELECT l.country
                 FROM locations l
                 WHERE l.is_active = TRUE
                   AND LOWER(l.name) = LOWER(e.location_name)
                 ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
                 LIMIT 1
             ) loc ON TRUE
             WHERE ($1::text IS NULL OR e.disease_classification ILIKE '%'||$1||'%'
                 OR e.location_name ILIKE '%'||$1||'%'
                 OR e.source_name ILIKE '%'||$1||'%'
                 OR r.original_text ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR e.disease_classification = $2)
             AND ($3::text IS NULL OR e.source_type = $3)
              AND ($4::bool IS NULL OR e.outbreak_alert = $4)
              AND ($5::text IS NULL OR e.published_at::text >= $5)
              AND ($6::text IS NULL OR e.published_at::text <= $6)
              AND ($7::bool IS NULL OR e.is_health_related = $7)
              ORDER BY e.created_at DESC
              LIMIT $8 OFFSET $9";
     let rows = client
         .query(sql, &[&query.q, &query.disease, &query.source_type, &query.outbreak_alert, &query.date_from, &query.date_to, &query.is_health_related, &per_page, &offset])
        .await
        .map_err(internal_error)?;

    let data = rows
        .into_iter()
        .map(|r| json!({
            "id": r.get::<_, Uuid>(0),
            "source_type": r.get::<_, Option<String>>(1),
            "source_name": r.get::<_, Option<String>>(2),
            "published_at": r.get::<_, Option<String>>(3),
            "language": r.get::<_, Option<String>>(4),
            "location_name": r.get::<_, Option<String>>(5),
            "country": r.get::<_, Option<String>>(6),
            "disease_classification": r.get::<_, Option<String>>(7),
            "case_count": r.get::<_, Option<i32>>(8),
            "death_count": r.get::<_, Option<i32>>(9),
            "confidence": r.get::<_, Option<f64>>(10),
            "outbreak_alert": r.get::<_, Option<bool>>(11),
            "latitude": r.get::<_, Option<f64>>(12),
            "longitude": r.get::<_, Option<f64>>(13),
            "created_at": r.get::<_, Option<String>>(14),
            "sentiment": r.get::<_, Option<String>>(15),
            "event_type": r.get::<_, Option<String>>(16),
            "relevance_score": r.get::<_, Option<String>>(17),
            "source_credibility": r.get::<_, Option<f64>>(18),
            "source_credibility_label": r.get::<_, Option<String>>(19),
            "needs_review": r.get::<_, Option<bool>>(20),
            "url": r.get::<_, Option<String>>(21),
            "title": r.get::<_, Option<String>>(22),
            "is_health_related": r.get::<_, Option<bool>>(23),
        }))
        .collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM disease_events e
             LEFT JOIN raw_reports r ON r.id = e.raw_report_id
             WHERE ($1::text IS NULL OR e.disease_classification ILIKE '%'||$1||'%'
                 OR e.location_name ILIKE '%'||$1||'%'
                 OR e.source_name ILIKE '%'||$1||'%'
                 OR r.original_text ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR e.disease_classification = $2)
             AND ($3::text IS NULL OR e.source_type = $3)
              AND ($4::bool IS NULL OR e.outbreak_alert = $4)
              AND ($5::text IS NULL OR e.published_at::text >= $5)
              AND ($6::text IS NULL OR e.published_at::text <= $6)
              AND ($7::bool IS NULL OR e.is_health_related = $7)",
            &[&query.q, &query.disease, &query.source_type, &query.outbreak_alert, &query.date_from, &query.date_to, &query.is_health_related],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    Ok(Json(ApiResponse {
        success: true, data, total: Some(total), page: Some(page), per_page: Some(per_page), total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

async fn dashboard_stats(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;

    // 1. Per Penyakit
    let by_disease = client
        .query(
            "SELECT COALESCE(disease_classification, 'UNKNOWN') AS name, SUM(case_count) AS cases, SUM(death_count) AS deaths
             FROM disease_events WHERE is_health_related = TRUE
             GROUP BY disease_classification ORDER BY cases DESC LIMIT 10",
            &[],
        )
        .await
        .map_err(internal_error)?
        .iter()
        .map(|r| json!({"name": r.get::<_, String>(0), "cases": r.get::<_, i64>(1), "deaths": r.get::<_, i64>(2)}))
        .collect::<Vec<_>>();

    // 2. Per Lokasi
    let by_location = client
        .query(
            "SELECT COALESCE(location_name, 'Unknown') AS name, SUM(case_count) AS cases, COUNT(*) AS count
             FROM disease_events WHERE location_name IS NOT NULL AND is_health_related = TRUE
             GROUP BY location_name ORDER BY cases DESC LIMIT 10",
            &[],
        )
        .await
        .map_err(internal_error)?
        .iter()
        .map(|r| json!({"name": r.get::<_, String>(0), "cases": r.get::<_, i64>(1)}))
        .collect::<Vec<_>>();

    // 3. Per Sentimen
    let by_sentiment = client
        .query(
            "SELECT COALESCE(sentiment, 'unknown') AS sentiment, COUNT(*) AS count
             FROM disease_events WHERE sentiment IS NOT NULL
             GROUP BY sentiment ORDER BY count DESC",
            &[],
        )
        .await
        .map_err(internal_error)?
        .iter()
        .map(|r| json!({"name": r.get::<_, String>(0), "count": r.get::<_, i64>(1)}))
        .collect::<Vec<_>>();

    // 4. Per Relevansi
    let by_relevance = client
        .query(
            "SELECT COALESCE(relevance_score, 'unknown') AS relevance, COUNT(*) AS count
             FROM disease_events WHERE relevance_score IS NOT NULL
             GROUP BY relevance_score ORDER BY count DESC",
            &[],
        )
        .await
        .map_err(internal_error)?
        .iter()
        .map(|r| json!({"name": r.get::<_, String>(0), "count": r.get::<_, i64>(1)}))
        .collect::<Vec<_>>();

    // 5. Per Sumber
    let by_source = client
        .query(
            "SELECT COALESCE(source_type, 'unknown') AS source_type, SUM(case_count) AS cases, COUNT(*) AS count
             FROM disease_events WHERE source_type IS NOT NULL
             GROUP BY source_type ORDER BY cases DESC",
            &[],
        )
        .await
        .map_err(internal_error)?
        .iter()
        .map(|r| json!({"name": r.get::<_, String>(0), "cases": r.get::<_, i64>(1), "count": r.get::<_, i64>(2)}))
        .collect::<Vec<_>>();

    Ok(Json(json!({
        "success": true,
        "data": {
            "by_disease": by_disease,
            "by_location": by_location,
            "by_sentiment": by_sentiment,
            "by_relevance": by_relevance,
            "by_source": by_source,
        }
    })))
}

fn require_dashboard_token(
    state: &Arc<AppState>,
    headers: &axum::http::HeaderMap,
) -> Result<(), (StatusCode, Json<Value>)> {
    let supplied = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or("");

    if supplied.is_empty() || supplied != state.dashboard_api_token {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "success": false,
                "message": "Unauthorized",
                "data": null
            })),
        ));
    }

    Ok(())
}

fn change_percentage(current: i64, previous: i64) -> f64 {
    if previous == 0 {
        if current == 0 { 0.0 } else { 100.0 }
    } else {
        (((current - previous) as f64 / previous as f64) * 100.0 * 10.0).round() / 10.0
    }
}

fn compact_dashboard_item(value: &Value) -> Value {
    let field = |name: &str| value.get(name).cloned().unwrap_or(Value::Null);
    let event_id = value
        .get("detail")
        .and_then(|detail| detail.get("event_id"))
        .cloned()
        .unwrap_or(Value::Null);

    json!({
        "event_id": event_id,
        "location": field("location_name"),
        "disease": field("disease"),
        "country": field("country"),
        "latitude": field("latitude"),
        "longitude": field("longitude"),
        "cases": field("cases"),
        "deaths": field("deaths"),
        "event_count": field("event_count"),
        "confidence": field("confidence"),
        "threshold": field("threshold"),
        "severity": field("severity"),
        "has_alert": field("has_alert"),
        "latest_date": field("latest_date")
    })
}

async fn dashboard_summary(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<PublicDashboardQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    require_dashboard_token(&state, &headers)?;

    // Reuse the existing dashboard aggregation and EWS business rules.
    let Json(snapshot) = public_dashboard(State(state), Query(query)).await?;
    let source = snapshot.get("data").cloned().unwrap_or_else(|| json!({}));
    let trends = source.get("trends").cloned().unwrap_or_else(|| json!({}));
    let kpis = source.get("kpis").cloned().unwrap_or_else(|| json!({}));

    let trend = |name: &str| {
        let item = trends.get(name).cloned().unwrap_or_else(|| json!({}));
        let current = item.get("current").and_then(Value::as_i64).unwrap_or(0);
        let previous = item.get("previous").and_then(Value::as_i64).unwrap_or(0);
        json!({
            "current": current,
            "previous": previous,
            "percentage_change": change_percentage(current, previous)
        })
    };

    let alerts = source
        .get("alerts")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(compact_dashboard_item).collect::<Vec<_>>())
        .unwrap_or_default();
    let locations = source
        .get("locations")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(compact_dashboard_item).collect::<Vec<_>>())
        .unwrap_or_default();
    let cases_by_disease = source
        .get("by_disease")
        .and_then(Value::as_array)
        .map(|items| {
            items.iter().map(|item| json!({
                "disease": item.get("name").cloned().unwrap_or(Value::Null),
                "cases": item.get("cases").cloned().unwrap_or(Value::Null),
                "deaths": item.get("deaths").cloned().unwrap_or(Value::Null),
                "events": item.get("events").cloned().unwrap_or(Value::Null)
            })).collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let country_distribution = source
        .get("by_country")
        .and_then(Value::as_array)
        .map(|items| {
            items.iter().map(|item| json!({
                "country": item.get("name").cloned().unwrap_or(Value::Null),
                "cases": item.get("cases").cloned().unwrap_or(Value::Null)
            })).collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let data = json!({
        "updated_at": source.get("updated_at").cloned().unwrap_or(Value::Null),
        "filters": {
            "country": source.get("filters").and_then(|v| v.get("country")).cloned().unwrap_or(Value::Null),
            "year": source.get("filters").and_then(|v| v.get("year")).cloned().unwrap_or(Value::Null),
            "available_years": source.get("available_years").cloned().unwrap_or_else(|| json!([]))
        },
        "summary_cards": {
            "detected_cases": trend("cases"),
            "deaths": trend("deaths"),
            "validated_events": trend("events"),
            "locations": trend("locations"),
            "active_alerts": trend("alerts")
        },
        "year_totals": kpis,
        "early_warning_system": { "alerts": alerts },
        "cases_by_disease": cases_by_disease,
        "country_distribution": country_distribution,
        "location_summary": locations,
        "ai_summary": source.get("ai_summary").cloned().unwrap_or_else(|| json!({}))
    });

    Ok(Json(json!({
        "success": true,
        "message": "Success",
        "data": data
    })))
}

/// Public, read-only snapshot used by the landing page and command-center TV.
/// Only validated health events with a known disease are exposed. Aggregation is
/// intentionally done once here so every dashboard widget shows the same totals.
async fn public_dashboard(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PublicDashboardQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let selected_year = query.year.unwrap_or_else(|| chrono::Utc::now().year());
    let selected_country = query.country.filter(|value| !value.trim().is_empty() && value != "all");
    let selected_source = query.source
        .filter(|value| matches!(value.trim().to_lowercase().as_str(), "ibs" | "ebs" | "skdr"))
        .map(|value| value.trim().to_lowercase());

    let available_years = if let Some(ref src) = selected_source {
        client.query(
            "SELECT DISTINCT EXTRACT(YEAR FROM published_at)::int AS year
             FROM disease_events
             WHERE published_at IS NOT NULL
              AND (is_health_related = TRUE OR LOWER(COALESCE(source_type, '')) IN ('skdr', 'skdr_api'))
               AND disease_classification IS NOT NULL
               AND UPPER(disease_classification) <> 'UNKNOWN'
               AND UPPER(disease_classification) NOT LIKE 'NEGATIVE%'
                AND (COALESCE(confidence, 0) >= 0.15 OR LOWER(COALESCE(source_type, '')) IN ('skdr', 'skdr_api'))
                AND (EXISTS (
                  SELECT 1 FROM skdr_reports sr
                  WHERE sr.raw_report_id = disease_events.raw_report_id
                    AND ($1::text = 'skdr' OR sr.endpoint_name = $1::text)
                ) OR ($1::text = 'skdr' AND LOWER(COALESCE(disease_events.source_type, '')) IN ('skdr', 'skdr_api')))
             ORDER BY year DESC",
            &[src],
        ).await.map_err(internal_error)?
    } else {
        client.query(
            "SELECT DISTINCT EXTRACT(YEAR FROM published_at)::int AS year
             FROM disease_events
             WHERE published_at IS NOT NULL
              AND (is_health_related = TRUE OR LOWER(COALESCE(source_type, '')) IN ('skdr', 'skdr_api'))
               AND disease_classification IS NOT NULL
               AND UPPER(disease_classification) <> 'UNKNOWN'
               AND UPPER(disease_classification) NOT LIKE 'NEGATIVE%'
                AND (COALESCE(confidence, 0) >= 0.15 OR LOWER(COALESCE(source_type, '')) IN ('skdr', 'skdr_api'))
             ORDER BY year DESC",
            &[],
        ).await.map_err(internal_error)?
    }.into_iter().map(|row| row.get::<_, i32>(0)).collect::<Vec<_>>();

    let rows = if let Some(ref src) = selected_source {
        client.query(
            "SELECT COALESCE(e.location_name, 'Unknown') AS location_name,
                    e.disease_classification,
                    CASE WHEN LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia' ELSE COALESCE(CASE WHEN LOWER(e.location_name) IN ('sudan','south sudan') THEN 'OUTSIDE ASEAN' ELSE l.country END, CASE
                        WHEN LOWER(e.location_name) IN ('brunei','brunei darussalam') THEN 'Brunei'
                        WHEN LOWER(e.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                          THEN INITCAP(LOWER(e.location_name))
                        ELSE 'OUTSIDE ASEAN' END) END AS country,
                    COALESCE(ST_Y(ST_Centroid(ST_Collect(e.geom))), l.latitude) AS latitude,
                    COALESCE(ST_X(ST_Centroid(ST_Collect(e.geom))), l.longitude) AS longitude,
                    SUM(GREATEST(COALESCE(e.case_count, 0), 0)) AS cases,
                    SUM(GREATEST(COALESCE(e.death_count, 0), 0)) AS deaths,
                    COUNT(*) AS event_count,
                    MAX(e.confidence::float8) AS confidence,
                    BOOL_OR(COALESCE(e.outbreak_alert, FALSE)) AS model_alert,
                    COALESCE(MAX(r.min_case_count), 1) AS threshold,
                    MAX(e.published_at)::text AS latest_date,
                    (JSONB_AGG(JSONB_BUILD_OBJECT(
                      'event_id', e.id::text, 'raw_report_id', e.raw_report_id::text,
                      'url', e.report_url, 'content', e.original_text, 'language', e.language,
                      'source_type', e.source_type, 'source_name', e.source_name,
                      'published_at', e.published_at::text, 'symptoms', e.symptoms,
                      'disease_extracted', e.disease_extracted, 'sentiment', e.sentiment,
                      'event_type', e.event_type, 'event_confidence', e.event_confidence,
                      'relevance_score', e.relevance_score, 'relevance_confidence', e.relevance_confidence,
                      'source_credibility', e.source_credibility,
                      'source_credibility_label', e.source_credibility_label,
                      'needs_review', e.needs_review, 'is_health_related', e.is_health_related,
                      'outbreak_alert', e.outbreak_alert
                    ) ORDER BY e.published_at DESC, e.confidence DESC)->0) AS detail
                FROM (
                  SELECT e0.*, rr.url AS report_url,
                         ROW_NUMBER() OVER (
                           PARTITION BY COALESCE(NULLIF(rr.url, ''), e0.raw_report_id::text, e0.id::text)
                           ORDER BY e0.confidence DESC NULLS LAST, e0.created_at DESC
                         ) AS dedup_rank
                  FROM disease_events e0
                  LEFT JOIN raw_reports rr ON rr.id = e0.raw_report_id
                   WHERE (e0.is_health_related = TRUE OR LOWER(COALESCE(e0.source_type, '')) IN ('skdr', 'skdr_api'))
                    AND e0.disease_classification IS NOT NULL
                    AND UPPER(e0.disease_classification) <> 'UNKNOWN'
                    AND UPPER(e0.disease_classification) NOT LIKE 'NEGATIVE%'
                     AND (e0.confidence >= 0.15 OR LOWER(COALESCE(e0.source_type, '')) IN ('skdr', 'skdr_api'))
                    AND e0.published_at IS NOT NULL
                    AND e0.published_at >= make_date($1, 1, 1)
                    AND e0.published_at < make_date($1 + 1, 1, 1)
                    AND (EXISTS (
                      SELECT 1 FROM skdr_reports sr
                      WHERE sr.raw_report_id = e0.raw_report_id
                        AND ($3::text = 'skdr' OR sr.endpoint_name = $3::text)
                    ) OR ($3::text = 'skdr' AND LOWER(COALESCE(e0.source_type, '')) IN ('skdr', 'skdr_api')))
                ) e
             LEFT JOIN LATERAL (
               SELECT l0.* FROM locations l0
               WHERE LOWER(l0.name) = LOWER(e.location_name) AND l0.is_active = TRUE
               ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
               LIMIT 1
             ) l ON TRUE
             LEFT JOIN disease_outbreak_rules r
               ON LOWER(r.disease_name) = LOWER(e.disease_classification) AND r.is_active = TRUE
              WHERE (e.is_health_related = TRUE OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
               AND e.disease_classification IS NOT NULL
               AND UPPER(e.disease_classification) <> 'UNKNOWN'
               AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
                 AND (e.confidence >= 0.15 OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
               AND e.dedup_rank = 1
               AND e.published_at IS NOT NULL
                AND e.published_at >= make_date($1, 1, 1)
                AND e.published_at < make_date($1 + 1, 1, 1)
                AND ($2::text IS NULL OR LOWER(CASE WHEN LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia' ELSE COALESCE(CASE WHEN LOWER(e.location_name) IN ('sudan','south sudan') THEN 'OUTSIDE ASEAN' ELSE l.country END, CASE
                  WHEN LOWER(e.location_name) IN ('brunei','brunei darussalam') THEN 'Brunei'
                  WHEN LOWER(e.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                    THEN INITCAP(LOWER(e.location_name)) ELSE 'OUTSIDE ASEAN' END) END) = LOWER($2))
             GROUP BY COALESCE(e.location_name, 'Unknown'), e.disease_classification,
                       CASE WHEN LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia' ELSE COALESCE(CASE WHEN LOWER(e.location_name) IN ('sudan','south sudan') THEN 'OUTSIDE ASEAN' ELSE l.country END, CASE
                         WHEN LOWER(e.location_name) IN ('brunei','brunei darussalam') THEN 'Brunei'
                         WHEN LOWER(e.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                           THEN INITCAP(LOWER(e.location_name))
                         ELSE 'OUTSIDE ASEAN' END) END, l.latitude, l.longitude
             ORDER BY cases DESC, latest_date DESC
             LIMIT 100",
            &[&selected_year, &selected_country, src],
        ).await.map_err(internal_error)?
    } else {
        client.query(
            "SELECT COALESCE(e.location_name, 'Unknown') AS location_name,
                    e.disease_classification,
                    CASE WHEN LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia' ELSE COALESCE(CASE WHEN LOWER(e.location_name) IN ('sudan','south sudan') THEN 'OUTSIDE ASEAN' ELSE l.country END, CASE
                        WHEN LOWER(e.location_name) IN ('brunei','brunei darussalam') THEN 'Brunei'
                        WHEN LOWER(e.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                          THEN INITCAP(LOWER(e.location_name))
                        ELSE 'OUTSIDE ASEAN' END) END AS country,
                    COALESCE(ST_Y(ST_Centroid(ST_Collect(e.geom))), l.latitude) AS latitude,
                    COALESCE(ST_X(ST_Centroid(ST_Collect(e.geom))), l.longitude) AS longitude,
                    SUM(GREATEST(COALESCE(e.case_count, 0), 0)) AS cases,
                    SUM(GREATEST(COALESCE(e.death_count, 0), 0)) AS deaths,
                    COUNT(*) AS event_count,
                    MAX(e.confidence::float8) AS confidence,
                    BOOL_OR(COALESCE(e.outbreak_alert, FALSE)) AS model_alert,
                    COALESCE(MAX(r.min_case_count), 1) AS threshold,
                    MAX(e.published_at)::text AS latest_date,
                    (JSONB_AGG(JSONB_BUILD_OBJECT(
                      'event_id', e.id::text, 'raw_report_id', e.raw_report_id::text,
                      'url', e.report_url, 'content', e.original_text, 'language', e.language,
                      'source_type', e.source_type, 'source_name', e.source_name,
                      'published_at', e.published_at::text, 'symptoms', e.symptoms,
                      'disease_extracted', e.disease_extracted, 'sentiment', e.sentiment,
                      'event_type', e.event_type, 'event_confidence', e.event_confidence,
                      'relevance_score', e.relevance_score, 'relevance_confidence', e.relevance_confidence,
                      'source_credibility', e.source_credibility,
                      'source_credibility_label', e.source_credibility_label,
                      'needs_review', e.needs_review, 'is_health_related', e.is_health_related,
                      'outbreak_alert', e.outbreak_alert
                    ) ORDER BY e.published_at DESC, e.confidence DESC)->0) AS detail
                FROM (
                  SELECT e0.*, rr.url AS report_url,
                         ROW_NUMBER() OVER (
                           PARTITION BY COALESCE(NULLIF(rr.url, ''), e0.raw_report_id::text, e0.id::text)
                           ORDER BY e0.confidence DESC NULLS LAST, e0.created_at DESC
                         ) AS dedup_rank
                  FROM disease_events e0
                  LEFT JOIN raw_reports rr ON rr.id = e0.raw_report_id
                   WHERE (e0.is_health_related = TRUE OR LOWER(COALESCE(e0.source_type, '')) IN ('skdr', 'skdr_api'))
                    AND e0.disease_classification IS NOT NULL
                    AND UPPER(e0.disease_classification) <> 'UNKNOWN'
                    AND UPPER(e0.disease_classification) NOT LIKE 'NEGATIVE%'
                     AND (e0.confidence >= 0.15 OR LOWER(COALESCE(e0.source_type, '')) IN ('skdr', 'skdr_api'))
                    AND e0.published_at IS NOT NULL
                    AND e0.published_at >= make_date($1, 1, 1)
                    AND e0.published_at < make_date($1 + 1, 1, 1)
                ) e
             LEFT JOIN LATERAL (
               SELECT l0.* FROM locations l0
               WHERE LOWER(l0.name) = LOWER(e.location_name) AND l0.is_active = TRUE
               ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
               LIMIT 1
             ) l ON TRUE
             LEFT JOIN disease_outbreak_rules r
               ON LOWER(r.disease_name) = LOWER(e.disease_classification) AND r.is_active = TRUE
              WHERE (e.is_health_related = TRUE OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
               AND e.disease_classification IS NOT NULL
               AND UPPER(e.disease_classification) <> 'UNKNOWN'
               AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
                 AND (e.confidence >= 0.15 OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
               AND e.dedup_rank = 1
               AND e.published_at IS NOT NULL
                AND e.published_at >= make_date($1, 1, 1)
                AND e.published_at < make_date($1 + 1, 1, 1)
                AND ($2::text IS NULL OR LOWER(CASE WHEN LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia' ELSE COALESCE(CASE WHEN LOWER(e.location_name) IN ('sudan','south sudan') THEN 'OUTSIDE ASEAN' ELSE l.country END, CASE
                  WHEN LOWER(e.location_name) IN ('brunei','brunei darussalam') THEN 'Brunei'
                  WHEN LOWER(e.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                    THEN INITCAP(LOWER(e.location_name)) ELSE 'OUTSIDE ASEAN' END) END) = LOWER($2))
             GROUP BY COALESCE(e.location_name, 'Unknown'), e.disease_classification,
                       CASE WHEN LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia' ELSE COALESCE(CASE WHEN LOWER(e.location_name) IN ('sudan','south sudan') THEN 'OUTSIDE ASEAN' ELSE l.country END, CASE
                         WHEN LOWER(e.location_name) IN ('brunei','brunei darussalam') THEN 'Brunei'
                         WHEN LOWER(e.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                           THEN INITCAP(LOWER(e.location_name))
                         ELSE 'OUTSIDE ASEAN' END) END, l.latitude, l.longitude
             ORDER BY cases DESC, latest_date DESC
             LIMIT 100",
            &[&selected_year, &selected_country],
        ).await.map_err(internal_error)?
    };

    let trend_row = if let Some(ref src) = selected_source {
        client.query_one(
            "WITH ranked AS (
               SELECT e.*, rr.url AS report_url,
                      ROW_NUMBER() OVER (
                        PARTITION BY COALESCE(NULLIF(rr.url, ''), e.raw_report_id::text, e.id::text)
                        ORDER BY e.confidence DESC NULLS LAST, e.created_at DESC
                      ) AS dedup_rank
               FROM disease_events e
               LEFT JOIN raw_reports rr ON rr.id = e.raw_report_id
               WHERE (e.is_health_related = TRUE OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
                 AND e.disease_classification IS NOT NULL
                 AND UPPER(e.disease_classification) <> 'UNKNOWN'
                 AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
                   AND (e.confidence >= 0.15 OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
                 AND e.published_at IS NOT NULL
                 AND e.published_at >= make_date($1, 1, 1)
                 AND e.published_at < make_date($1 + 1, 1, 1)
                  AND (EXISTS (
                    SELECT 1 FROM skdr_reports sr
                    WHERE sr.raw_report_id = e.raw_report_id
                      AND ($3::text = 'skdr' OR sr.endpoint_name = $3::text)
                  ) OR ($3::text = 'skdr' AND LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api')))
             ), valid AS (
               SELECT ranked.*, l.latitude AS resolved_latitude, l.longitude AS resolved_longitude,
                       CASE WHEN LOWER(COALESCE(ranked.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia' ELSE COALESCE(CASE WHEN LOWER(ranked.location_name) IN ('sudan','south sudan') THEN 'OUTSIDE ASEAN' ELSE l.country END, CASE
                  WHEN LOWER(ranked.location_name) IN ('brunei','brunei darussalam') THEN 'Brunei'
                  WHEN LOWER(ranked.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                   THEN INITCAP(LOWER(ranked.location_name)) ELSE 'OUTSIDE ASEAN' END) END AS resolved_country
               FROM ranked
               LEFT JOIN LATERAL (
                 SELECT l0.* FROM locations l0
                 WHERE LOWER(l0.name) = LOWER(ranked.location_name) AND l0.is_active = TRUE
                 ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
                 LIMIT 1
               ) l ON TRUE
               WHERE ranked.dedup_rank = 1
             ), bounds AS (
              SELECT CASE WHEN $1 = EXTRACT(YEAR FROM CURRENT_DATE)::int
                       THEN date_trunc('month', CURRENT_DATE)::date
                       ELSE make_date($1, 12, 1) END AS current_start,
                     CASE WHEN $1 = EXTRACT(YEAR FROM CURRENT_DATE)::int
                       THEN (date_trunc('month', CURRENT_DATE) - interval '1 month')::date
                       ELSE make_date($1, 11, 1) END AS previous_start
            )
            SELECT
              COALESCE(SUM(GREATEST(COALESCE(case_count,0),0)) FILTER (WHERE published_at>=b.current_start),0)::bigint,
              COALESCE(SUM(GREATEST(COALESCE(case_count,0),0)) FILTER (WHERE published_at>=b.previous_start AND published_at<b.current_start),0)::bigint,
              COALESCE(SUM(GREATEST(COALESCE(death_count,0),0)) FILTER (WHERE published_at>=b.current_start),0)::bigint,
              COALESCE(SUM(GREATEST(COALESCE(death_count,0),0)) FILTER (WHERE published_at>=b.previous_start AND published_at<b.current_start),0)::bigint,
              COUNT(*) FILTER (WHERE published_at>=b.current_start)::bigint,
              COUNT(*) FILTER (WHERE published_at>=b.previous_start AND published_at<b.current_start)::bigint,
              COUNT(DISTINCT location_name) FILTER (WHERE published_at>=b.current_start)::bigint,
              COUNT(DISTINCT location_name) FILTER (WHERE published_at>=b.previous_start AND published_at<b.current_start)::bigint,
               COUNT(*) FILTER (WHERE published_at>=b.current_start AND outbreak_alert=TRUE AND COALESCE(confidence,0)>=0.35 AND NULLIF(TRIM(location_name),'') IS NOT NULL AND resolved_latitude IS NOT NULL AND resolved_longitude IS NOT NULL)::bigint,
               COUNT(*) FILTER (WHERE published_at>=b.previous_start AND published_at<b.current_start AND outbreak_alert=TRUE AND COALESCE(confidence,0)>=0.35 AND NULLIF(TRIM(location_name),'') IS NOT NULL AND resolved_latitude IS NOT NULL AND resolved_longitude IS NOT NULL)::bigint,
              TO_CHAR(b.current_start,'YYYY-MM'), TO_CHAR(b.previous_start,'YYYY-MM')
             FROM bounds b
             LEFT JOIN valid ON ($2::text IS NULL OR LOWER(valid.resolved_country) = LOWER($2))
            GROUP BY b.current_start,b.previous_start",
           &[&selected_year, &selected_country, src],
       ).await.map_err(internal_error)?
    } else {
        client.query_one(
            "WITH ranked AS (
               SELECT e.*, rr.url AS report_url,
                      ROW_NUMBER() OVER (
                        PARTITION BY COALESCE(NULLIF(rr.url, ''), e.raw_report_id::text, e.id::text)
                        ORDER BY e.confidence DESC NULLS LAST, e.created_at DESC
                      ) AS dedup_rank
               FROM disease_events e
               LEFT JOIN raw_reports rr ON rr.id = e.raw_report_id
               WHERE (e.is_health_related = TRUE OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
                 AND e.disease_classification IS NOT NULL
                 AND UPPER(e.disease_classification) <> 'UNKNOWN'
                 AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
                   AND (e.confidence >= 0.15 OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
                 AND e.published_at IS NOT NULL
                 AND e.published_at >= make_date($1, 1, 1)
                 AND e.published_at < make_date($1 + 1, 1, 1)
             ), valid AS (
               SELECT ranked.*, l.latitude AS resolved_latitude, l.longitude AS resolved_longitude,
                       CASE WHEN LOWER(COALESCE(ranked.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia' ELSE COALESCE(CASE WHEN LOWER(ranked.location_name) IN ('sudan','south sudan') THEN 'OUTSIDE ASEAN' ELSE l.country END, CASE
                  WHEN LOWER(ranked.location_name) IN ('brunei','brunei darussalam') THEN 'Brunei'
                  WHEN LOWER(ranked.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                   THEN INITCAP(LOWER(ranked.location_name)) ELSE 'OUTSIDE ASEAN' END) END AS resolved_country
               FROM ranked
               LEFT JOIN LATERAL (
                 SELECT l0.* FROM locations l0
                 WHERE LOWER(l0.name) = LOWER(ranked.location_name) AND l0.is_active = TRUE
                 ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
                 LIMIT 1
               ) l ON TRUE
               WHERE ranked.dedup_rank = 1
             ), bounds AS (
              SELECT CASE WHEN $1 = EXTRACT(YEAR FROM CURRENT_DATE)::int
                       THEN date_trunc('month', CURRENT_DATE)::date
                       ELSE make_date($1, 12, 1) END AS current_start,
                     CASE WHEN $1 = EXTRACT(YEAR FROM CURRENT_DATE)::int
                       THEN (date_trunc('month', CURRENT_DATE) - interval '1 month')::date
                       ELSE make_date($1, 11, 1) END AS previous_start
            )
            SELECT
              COALESCE(SUM(GREATEST(COALESCE(case_count,0),0)) FILTER (WHERE published_at>=b.current_start),0)::bigint,
              COALESCE(SUM(GREATEST(COALESCE(case_count,0),0)) FILTER (WHERE published_at>=b.previous_start AND published_at<b.current_start),0)::bigint,
              COALESCE(SUM(GREATEST(COALESCE(death_count,0),0)) FILTER (WHERE published_at>=b.current_start),0)::bigint,
              COALESCE(SUM(GREATEST(COALESCE(death_count,0),0)) FILTER (WHERE published_at>=b.previous_start AND published_at<b.current_start),0)::bigint,
              COUNT(*) FILTER (WHERE published_at>=b.current_start)::bigint,
              COUNT(*) FILTER (WHERE published_at>=b.previous_start AND published_at<b.current_start)::bigint,
              COUNT(DISTINCT location_name) FILTER (WHERE published_at>=b.current_start)::bigint,
              COUNT(DISTINCT location_name) FILTER (WHERE published_at>=b.previous_start AND published_at<b.current_start)::bigint,
               COUNT(*) FILTER (WHERE published_at>=b.current_start AND outbreak_alert=TRUE AND COALESCE(confidence,0)>=0.35 AND NULLIF(TRIM(location_name),'') IS NOT NULL AND resolved_latitude IS NOT NULL AND resolved_longitude IS NOT NULL)::bigint,
               COUNT(*) FILTER (WHERE published_at>=b.previous_start AND published_at<b.current_start AND outbreak_alert=TRUE AND COALESCE(confidence,0)>=0.35 AND NULLIF(TRIM(location_name),'') IS NOT NULL AND resolved_latitude IS NOT NULL AND resolved_longitude IS NOT NULL)::bigint,
              TO_CHAR(b.current_start,'YYYY-MM'), TO_CHAR(b.previous_start,'YYYY-MM')
             FROM bounds b
             LEFT JOIN valid ON ($2::text IS NULL OR LOWER(valid.resolved_country) = LOWER($2))
            GROUP BY b.current_start,b.previous_start",
           &[&selected_year, &selected_country],
       ).await.map_err(internal_error)?
    };

    let trends = json!({
        "current_month": trend_row.get::<_, Option<String>>(10).unwrap_or_default(),
        "previous_month": trend_row.get::<_, Option<String>>(11).unwrap_or_default(),
        "cases": {"current": trend_row.get::<_, i64>(0), "previous": trend_row.get::<_, i64>(1)},
        "deaths": {"current": trend_row.get::<_, i64>(2), "previous": trend_row.get::<_, i64>(3)},
        "events": {"current": trend_row.get::<_, i64>(4), "previous": trend_row.get::<_, i64>(5)},
        "locations": {"current": trend_row.get::<_, i64>(6), "previous": trend_row.get::<_, i64>(7)},
        "alerts": {"current": trend_row.get::<_, i64>(8), "previous": trend_row.get::<_, i64>(9)}
    });

    let weekly_trend = if selected_source.is_some() {
        client.query(
            "SELECT COALESCE(sr.epidemiological_week, EXTRACT(WEEK FROM e.published_at)::int) AS epidemiological_week,
                    COALESCE(SUM(GREATEST(COALESCE(e.case_count, 0), 0)), 0)::bigint AS cases,
                    COALESCE(SUM(GREATEST(COALESCE(e.death_count, 0), 0)), 0)::bigint AS deaths,
                    COUNT(*)::bigint AS events
             FROM disease_events e
             LEFT JOIN skdr_reports sr ON sr.raw_report_id = e.raw_report_id
             LEFT JOIN LATERAL (
               SELECT l0.* FROM locations l0
               WHERE LOWER(l0.name) = LOWER(e.location_name) AND l0.is_active = TRUE
               ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
               LIMIT 1
             ) l ON TRUE
             WHERE (e.is_health_related = TRUE OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
               AND e.disease_classification IS NOT NULL
               AND UPPER(e.disease_classification) <> 'UNKNOWN'
               AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
               AND (e.confidence >= 0.15 OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
               AND e.published_at IS NOT NULL
               AND e.published_at >= make_date($1, 1, 1)
               AND e.published_at < make_date($1 + 1, 1, 1)
                AND (($3::text = 'skdr' AND (sr.id IS NOT NULL OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api')))
                     OR ($3::text IN ('ibs', 'ebs') AND LOWER(COALESCE(sr.endpoint_name, '')) = $3::text))
                AND ($2::text IS NULL OR LOWER(CASE WHEN LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia' ELSE COALESCE(CASE WHEN LOWER(e.location_name) IN ('sudan','south sudan') THEN 'OUTSIDE ASEAN' ELSE l.country END, CASE
                  WHEN LOWER(e.location_name) IN ('brunei','brunei darussalam') THEN 'Brunei'
                  WHEN LOWER(e.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                    THEN INITCAP(LOWER(e.location_name)) ELSE 'OUTSIDE ASEAN' END) END) = LOWER($2))
             GROUP BY COALESCE(sr.epidemiological_week, EXTRACT(WEEK FROM e.published_at)::int)
             ORDER BY epidemiological_week",
            &[&selected_year, &selected_country, &selected_source],
        ).await.map_err(internal_error)?
        .into_iter()
        .map(|row| json!({
            "week": row.get::<_, i32>(0),
            "cases": row.get::<_, i64>(1),
            "deaths": row.get::<_, i64>(2),
            "events": row.get::<_, i64>(3),
        }))
        .collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    let mut locations = Vec::new();
    let mut alerts = Vec::new();
    let mut disease_totals = std::collections::HashMap::<String, (i64, i64, i64)>::new();
    let mut country_totals = std::collections::HashMap::<String, i64>::new();
    let mut location_keys = std::collections::HashSet::<String>::new();
    let mut total_cases = 0i64;
    let mut total_deaths = 0i64;
    let mut total_events = 0i64;

    for row in rows {
        let location: String = row.get(0);
        let disease: String = row.get(1);
        let country: String = row.get(2);
        let latitude: Option<f64> = row.get(3);
        let longitude: Option<f64> = row.get(4);
        let cases: i64 = row.get(5);
        let deaths: i64 = row.get(6);
        let event_count: i64 = row.get(7);
        let confidence: Option<f64> = row.get(8);
        let model_alert: bool = row.get(9);
        let threshold: i32 = row.get(10);
        let latest_date: String = row.get::<_, Option<String>>(11).unwrap_or_default();
        let detail: Value = row.get::<_, Option<Value>>(12).unwrap_or(Value::Null);
        let threshold_i64 = i64::from(threshold.max(1));
        let ratio = cases as f64 / threshold_i64 as f64;
        // A threshold alone is not an outbreak signal. Require the NLP event
        // to be explicitly marked as an outbreak before EWS can escalate it.
        let candidate_severity = if !model_alert { "NORMAL" }
            else if cases >= threshold_i64 * 2 || deaths > 0 { "AWAS" }
            else if cases >= threshold_i64 || model_alert { "SIAGA" }
            else if ratio >= 0.75 { "WASPADA" }
            else { "NORMAL" };
        let ews_verified = confidence.unwrap_or(0.0) >= 0.35
            && !location.trim().is_empty()
            && latitude.is_some()
            && longitude.is_some();
        let severity = if ews_verified { candidate_severity } else { "NORMAL" };
        let is_alert = severity != "NORMAL";

        total_cases += cases;
        total_deaths += deaths;
        total_events += event_count;
        location_keys.insert(location.trim().to_lowercase());
        let entry = disease_totals.entry(disease.clone()).or_insert((0, 0, 0));
        entry.0 += cases; entry.1 += deaths; entry.2 += event_count;
        *country_totals.entry(country.clone()).or_insert(0) += cases;

        let item = json!({
            "location_name": location, "disease": disease, "country": country,
            "latitude": latitude, "longitude": longitude, "cases": cases,
            "deaths": deaths, "event_count": event_count, "confidence": confidence,
            "threshold": threshold_i64, "severity": severity, "has_alert": is_alert,
            "latest_date": latest_date, "detail": detail
        });
        if is_alert { alerts.push(item.clone()); }
        locations.push(item);
    }

    alerts.sort_by(|a, b| {
        let rank = |v: &Value| match v["severity"].as_str().unwrap_or("NORMAL") {
            "AWAS" => 3, "SIAGA" => 2, "WASPADA" => 1, _ => 0
        };
        rank(b).cmp(&rank(a)).then_with(|| b["cases"].as_i64().cmp(&a["cases"].as_i64()))
    });
    let mut by_disease: Vec<Value> = disease_totals.into_iter().map(|(name, v)|
        json!({"name": name, "cases": v.0, "deaths": v.1, "events": v.2})
    ).collect();
    by_disease.sort_by(|a, b| b["cases"].as_i64().cmp(&a["cases"].as_i64()));
    let mut by_country: Vec<Value> = country_totals.into_iter().map(|(name, cases)|
        json!({"name": name, "cases": cases})
    ).collect();
    by_country.sort_by(|a, b| b["cases"].as_i64().cmp(&a["cases"].as_i64()));

    let active_alerts = alerts.len();
    let top_alert = alerts.first();
    let summary_text = match top_alert {
        Some(a) => format!(
            "There are {} active alert(s). Current priority is {} in {} with {} cases and status {}. Verify source and coordinate local epidemiological response.",
            active_alerts, a["disease"].as_str().unwrap_or("disease"),
            a["location_name"].as_str().unwrap_or("detected location"),
            a["cases"].as_i64().unwrap_or(0), a["severity"].as_str().unwrap_or("SIAGA")
        ),
        None => "No active outbreak alerts from validated data. ASEAN regional monitoring remains active.".to_string(),
    };

    Ok(Json(json!({"success": true, "data": {
         "updated_at": chrono::Utc::now().to_rfc3339(),
         "available_years": available_years,
         "filters": {"country": selected_country, "year": selected_year, "source": selected_source},
         "kpis": {"cases": total_cases, "deaths": total_deaths, "events": total_events,
                  "locations": location_keys.len(), "active_alerts": active_alerts},
         "alerts": alerts, "locations": locations, "by_disease": by_disease, "trends": trends,
         "weekly_trend": weekly_trend,
         "by_country": by_country,
         "ai_summary": {"text": summary_text, "provider": "local-rule-engine", "cached": true}
    }})))
}

async fn list_skdr_reports(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let endpoint = params.get("endpoint").cloned().filter(|v| !v.trim().is_empty());
    let limit: i64 = params.get("limit").and_then(|v| v.parse().ok()).unwrap_or(100);

    let rows = if let Some(ref ep) = endpoint {
        client.query(
            "SELECT id::text, endpoint_name, external_key, report_year, epidemiological_week,
                    report_date::text, payload, fetched_at::text, created_at::text
             FROM skdr_reports
             WHERE LOWER(endpoint_name) = LOWER($1)
             ORDER BY report_date DESC NULLS LAST, created_at DESC
             LIMIT $2",
            &[ep, &limit],
        ).await.map_err(internal_error)?
    } else {
        client.query(
            "SELECT id::text, endpoint_name, external_key, report_year, epidemiological_week,
                    report_date::text, payload, fetched_at::text, created_at::text
             FROM skdr_reports
             ORDER BY report_date DESC NULLS LAST, created_at DESC
             LIMIT $1",
            &[&limit],
        ).await.map_err(internal_error)?
    };

    let data: Vec<Value> = rows.iter().map(|r| {
        json!({
            "id": r.get::<_, String>(0),
            "endpoint_name": r.get::<_, String>(1),
            "external_key": r.get::<_, Option<String>>(2),
            "report_year": r.get::<_, i32>(3),
            "epidemiological_week": r.get::<_, Option<i32>>(4),
            "report_date": r.get::<_, Option<String>>(5),
            "payload": r.get::<_, Value>(6),
            "fetched_at": r.get::<_, Option<String>>(7),
            "created_at": r.get::<_, Option<String>>(8),
        })
    }).collect();

    let total = data.len() as i64;
    Ok(Json(ApiResponse {
        success: true,
        data,
        total: Some(total),
        page: Some(1),
        per_page: Some(limit),
        total_pages: Some(1),
    }))
}

async fn summary(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SummaryQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);

    let rows = client
        .query(
            "SELECT COALESCE(location_name, 'Unknown') AS location_name,
                    disease_classification,
                    SUM(case_count) AS total_cases,
                    SUM(death_count) AS total_deaths,
                    MAX(confidence::float8) AS max_confidence,
                    BOOL_OR(outbreak_alert) AS has_alert,
                    NULL::jsonb AS centroid_geojson
             FROM disease_events
             WHERE ($1::text IS NULL OR disease_classification ILIKE '%'||$1||'%'
                 OR location_name ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR disease_classification = $2)
             GROUP BY COALESCE(location_name, 'Unknown'), disease_classification
             ORDER BY total_cases DESC
             LIMIT $3 OFFSET $4",
            &[&query.q, &query.disease, &per_page, &offset],
        )
        .await
        .map_err(internal_error)?;

    let data = rows
        .into_iter()
        .map(|r| json!({
            "location_name": r.get::<_, Option<String>>(0),
            "disease_classification": r.get::<_, Option<String>>(1),
            "total_cases": r.get::<_, Option<i64>>(2),
            "total_deaths": r.get::<_, Option<i64>>(3),
            "max_confidence": r.get::<_, Option<f64>>(4),
            "has_alert": r.get::<_, Option<bool>>(5),
            "centroid_geojson": r.get::<_, Option<Value>>(6),
        }))
        .collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM (SELECT 1 FROM disease_events
             WHERE ($1::text IS NULL OR disease_classification ILIKE '%'||$1||'%'
                 OR location_name ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR disease_classification = $2)
             GROUP BY COALESCE(location_name, 'Unknown'), disease_classification) sub",
            &[&query.q, &query.disease],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    Ok(Json(ApiResponse {
        success: true, data, total: Some(total), page: Some(page), per_page: Some(per_page), total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

async fn list_sources(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SourcesQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);

    let rows = client
        .query(
            "SELECT s.id, s.name, s.source_type, s.config, s.schedule, s.enabled, s.created_at::text, s.updated_at::text,
                    json_build_object(
                        'status', lr.status,
                        'records_found', lr.records_found,
                        'records_ingested', lr.records_ingested,
                        'started_at', lr.started_at::text,
                        'finished_at', lr.finished_at::text
                    ) AS last_run,
                    COALESCE(sc.score, 0.50) AS source_credibility
             FROM collector_sources s
             LEFT JOIN LATERAL (
                 SELECT status, records_found, records_ingested, started_at, finished_at
                 FROM collector_runs
                 WHERE source_id = s.id
                 ORDER BY started_at DESC LIMIT 1
             ) lr ON TRUE
             LEFT JOIN source_credibility sc ON sc.source_type = s.source_type AND sc.is_active = TRUE
             WHERE ($1::text IS NULL OR s.name ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR s.source_type = $2)
             AND ($3::bool IS NULL OR s.enabled = $3)
             ORDER BY s.created_at DESC
             LIMIT $4 OFFSET $5",
            &[&query.q, &query.source_type, &query.enabled, &per_page, &offset],
        )
        .await
        .map_err(internal_error)?;

    let data = rows
        .into_iter()
        .map(|r| {
            let last_run_raw: Option<Value> = r.get(8);
            let last_run = last_run_raw.and_then(|v| {
                if v.is_null() { None } else { Some(v) }
            });
            json!({
                "id": r.get::<_, Uuid>(0),
                "name": r.get::<_, String>(1),
                "source_type": r.get::<_, String>(2),
                "config": r.get::<_, Value>(3),
                "schedule": r.get::<_, Option<String>>(4),
                "enabled": r.get::<_, bool>(5),
                "created_at": r.get::<_, Option<String>>(6),
                "updated_at": r.get::<_, Option<String>>(7),
                "last_run": last_run,
                "source_credibility": r.get::<_, Option<f64>>(9),
            })
        })
        .collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM collector_sources s
             WHERE ($1::text IS NULL OR s.name ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR s.source_type = $2)
             AND ($3::bool IS NULL OR s.enabled = $3)",
            &[&query.q, &query.source_type, &query.enabled],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    Ok(Json(ApiResponse {
        success: true, data, total: Some(total), page: Some(page), per_page: Some(per_page), total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

// ─── CREATE / UPDATE / DELETE SOURCE ──────────────────

async fn create_source(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateSourceRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO collector_sources (name, source_type, config, schedule)
             VALUES ($1, $2, $3, $4) RETURNING id, name, source_type, config, schedule, enabled, created_at::text, updated_at::text",
            &[&payload.name, &payload.source_type, &payload.config, &payload.schedule],
        )
        .await
        .map_err(internal_error)?;

    let data = json!({
        "id": row.get::<_, Uuid>(0),
        "name": row.get::<_, String>(1),
        "source_type": row.get::<_, String>(2),
        "config": row.get::<_, Value>(3),
        "schedule": row.get::<_, Option<String>>(4),
        "enabled": row.get::<_, bool>(5),
        "created_at": row.get::<_, Option<String>>(6),
        "updated_at": row.get::<_, Option<String>>(7),
    });

    Ok(Json(ApiResponse { success: true, data, total: None, page: None, per_page: None, total_pages: None }))
}

async fn get_source(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "SELECT s.id, s.name, s.source_type, s.config, s.schedule, s.enabled, s.created_at::text, s.updated_at::text,
                    COALESCE(sc.score, 0.50) AS source_credibility
             FROM collector_sources s
             LEFT JOIN source_credibility sc ON sc.source_type = s.source_type AND sc.is_active = TRUE
             WHERE s.id = $1",
            &[&id],
        )
        .await
        .map_err(|e| {
            tracing::error!("{:?}", e);
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": "Source not found" })),
            )
        })?;

    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "id": row.get::<_, Uuid>(0),
            "name": row.get::<_, String>(1),
            "source_type": row.get::<_, String>(2),
            "config": row.get::<_, Value>(3),
            "schedule": row.get::<_, Option<String>>(4),
            "enabled": row.get::<_, bool>(5),
            "created_at": row.get::<_, Option<String>>(6),
            "updated_at": row.get::<_, Option<String>>(7),
            "source_credibility": row.get::<_, Option<f64>>(8),
        }),
        total: None, page: None, per_page: None, total_pages: None,
    }))
}

async fn update_source(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateSourceRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let existing = {
        let client = state.db.get().await.map_err(internal_error)?;
        let row = client
            .query_one(
                "SELECT id, name, source_type, config, schedule, enabled FROM collector_sources WHERE id = $1",
                &[&id],
            )
            .await
            .map_err(|_| {
                (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "success": false, "error": "Source not found" })),
                )
            })?;
        let e: Value = json!({
            "name": row.get::<_, String>(1),
            "source_type": row.get::<_, String>(2),
            "config": row.get::<_, Value>(3),
            "schedule": row.get::<_, Option<String>>(4),
            "enabled": row.get::<_, bool>(5),
        });
        e
    };

    let name = payload.name.unwrap_or_else(|| existing["name"].as_str().unwrap_or("").to_string());
    let source_type = payload.source_type.unwrap_or_else(|| existing["source_type"].as_str().unwrap_or("").to_string());
    let config = payload.config.unwrap_or_else(|| existing["config"].clone());
    let schedule = payload.schedule.or_else(|| existing["schedule"].as_str().map(|s| s.to_string()));
    let enabled = payload.enabled.unwrap_or_else(|| existing["enabled"].as_bool().unwrap_or(true));

    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "UPDATE collector_sources SET name=$1, source_type=$2, config=$3, schedule=$4, enabled=$5, updated_at=NOW()
             WHERE id=$6 RETURNING id, name, source_type, config, schedule, enabled, created_at::text, updated_at::text",
            &[&name, &source_type, &config, &schedule, &enabled, &id],
        )
        .await
        .map_err(internal_error)?;

    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "id": row.get::<_, Uuid>(0),
            "name": row.get::<_, String>(1),
            "source_type": row.get::<_, String>(2),
            "config": row.get::<_, Value>(3),
            "schedule": row.get::<_, Option<String>>(4),
            "enabled": row.get::<_, bool>(5),
            "created_at": row.get::<_, Option<String>>(6),
            "updated_at": row.get::<_, Option<String>>(7),
        }),
        total: None, page: None, per_page: None, total_pages: None,
    }))
}

async fn delete_source(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let rows = client
        .execute("DELETE FROM collector_sources WHERE id = $1", &[&id])
        .await
        .map_err(internal_error)?;

    if rows == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "success": false, "error": "Source not found" })),
        ));
    }

    Ok(Json(ApiResponse {
        success: true,
        data: "deleted".to_string(),
        total: None, page: None, per_page: None, total_pages: None,
    }))
}

async fn trigger_collect_all(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let url = format!("{}/collect/all", state.collector_url.trim_end_matches('/'));
    let resp = state.http.post(&url).send().await.map_err(internal_error)?;
    let body: Value = resp.json().await.map_err(internal_error)?;
    Ok(Json(ApiResponse {
        success: true,
        data: body,
        total: None, page: None, per_page: None, total_pages: None,
    }))
}

async fn trigger_collect(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let url = format!("{}/collect/{}", state.collector_url.trim_end_matches('/'), id);
    let resp = state
        .http
        .post(&url)
        .send()
        .await
        .map_err(internal_error)?;
    let body: Value = resp.json().await.map_err(internal_error)?;
    Ok(Json(ApiResponse {
        success: body.get("success").and_then(|v| v.as_bool()).unwrap_or(false),
        data: body,
        total: None, page: None, per_page: None, total_pages: None,
    }))
}

async fn list_runs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<RunsQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);

    let rows = client
        .query(
            "SELECT id, source_id, status, records_found, records_ingested, error_message, started_at::text, finished_at::text
             FROM collector_runs
             WHERE ($1::uuid IS NULL OR source_id = $1)
             AND ($2::text IS NULL OR status = $2)
             ORDER BY started_at DESC
             LIMIT $3 OFFSET $4",
            &[&query.source_id, &query.status, &per_page, &offset],
        )
        .await
        .map_err(internal_error)?;

    let data = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.get::<_, Uuid>(0),
                "source_id": r.get::<_, Uuid>(1),
                "status": r.get::<_, String>(2),
                "records_found": r.get::<_, i32>(3),
                "records_ingested": r.get::<_, i32>(4),
                "error_message": r.get::<_, Option<String>>(5),
                "started_at": r.get::<_, Option<String>>(6),
                "finished_at": r.get::<_, Option<String>>(7),
            })
        })
        .collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM collector_runs
             WHERE ($1::uuid IS NULL OR source_id = $1)
             AND ($2::text IS NULL OR status = $2)",
            &[&query.source_id, &query.status],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    Ok(Json(ApiResponse {
        success: true, data, total: Some(total), page: Some(page), per_page: Some(per_page), total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

// ─── AUTH ──────────────────────────────────────────


macro_rules! hash_password {
    ($pw:expr) => {{
        let mut hasher = Sha256::new();
        hasher.update($pw.as_bytes());
        hex::encode(hasher.finalize())
    }};
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_opt(
            "SELECT id, password_hash, role FROM users WHERE username = $1 AND is_active = TRUE",
            &[&payload.username],
        )
        .await
        .map_err(internal_error)?;

    let (user_id, stored_hash, role) = match row {
        Some(r) => (
            r.get::<_, Uuid>(0),
            r.get::<_, String>(1),
            r.get::<_, String>(2),
        ),
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({"success": false, "error": "Invalid credentials"})),
            ))
        }
    };

    if hash_password!(&payload.password) != stored_hash {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"success": false, "error": "Invalid credentials"})),
        ));
    }

    let token = Uuid::new_v4().to_string();
    client
        .execute(
            "INSERT INTO auth_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')",
            &[&user_id, &token],
        )
        .await
        .map_err(internal_error)?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "token": token,
            "user_id": user_id,
            "username": payload.username,
            "role": role,
        }
    })))
}

async fn logout(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");

    if !token.is_empty() {
        let client = state.db.get().await.map_err(internal_error)?;
        let _ = client
            .execute("DELETE FROM auth_tokens WHERE token = $1", &[&token])
            .await;
    }

    Ok(Json(json!({"success": true, "data": "logged_out"})))
}

// ─── USERS ──────────────────────────────────────────

async fn list_users(
    State(state): State<Arc<AppState>>,
    Query(query): Query<UsersQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);

    let rows = client
        .query(
            "SELECT id, username, display_name, role, email, is_active, created_at::text FROM users
             WHERE ($1::text IS NULL OR username ILIKE '%'||$1||'%' OR display_name ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR role = $2)
             AND ($3::bool IS NULL OR is_active = $3)
             ORDER BY created_at DESC
             LIMIT $4 OFFSET $5",
            &[&query.q, &query.role, &query.is_active, &per_page, &offset],
        )
        .await
        .map_err(internal_error)?;

    let data: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<_, Uuid>(0),
        "username": r.get::<_, String>(1),
        "display_name": r.get::<_, Option<String>>(2),
        "role": r.get::<_, String>(3),
        "email": r.get::<_, Option<String>>(4),
        "is_active": r.get::<_, bool>(5),
        "created_at": r.get::<_, Option<String>>(6),
    })).collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM users
             WHERE ($1::text IS NULL OR username ILIKE '%'||$1||'%' OR display_name ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR role = $2)
             AND ($3::bool IS NULL OR is_active = $3)",
            &[&query.q, &query.role, &query.is_active],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    Ok(Json(ApiResponse {
        success: true, data, total: Some(total), page: Some(page), per_page: Some(per_page), total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

async fn create_user(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateUserRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let hash = hash_password!(&payload.password);

    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO users (username, password_hash, display_name, role, email) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, display_name, role, email, is_active, created_at::text",
            &[&payload.username, &hash, &payload.display_name, &payload.role, &payload.email],
        )
        .await
        .map_err(|e| {
            tracing::error!("{:?}", e);
            (StatusCode::CONFLICT, Json(json!({"success": false, "error": "Username already exists"})))
        })?;

    Ok(Json(json!({"success": true, "data": {
        "id": row.get::<_, Uuid>(0),
        "username": row.get::<_, String>(1),
        "display_name": row.get::<_, Option<String>>(2),
        "role": row.get::<_, Option<String>>(3),
        "email": row.get::<_, Option<String>>(4),
        "is_active": row.get::<_, bool>(5),
        "created_at": row.get::<_, Option<String>>(6),
    }})))
}

async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_opt("SELECT id, username, display_name, role, email, is_active, created_at::text FROM users WHERE id = $1", &[&id])
        .await
        .map_err(internal_error)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "User not found"}))))?;

    Ok(Json(json!({"success": true, "data": {
        "id": row.get::<_, Uuid>(0),
        "username": row.get::<_, String>(1),
        "display_name": row.get::<_, Option<String>>(2),
        "role": row.get::<_, String>(3),
        "email": row.get::<_, Option<String>>(4),
        "is_active": row.get::<_, bool>(5),
        "created_at": row.get::<_, Option<String>>(6),
    }})))
}

async fn update_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateUserRequest>,
) -> Json<Value> {
    let client = match state.db.get().await {
        Ok(c) => c,
        Err(e) => return Json(json!({"success": false, "error": format!("DB: {}", e)})),
    };

    let hash = payload.password.map(|pw| hash_password!(&pw));

    let result = client
        .query_one(
            "UPDATE users SET
                password_hash = COALESCE($1, password_hash),
                display_name = COALESCE($2, display_name),
                role = COALESCE($3, role),
                email = COALESCE($4, email),
                is_active = COALESCE($5, is_active),
                updated_at = NOW()
             WHERE id = $6
             RETURNING id, username, display_name, role, email, is_active, created_at::text",
            &[&hash, &payload.display_name, &payload.role, &payload.email, &payload.is_active, &id],
        )
        .await;

    match result {
        Ok(row) => Json(json!({"success": true, "data": {
            "id": row.get::<_, Uuid>(0),
            "username": row.get::<_, String>(1),
            "display_name": row.get::<_, Option<String>>(2),
            "role": row.get::<_, String>(3),
            "email": row.get::<_, Option<String>>(4),
            "is_active": row.get::<_, bool>(5),
            "created_at": row.get::<_, Option<String>>(6),
        }})),
        Err(e) => Json(json!({"success": false, "error": format!("Update failed: {}", e)})),
    }
}

async fn delete_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    client.execute("DELETE FROM users WHERE id = $1", &[&id]).await.map_err(|e| {
        tracing::error!("{:?}", e);
        (StatusCode::CONFLICT, Json(json!({"success": false, "error": "Cannot delete user"})))
    })?;

    Ok(Json(json!({"success": true, "data": "deleted"})))
}

// ─── OUTBREAK RULES ─────────────────────────────────

async fn list_rules(
    State(state): State<Arc<AppState>>,
    Query(query): Query<RulesQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);

    let rows = client
        .query(
            "SELECT id, disease_name, display_label, min_case_count, is_active, priority, created_at::text, updated_at::text
             FROM disease_outbreak_rules
             WHERE ($1::text IS NULL OR disease_name ILIKE '%'||$1||'%' OR display_label ILIKE '%'||$1||'%')
             AND ($2::bool IS NULL OR is_active = $2)
             ORDER BY priority
             LIMIT $3 OFFSET $4",
            &[&query.q, &query.is_active, &per_page, &offset],
        )
        .await
        .map_err(internal_error)?;

    let data: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<_, Uuid>(0),
        "disease_name": r.get::<_, String>(1),
        "display_label": r.get::<_, Option<String>>(2),
        "min_case_count": r.get::<_, i32>(3),
        "is_active": r.get::<_, bool>(4),
        "priority": r.get::<_, i32>(5),
        "created_at": r.get::<_, Option<String>>(6),
        "updated_at": r.get::<_, Option<String>>(7),
    })).collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM disease_outbreak_rules
             WHERE ($1::text IS NULL OR disease_name ILIKE '%'||$1||'%' OR display_label ILIKE '%'||$1||'%')
             AND ($2::bool IS NULL OR is_active = $2)",
            &[&query.q, &query.is_active],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    Ok(Json(ApiResponse {
        success: true, data, total: Some(total), page: Some(page), per_page: Some(per_page), total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

async fn create_rule(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateRuleRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO disease_outbreak_rules (disease_name, display_label, min_case_count, is_active, priority)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, disease_name, display_label, min_case_count, is_active, priority, created_at::text",
            &[&payload.disease_name, &payload.display_label, &payload.min_case_count, &payload.is_active, &payload.priority],
        )
        .await
        .map_err(|e| {
            tracing::error!("{:?}", e);
            (StatusCode::CONFLICT, Json(json!({"success": false, "error": "Rule already exists"})))
        })?;

    Ok(Json(json!({"success": true, "data": {
        "id": row.get::<_, Uuid>(0),
        "disease_name": row.get::<_, String>(1),
        "display_label": row.get::<_, Option<String>>(2),
        "min_case_count": row.get::<_, i32>(3),
        "is_active": row.get::<_, bool>(4),
        "priority": row.get::<_, i32>(5),
        "created_at": row.get::<_, Option<String>>(6),
    }})))
}

async fn get_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_opt(
            "SELECT id, disease_name, display_label, min_case_count, is_active, priority, created_at::text FROM disease_outbreak_rules WHERE id = $1",
            &[&id],
        )
        .await
        .map_err(internal_error)?
        .ok_or_else(|| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Rule not found"}))))?;

    Ok(Json(json!({"success": true, "data": {
        "id": row.get::<_, Uuid>(0),
        "disease_name": row.get::<_, String>(1),
        "display_label": row.get::<_, Option<String>>(2),
        "min_case_count": row.get::<_, i32>(3),
        "is_active": row.get::<_, bool>(4),
        "priority": row.get::<_, i32>(5),
        "created_at": row.get::<_, Option<String>>(6),
    }})))
}

async fn update_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateRuleRequest>,
) -> Json<Value> {
    let client = match state.db.get().await {
        Ok(c) => c,
        Err(e) => return Json(json!({"success": false, "error": format!("DB: {}", e)})),
    };

    let row = match client
        .query_one(
            "UPDATE disease_outbreak_rules SET
                disease_name = COALESCE($1, disease_name),
                display_label = COALESCE($2, display_label),
                min_case_count = COALESCE($3, min_case_count),
                is_active = COALESCE($4, is_active),
                priority = COALESCE($5, priority),
                updated_at = NOW()
             WHERE id = $6
             RETURNING id, disease_name, display_label, min_case_count, is_active, priority, created_at::text, updated_at::text",
            &[&payload.disease_name, &payload.display_label, &payload.min_case_count, &payload.is_active, &payload.priority, &id],
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return Json(json!({"success": false, "error": "Rule not found or update failed"})),
    };

    Json(json!({"success": true, "data": {
        "id": row.get::<_, Uuid>(0),
        "disease_name": row.get::<_, String>(1),
        "display_label": row.get::<_, Option<String>>(2),
        "min_case_count": row.get::<_, i32>(3),
        "is_active": row.get::<_, bool>(4),
        "priority": row.get::<_, i32>(5),
        "created_at": row.get::<_, Option<String>>(6),
        "updated_at": row.get::<_, Option<String>>(7),
    }}))
}

async fn delete_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    client.execute("DELETE FROM disease_outbreak_rules WHERE id = $1", &[&id]).await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Rule not found"}))))?;

    Ok(Json(json!({"success": true, "data": "deleted"})))
}

// ─── NLP LABELS ─────────────────────────────────

async fn list_labels(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LabelQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);

    let sql = "SELECT id, category, label, is_active, priority, created_at::text
               FROM nlp_labels
               WHERE ($1::text IS NULL OR category = $1)
               AND ($2::text IS NULL OR label ILIKE '%'||$2||'%')
               AND ($3::bool IS NULL OR is_active = $3)
               ORDER BY category, priority
               LIMIT $4 OFFSET $5";
    let rows = client.query(sql, &[&query.category, &query.q, &query.is_active, &per_page, &offset]).await.map_err(internal_error)?;

    let data: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<_, Uuid>(0),
        "category": r.get::<_, String>(1),
        "label": r.get::<_, String>(2),
        "is_active": r.get::<_, bool>(3),
        "priority": r.get::<_, i32>(4),
        "created_at": r.get::<_, Option<String>>(5),
    })).collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM nlp_labels
             WHERE ($1::text IS NULL OR category = $1)
             AND ($2::text IS NULL OR label ILIKE '%'||$2||'%')
             AND ($3::bool IS NULL OR is_active = $3)",
            &[&query.category, &query.q, &query.is_active],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    Ok(Json(ApiResponse {
        success: true, data, total: Some(total), page: Some(page), per_page: Some(per_page), total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

async fn create_label(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateLabelRequest>,
) -> Json<Value> {
    let client = match state.db.get().await {
        Ok(c) => c,
        Err(_) => return Json(json!({"success": false, "error": "DB error"})),
    };
    let row = client
        .query_one(
            "INSERT INTO nlp_labels (category, label, priority, is_active) VALUES ($1, $2, $3, $4) RETURNING id, category, label, is_active, priority, created_at::text",
            &[&payload.category, &payload.label, &payload.priority, &payload.is_active],
        )
        .await
        .map_err(|e| {
            tracing::error!("{:?}", e);
            Json(json!({"success": false, "error": "Label exists or insert failed"}))
        });
    match row {
        Ok(r) => Json(json!({"success": true, "data": {
            "id": r.get::<_, Uuid>(0), "category": r.get::<_, String>(1),
            "label": r.get::<_, String>(2), "is_active": r.get::<_, bool>(3),
            "priority": r.get::<_, i32>(4), "created_at": r.get::<_, Option<String>>(5),
        }})),
        Err(j) => j,
    }
}

async fn update_label(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateLabelRequest>,
) -> Json<Value> {
    let client = match state.db.get().await {
        Ok(c) => c,
        Err(_) => return Json(json!({"success": false, "error": "DB error"})),
    };
    let row = client
        .query_one(
            "UPDATE nlp_labels SET label=COALESCE($1,label), priority=COALESCE($2,priority), is_active=COALESCE($3,is_active), updated_at=NOW() WHERE id=$4 RETURNING id, category, label, is_active, priority, created_at::text",
            &[&payload.label, &payload.priority, &payload.is_active, &id],
        )
        .await
        .map_err(|_| Json(json!({"success": false, "error": "Update failed"})));
    match row {
        Ok(r) => Json(json!({"success": true, "data": {
            "id": r.get::<_, Uuid>(0), "category": r.get::<_, String>(1),
            "label": r.get::<_, String>(2), "is_active": r.get::<_, bool>(3),
            "priority": r.get::<_, i32>(4), "created_at": r.get::<_, Option<String>>(5),
        }})),
        Err(j) => j,
    }
}

async fn delete_label(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Json<Value> {
    let client = match state.db.get().await {
        Ok(c) => c,
        Err(_) => return Json(json!({"success": false, "error": "DB error"})),
    };
    client.execute("DELETE FROM nlp_labels WHERE id = $1", &[&id]).await.unwrap_or_default();
    Json(json!({"success": true, "data": "deleted"}))
}

// ─── NLP KEYWORDS ─────────────────────────────────

async fn list_keywords(
    State(state): State<Arc<AppState>>,
    Query(query): Query<KeywordQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);

    let sql = "SELECT id, category, keyword, target_label, is_active, priority, created_at::text FROM nlp_keywords
               WHERE ($1::text IS NULL OR category = $1)
               AND ($2::text IS NULL OR keyword ILIKE '%'||$2||'%' OR target_label ILIKE '%'||$2||'%')
               AND ($3::bool IS NULL OR is_active = $3)
               ORDER BY category, priority
               LIMIT $4 OFFSET $5";
    let rows = client.query(sql, &[&query.category, &query.q, &query.is_active, &per_page, &offset]).await.map_err(internal_error)?;

    let data: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<_, Uuid>(0),
        "category": r.get::<_, String>(1),
        "keyword": r.get::<_, String>(2),
        "target_label": r.get::<_, String>(3),
        "is_active": r.get::<_, bool>(4),
        "priority": r.get::<_, i32>(5),
        "created_at": r.get::<_, Option<String>>(6),
    })).collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM nlp_keywords
             WHERE ($1::text IS NULL OR category = $1)
             AND ($2::text IS NULL OR keyword ILIKE '%'||$2||'%' OR target_label ILIKE '%'||$2||'%')
             AND ($3::bool IS NULL OR is_active = $3)",
            &[&query.category, &query.q, &query.is_active],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    Ok(Json(ApiResponse {
        success: true, data, total: Some(total), page: Some(page), per_page: Some(per_page), total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

async fn create_keyword(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateKeywordRequest>,
) -> Json<Value> {
    let client = match state.db.get().await {
        Ok(c) => c,
        Err(_) => return Json(json!({"success": false, "error": "DB error"})),
    };
    let result = client
        .query_one(
            "INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id, category, keyword, target_label, is_active, priority, created_at::text",
            &[&payload.category, &payload.keyword, &payload.target_label, &payload.priority, &payload.is_active],
        )
        .await;
    match result {
        Ok(r) => Json(json!({"success": true, "data": {
            "id": r.get::<_, Uuid>(0), "category": r.get::<_, String>(1),
            "keyword": r.get::<_, String>(2), "target_label": r.get::<_, String>(3),
            "is_active": r.get::<_, bool>(4), "priority": r.get::<_, i32>(5),
            "created_at": r.get::<_, Option<String>>(6),
        }})),
        Err(_) => Json(json!({"success": false, "error": "Keyword exists"})),
    }
}

async fn update_keyword(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateKeywordRequest>,
) -> Json<Value> {
    let client = match state.db.get().await {
        Ok(c) => c,
        Err(_) => return Json(json!({"success": false, "error": "DB error"})),
    };
    let result = client
        .query_one(
            "UPDATE nlp_keywords SET keyword=COALESCE($1,keyword), target_label=COALESCE($2,target_label), priority=COALESCE($3,priority), is_active=COALESCE($4,is_active), updated_at=NOW() WHERE id=$5 RETURNING id, category, keyword, target_label, is_active, priority, created_at::text",
            &[&payload.keyword, &payload.target_label, &payload.priority, &payload.is_active, &id],
        )
        .await;
    match result {
        Ok(r) => Json(json!({"success": true, "data": {
            "id": r.get::<_, Uuid>(0), "category": r.get::<_, String>(1),
            "keyword": r.get::<_, String>(2), "target_label": r.get::<_, String>(3),
            "is_active": r.get::<_, bool>(4), "priority": r.get::<_, i32>(5),
            "created_at": r.get::<_, Option<String>>(6),
        }})),
        Err(_) => Json(json!({"success": false, "error": "Update failed"})),
    }
}

async fn delete_keyword(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Json<Value> {
    let client = match state.db.get().await {
        Ok(c) => c,
        Err(_) => return Json(json!({"success": false, "error": "DB error"})),
    };
    client.execute("DELETE FROM nlp_keywords WHERE id = $1", &[&id]).await.unwrap_or_default();
    Json(json!({"success": true, "data": "deleted"}))
}

// ─── DATA CLEANUP ─────────────────────────────────

async fn cleanup_events(
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let client = match state.db.get().await {
        Ok(c) => c,
        Err(_) => return Json(json!({"success": false, "error": "DB error"})),
    };
    let _ = client.execute("DELETE FROM disease_events", &[]).await;
    Json(json!({"success": true, "data": "events_cleaned"}))
}

// ─── LOCATIONS ──────────────────────────────────

async fn list_locations(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LocationsQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);

    let rows = client
        .query(
            "SELECT id, name, latitude, longitude, country, is_active, created_at::text, updated_at::text
             FROM locations
             WHERE ($1::text IS NULL OR name ILIKE '%'||$1||'%' OR country ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR country = $2)
             ORDER BY country, name
             LIMIT $3 OFFSET $4",
            &[&query.q, &query.country, &per_page, &offset],
        )
        .await
        .map_err(internal_error)?;

    let data: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<_, Uuid>(0),
        "name": r.get::<_, String>(1),
        "latitude": r.get::<_, f64>(2),
        "longitude": r.get::<_, f64>(3),
        "country": r.get::<_, Option<String>>(4),
        "is_active": r.get::<_, bool>(5),
        "created_at": r.get::<_, Option<String>>(6),
        "updated_at": r.get::<_, Option<String>>(7),
    })).collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM locations
             WHERE ($1::text IS NULL OR name ILIKE '%'||$1||'%' OR country ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR country = $2)",
            &[&query.q, &query.country],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    Ok(Json(ApiResponse { success: true, data, total: Some(total), page: Some(page), per_page: Some(per_page), total_pages: Some(calc_total_pages(total, per_page)) }))
}

async fn create_location(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateLocationRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO locations (name, latitude, longitude, country) VALUES ($1, $2, $3, $4) RETURNING id, name, latitude, longitude, country, is_active, created_at::text",
            &[&payload.name, &payload.latitude, &payload.longitude, &payload.country],
        )
        .await
        .map_err(|e| (StatusCode::CONFLICT, Json(json!({"success": false, "error": format!("Location exists: {}", e)}))))?;
    Ok(Json(ApiResponse { success: true, data: json!({
        "id": row.get::<_, Uuid>(0), "name": row.get::<_, String>(1),
        "latitude": row.get::<_, f64>(2), "longitude": row.get::<_, f64>(3),
        "country": row.get::<_, Option<String>>(4), "is_active": row.get::<_, bool>(5),
        "created_at": row.get::<_, Option<String>>(6),
    }), total: None, page: None, per_page: None, total_pages: None }))
}

async fn update_location(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateLocationRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "UPDATE locations SET name=COALESCE($1,name), latitude=COALESCE($2,latitude), longitude=COALESCE($3,longitude),
             country=COALESCE($4,country), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$6
             RETURNING id, name, latitude, longitude, country, is_active, created_at::text, updated_at::text",
            &[&payload.name, &payload.latitude, &payload.longitude, &payload.country, &payload.is_active, &id],
        )
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Location not found"}))))?;
    Ok(Json(ApiResponse { success: true, data: json!({
        "id": row.get::<_, Uuid>(0), "name": row.get::<_, String>(1),
        "latitude": row.get::<_, f64>(2), "longitude": row.get::<_, f64>(3),
        "country": row.get::<_, Option<String>>(4), "is_active": row.get::<_, bool>(5),
        "created_at": row.get::<_, Option<String>>(6), "updated_at": row.get::<_, Option<String>>(7),
    }), total: None, page: None, per_page: None, total_pages: None }))
}

async fn delete_location(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    client.execute("DELETE FROM locations WHERE id = $1", &[&id]).await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Location not found"}))))?;
    Ok(Json(ApiResponse { success: true, data: "deleted".to_string(), total: None, page: None, per_page: None, total_pages: None }))
}

// ─── SOURCE CREDIBILITY ──────────────────────────

async fn list_source_credibility(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let rows = client
        .query("SELECT id, source_type, score, is_active, created_at::text FROM source_credibility ORDER BY score DESC", &[])
        .await
        .map_err(internal_error)?;
    let data: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<_, Uuid>(0),
        "source_type": r.get::<_, String>(1),
        "score": r.get::<_, f64>(2),
        "is_active": r.get::<_, bool>(3),
        "created_at": r.get::<_, Option<String>>(4),
    })).collect();
    Ok(Json(ApiResponse { success: true, data, total: None, page: None, per_page: None, total_pages: None }))
}

async fn create_source_credibility(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateSourceCredibilityRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO source_credibility (source_type, score) VALUES ($1, $2) RETURNING id, source_type, score, is_active, created_at::text",
            &[&payload.source_type, &payload.score],
        )
        .await
        .map_err(|e| (StatusCode::CONFLICT, Json(json!({"success": false, "error": format!("Exists: {}", e)}))))?;
    Ok(Json(ApiResponse { success: true, data: json!({
        "id": row.get::<_, Uuid>(0), "source_type": row.get::<_, String>(1),
        "score": row.get::<_, f64>(2), "is_active": row.get::<_, bool>(3),
        "created_at": row.get::<_, Option<String>>(4),
    }), total: None, page: None, per_page: None, total_pages: None }))
}

async fn update_source_credibility(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateSourceCredibilityRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "UPDATE source_credibility SET source_type=COALESCE($1,source_type), score=COALESCE($2,score),
             is_active=COALESCE($3,is_active), updated_at=NOW() WHERE id=$4
             RETURNING id, source_type, score, is_active, created_at::text, updated_at::text",
            &[&payload.source_type, &payload.score, &payload.is_active, &id],
        )
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Not found"}))))?;
    Ok(Json(ApiResponse { success: true, data: json!({
        "id": row.get::<_, Uuid>(0), "source_type": row.get::<_, String>(1),
        "score": row.get::<_, f64>(2), "is_active": row.get::<_, bool>(3),
        "created_at": row.get::<_, Option<String>>(4), "updated_at": row.get::<_, Option<String>>(5),
    }), total: None, page: None, per_page: None, total_pages: None }))
}

async fn delete_source_credibility(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    client.execute("DELETE FROM source_credibility WHERE id = $1", &[&id]).await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Not found"}))))?;
    Ok(Json(ApiResponse { success: true, data: "deleted".to_string(), total: None, page: None, per_page: None, total_pages: None }))
}

// ─── LANGUAGE MARKERS ──────────────────────────

async fn list_language_markers(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let rows = client
        .query("SELECT id, word, language, is_active, created_at::text, updated_at::text FROM language_markers ORDER BY language, word", &[])
        .await
        .map_err(internal_error)?;
    let data: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<_, Uuid>(0),
        "word": r.get::<_, String>(1),
        "language": r.get::<_, String>(2),
        "is_active": r.get::<_, bool>(3),
        "created_at": r.get::<_, Option<String>>(4),
        "updated_at": r.get::<_, Option<String>>(5),
    })).collect();
    Ok(Json(ApiResponse { success: true, data, total: None, page: None, per_page: None, total_pages: None }))
}

async fn create_language_marker(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateLanguageMarkerRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO language_markers (word, language) VALUES ($1, $2) RETURNING id, word, language, is_active, created_at::text",
            &[&payload.word, &payload.language],
        )
        .await
        .map_err(|e| (StatusCode::CONFLICT, Json(json!({"success": false, "error": format!("Exists: {}", e)}))))?;
    Ok(Json(ApiResponse { success: true, data: json!({
        "id": row.get::<_, Uuid>(0), "word": row.get::<_, String>(1),
        "language": row.get::<_, String>(2), "is_active": row.get::<_, bool>(3),
        "created_at": row.get::<_, Option<String>>(4),
    }), total: None, page: None, per_page: None, total_pages: None }))
}

async fn update_language_marker(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateLanguageMarkerRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "UPDATE language_markers SET word=COALESCE($1,word), language=COALESCE($2,language),
             is_active=COALESCE($3,is_active), updated_at=NOW() WHERE id=$4
             RETURNING id, word, language, is_active, created_at::text, updated_at::text",
            &[&payload.word, &payload.language, &payload.is_active, &id],
        )
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Not found"}))))?;
    Ok(Json(ApiResponse { success: true, data: json!({
        "id": row.get::<_, Uuid>(0), "word": row.get::<_, String>(1),
        "language": row.get::<_, String>(2), "is_active": row.get::<_, bool>(3),
        "created_at": row.get::<_, Option<String>>(4), "updated_at": row.get::<_, Option<String>>(5),
    }), total: None, page: None, per_page: None, total_pages: None }))
}

async fn delete_language_marker(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    client.execute("DELETE FROM language_markers WHERE id = $1", &[&id]).await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Not found"}))))?;
    Ok(Json(ApiResponse { success: true, data: "deleted".to_string(), total: None, page: None, per_page: None, total_pages: None }))
}

// ─── EXTRACTION RULES ──────────────────────────

async fn list_extraction_rules(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let rows = client
        .query("SELECT id, field_name, regex_pattern, priority, is_active, created_at::text, updated_at::text FROM extraction_rules ORDER BY field_name, priority", &[])
        .await
        .map_err(internal_error)?;
    let data: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<_, Uuid>(0),
        "field_name": r.get::<_, String>(1),
        "regex_pattern": r.get::<_, String>(2),
        "priority": r.get::<_, i32>(3),
        "is_active": r.get::<_, bool>(4),
        "created_at": r.get::<_, Option<String>>(5),
        "updated_at": r.get::<_, Option<String>>(6),
    })).collect();
    Ok(Json(ApiResponse { success: true, data, total: None, page: None, per_page: None, total_pages: None }))
}

async fn create_extraction_rule(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateExtractionRuleRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO extraction_rules (field_name, regex_pattern, priority, is_active) VALUES ($1, $2, $3, $4) RETURNING id, field_name, regex_pattern, priority, is_active, created_at::text",
            &[&payload.field_name, &payload.regex_pattern, &payload.priority, &payload.is_active],
        )
        .await
        .map_err(|e| (StatusCode::CONFLICT, Json(json!({"success": false, "error": format!("Exists: {}", e)}))))?;
    Ok(Json(ApiResponse { success: true, data: json!({
        "id": row.get::<_, Uuid>(0), "field_name": row.get::<_, String>(1),
        "regex_pattern": row.get::<_, String>(2), "priority": row.get::<_, i32>(3),
        "is_active": row.get::<_, bool>(4), "created_at": row.get::<_, Option<String>>(5),
    }), total: None, page: None, per_page: None, total_pages: None }))
}

async fn update_extraction_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateExtractionRuleRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "UPDATE extraction_rules SET field_name=COALESCE($1,field_name), regex_pattern=COALESCE($2,regex_pattern),
             priority=COALESCE($3,priority), is_active=COALESCE($4,is_active), updated_at=NOW() WHERE id=$5
             RETURNING id, field_name, regex_pattern, priority, is_active, created_at::text, updated_at::text",
            &[&payload.field_name, &payload.regex_pattern, &payload.priority, &payload.is_active, &id],
        )
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Not found"}))))?;
    Ok(Json(ApiResponse { success: true, data: json!({
        "id": row.get::<_, Uuid>(0), "field_name": row.get::<_, String>(1),
        "regex_pattern": row.get::<_, String>(2), "priority": row.get::<_, i32>(3),
        "is_active": row.get::<_, bool>(4), "created_at": row.get::<_, Option<String>>(5),
        "updated_at": row.get::<_, Option<String>>(6),
    }), total: None, page: None, per_page: None, total_pages: None }))
}

async fn delete_extraction_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    client.execute("DELETE FROM extraction_rules WHERE id = $1", &[&id]).await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Not found"}))))?;
    Ok(Json(ApiResponse { success: true, data: "deleted".to_string(), total: None, page: None, per_page: None, total_pages: None }))
}

// ─── LANGUAGE MODELS ──────────────────────────

async fn list_language_models(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let rows = client
        .query("SELECT id, language, model_key, is_active, created_at::text, updated_at::text FROM language_models ORDER BY language", &[])
        .await
        .map_err(internal_error)?;
    let data: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<_, Uuid>(0),
        "language": r.get::<_, String>(1),
        "model_key": r.get::<_, String>(2),
        "is_active": r.get::<_, bool>(3),
        "created_at": r.get::<_, Option<String>>(4),
        "updated_at": r.get::<_, Option<String>>(5),
    })).collect();
    Ok(Json(ApiResponse { success: true, data, total: None, page: None, per_page: None, total_pages: None }))
}

async fn create_language_model(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateLanguageModelRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO language_models (language, model_key) VALUES ($1, $2) RETURNING id, language, model_key, is_active, created_at::text",
            &[&payload.language, &payload.model_key],
        )
        .await
        .map_err(|e| (StatusCode::CONFLICT, Json(json!({"success": false, "error": format!("Exists: {}", e)}))))?;
    Ok(Json(ApiResponse { success: true, data: json!({
        "id": row.get::<_, Uuid>(0), "language": row.get::<_, String>(1),
        "model_key": row.get::<_, String>(2), "is_active": row.get::<_, bool>(3),
        "created_at": row.get::<_, Option<String>>(4),
    }), total: None, page: None, per_page: None, total_pages: None }))
}

async fn update_language_model(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateLanguageModelRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "UPDATE language_models SET language=COALESCE($1,language), model_key=COALESCE($2,model_key),
             is_active=COALESCE($3,is_active), updated_at=NOW() WHERE id=$4
             RETURNING id, language, model_key, is_active, created_at::text, updated_at::text",
            &[&payload.language, &payload.model_key, &payload.is_active, &id],
        )
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Not found"}))))?;
    Ok(Json(ApiResponse { success: true, data: json!({
        "id": row.get::<_, Uuid>(0), "language": row.get::<_, String>(1),
        "model_key": row.get::<_, String>(2), "is_active": row.get::<_, bool>(3),
        "created_at": row.get::<_, Option<String>>(4), "updated_at": row.get::<_, Option<String>>(5),
    }), total: None, page: None, per_page: None, total_pages: None }))
}

async fn delete_language_model(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    client.execute("DELETE FROM language_models WHERE id = $1", &[&id]).await
        .map_err(|_| (StatusCode::NOT_FOUND, Json(json!({"success": false, "error": "Not found"}))))?;
    Ok(Json(ApiResponse { success: true, data: "deleted".to_string(), total: None, page: None, per_page: None, total_pages: None }))
}

fn parse_date(input: Option<&str>) -> Option<NaiveDate> {
    input.and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
}

fn internal_error<E: std::fmt::Debug + std::fmt::Display>(err: E) -> (StatusCode, Json<Value>) {
    let debug_msg = format!("{err:?}");
    let display_msg = err.to_string();
    tracing::error!("{debug_msg}");
    let error_text = if display_msg == "db error" || display_msg.is_empty() {
        debug_msg
    } else {
        display_msg
    };
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "success": false, "error": error_text })),
    )
}

async fn run_init_sql(pool: &Pool, dir: &str) -> anyhow::Result<()> {
    tracing::info!("Running init SQL from {dir}");
    let client = pool.get().await?;
    client.batch_execute(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        DO $$
        BEGIN
            ALTER TABLE collector_sources DROP CONSTRAINT IF EXISTS collector_sources_source_type_check;
            ALTER TABLE collector_sources ADD CONSTRAINT collector_sources_source_type_check
                CHECK (source_type IN ('rss','web','csv','social_media','api','skdr_api'));
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END $$;

        CREATE TABLE IF NOT EXISTS skdr_reports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            source_id UUID NOT NULL REFERENCES collector_sources(id) ON DELETE CASCADE,
            endpoint_name VARCHAR(30) NOT NULL CHECK (endpoint_name IN ('ebs', 'ibs', 'alert')),
            external_key TEXT,
            report_year INTEGER NOT NULL,
            epidemiological_week INTEGER,
            report_date DATE,
            page_number INTEGER,
            payload JSONB NOT NULL,
            normalized_text TEXT NOT NULL,
            payload_hash CHAR(64) NOT NULL,
            dedupe_key CHAR(64) NOT NULL UNIQUE,
            raw_report_id UUID REFERENCES raw_reports(id) ON DELETE SET NULL,
            last_enqueued_at TIMESTAMPTZ,
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_skdr_reports_year_week
            ON skdr_reports(report_year, epidemiological_week);
        CREATE INDEX IF NOT EXISTS idx_skdr_reports_source_endpoint
            ON skdr_reports(source_id, endpoint_name);
        CREATE INDEX IF NOT EXISTS idx_skdr_reports_external_key
            ON skdr_reports(external_key);
        CREATE INDEX IF NOT EXISTS idx_skdr_reports_raw_report_id
            ON skdr_reports(raw_report_id);

        CREATE INDEX IF NOT EXISTS idx_disease_events_dashboard_published_valid
            ON disease_events (published_at DESC, raw_report_id, confidence DESC, created_at DESC)
            WHERE is_health_related = TRUE
              AND disease_classification IS NOT NULL
              AND UPPER(disease_classification) <> 'UNKNOWN'
              AND UPPER(disease_classification) NOT LIKE 'NEGATIVE%'
              AND confidence >= 0.15;
        "#
    ).await?;
    drop(client);

    let paths: Vec<_> = match std::fs::read_dir(dir) {
        Ok(read_dir) => {
            let mut p: Vec<_> = read_dir
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("sql"))
                .collect();
            p.sort_by_key(|e| e.file_name());
            p
        }
        Err(err) => {
            tracing::warn!("Could not read init SQL dir {dir}: {err}");
            Vec::new()
        }
    };

    for entry in &paths {
        let name = entry.file_name().to_string_lossy().to_string();
        let client = pool.get().await?;
        if client.query_opt(
            "SELECT 1 FROM schema_migrations WHERE filename = $1", &[&name]
        ).await?.is_some() {
            tracing::info!("  skip: {name} (already applied)");
            continue;
        }
        drop(client);
        let path = entry.path();
        let sql = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("Failed to read migration file {name}: {e}");
                continue;
            }
        };
        tracing::info!("  migrate: {name}");
        let mut client = pool.get().await?;
        let transaction = client.transaction().await?;
        if let Err(e) = transaction.batch_execute(&sql).await {
            tracing::error!("Migration {name} failed: {e}");
            return Err(e.into());
        }
        transaction.execute(
            "INSERT INTO schema_migrations(filename) VALUES($1)", &[&name]
        ).await?;
        transaction.commit().await?;
        tracing::info!("  OK   {name}");
    }
    tracing::info!("Init SQL complete");
    Ok(())
}

// ─── CONSOLE: REQUIRE ADMIN HELPER ────────────────────────────────────────────

async fn require_admin(
    state: &Arc<AppState>,
    headers: &axum::http::HeaderMap,
) -> Result<(Uuid, String), (StatusCode, axum::Json<serde_json::Value>)> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("")
        .to_string();

    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            axum::Json(json!({"success": false, "error": "Authentication required"})),
        ));
    }

    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_opt(
            "SELECT u.id, u.username, u.role FROM auth_tokens t
             JOIN users u ON u.id = t.user_id
             WHERE t.token = $1 AND t.expires_at > NOW() AND u.is_active = TRUE",
            &[&token],
        )
        .await
        .map_err(internal_error)?;

    match row {
        Some(r) => {
            let role: String = r.get(2);
            if role != "admin" && role != "superadmin" && role != "webmaster" {
                return Err((
                    StatusCode::FORBIDDEN,
                    axum::Json(json!({"success": false, "error": "Admin access required"})),
                ));
            }
            Ok((r.get::<_, Uuid>(0), r.get::<_, String>(1)))
        }
        None => Err((
            StatusCode::UNAUTHORIZED,
            axum::Json(json!({"success": false, "error": "Invalid or expired session"})),
        )),
    }
}

// ─── CONSOLE: SYSTEM SETTINGS ─────────────────────────────────────────────────

async fn get_system_settings(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_opt(
            "SELECT config_data, updated_at::text, updated_by FROM system_settings WHERE id = 'branding'",
            &[],
        )
        .await
        .map_err(internal_error)?;

    let data = match row {
        Some(r) => json!({
            "config_data": r.get::<_, Value>(0),
            "updated_at": r.get::<_, Option<String>>(1),
            "updated_by": r.get::<_, Option<String>>(2),
        }),
        None => json!({
            "config_data": {
                "app_name": "ASEAN Disease Outbreak Surveillance AI",
                "app_tagline": "Real-time Multilingual Disease Monitoring",
                "sidebar_logo_url": "",
                "login_logo_url": "",
                "favicon_url": "",
                "footer_text": "Disease Surveillance AI",
                "ticker_text": ""
            },
            "updated_at": null,
            "updated_by": null
        }),
    };

    Ok(Json(ApiResponse {
        success: true,
        data,
        total: None, page: None, per_page: None, total_pages: None,
    }))
}

async fn update_system_settings(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<UpdateSystemSettingsRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let (user_id, username) = require_admin(&state, &headers).await?;

    let client = state.db.get().await.map_err(internal_error)?;

    // Get previous value for audit log
    let prev = client
        .query_opt("SELECT config_data FROM system_settings WHERE id = 'branding'", &[])
        .await
        .map_err(internal_error)?
        .map(|r| r.get::<_, Value>(0))
        .unwrap_or(json!({}));

    // Upsert settings
    client
        .execute(
            "INSERT INTO system_settings (id, config_data, updated_at, updated_by)
             VALUES ('branding', $1, NOW(), $2)
             ON CONFLICT (id) DO UPDATE SET config_data = $1, updated_at = NOW(), updated_by = $2",
            &[&payload.config_data, &username],
        )
        .await
        .map_err(internal_error)?;

    // Write audit log
    let _ = client
        .execute(
            "INSERT INTO audit_logs (user_id, username, action, resource, detail)
             VALUES ($1, $2, 'UPDATE_SETTINGS', 'system_settings', $3)",
            &[
                &user_id,
                &username,
                &json!({"before": prev, "after": payload.config_data}),
            ],
        )
        .await;

    Ok(Json(ApiResponse {
        success: true,
        data: json!({"message": "Settings updated successfully"}),
        total: None, page: None, per_page: None, total_pages: None,
    }))
}

// ─── CONSOLE: AUDIT LOGS ──────────────────────────────────────────────────────

async fn list_audit_logs(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(params): Query<AuditLogsQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    require_admin(&state, &headers).await?;

    let client = state.db.get().await.map_err(internal_error)?;
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(50).clamp(1, 200);
    let offset = (page - 1) * per_page;

    let rows = client
        .query(
            "SELECT id, user_id, username, action, resource, detail, ip_address, created_at::text
             FROM audit_logs
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2",
            &[&per_page, &offset],
        )
        .await
        .map_err(internal_error)?;

    let total: i64 = client
        .query_one("SELECT COUNT(*) FROM audit_logs", &[])
        .await
        .map_err(internal_error)?
        .get(0);

    let data: Vec<Value> = rows.iter().map(|r| json!({
        "id": r.get::<_, Uuid>(0),
        "user_id": r.get::<_, Option<Uuid>>(1),
        "username": r.get::<_, Option<String>>(2),
        "action": r.get::<_, String>(3),
        "resource": r.get::<_, Option<String>>(4),
        "detail": r.get::<_, Option<Value>>(5),
        "ip_address": r.get::<_, Option<String>>(6),
        "created_at": r.get::<_, Option<String>>(7),
    })).collect();

    let total_pages = (total as f64 / per_page as f64).ceil() as i64;

    Ok(Json(ApiResponse {
        success: true,
        data,
        total: Some(total),
        page: Some(page),
        per_page: Some(per_page),
        total_pages: Some(total_pages),
    }))
}
