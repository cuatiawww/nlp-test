use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use chrono::NaiveDate;
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

#[derive(Debug, Deserialize, Serialize)]
struct NlpResponse {
    language: String,
    normalized_text: String,
    location_name: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
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
struct SummaryQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    disease: Option<String>,
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
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/v1/ingest", post(ingest))
        .route("/api/v1/analyze-url", post(analyze_url))
        .route("/api/v1/events", get(list_events))
        .route("/api/v1/summary", get(summary))
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

fn extract_body_text(html: &str) -> String {
    let mut result = String::new();
    let chars: Vec<char> = html.chars().collect();
    let n = chars.len();
    let mut i = 0;
    let mut in_tag = false;
    let mut in_skip = false;

    while i < n {
        match chars[i] {
            '<' => {
                in_tag = true;
                if !in_skip && i + 6 < n {
                    let snip: String = chars[i..].iter().take(8).collect();
                    let s = snip.to_lowercase();
                    if s.starts_with("<script") || s.starts_with("<style") {
                        in_skip = true;
                    }
                }
                if in_skip && i + 1 < n && chars[i + 1] == '/' {
                    let snip: String = chars[i..].iter().take(9).collect();
                    let s = snip.to_lowercase();
                    if s.starts_with("</script") || s.starts_with("</style") {
                        in_skip = false;
                    }
                }
            }
            '>' => in_tag = false,
            _ if !in_tag && !in_skip => result.push(chars[i]),
            _ => {}
        }
        i += 1;
    }

    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

async fn analyze_url(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AnalyzeUrlRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let url = payload.url.trim().to_string();

    if url.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(json!({ "success": false, "error": "URL tidak boleh kosong" }))));
    }

    let resp = state
        .http
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (compatible; DiseaseAnalyzer/1.0)")
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "success": false, "error": format!("Gagal mengambil URL: {}", e) })),
            )
        })?;

    let html = resp.text().await.map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Gagal membaca response URL" })),
        )
    })?;

    let title = extract_title_from_html(&html);
    let body_text = extract_body_text(&html);
    let max_len: usize = env::var("ANALYZE_MAX_CONTENT_LENGTH")
        .unwrap_or_else(|_| "10000".to_string())
        .parse()
        .unwrap_or(10000);
    let content = if body_text.len() > max_len {
        format!("{}...", &body_text[..max_len])
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
        }))
        .send()
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": "NLP service tidak dapat dijangkau" })),
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

    let client = state.db.get().await.map_err(internal_error)?;

    let raw_id: Uuid = client
        .query_one(
            "INSERT INTO raw_reports (source_type, source_name, original_text, url, processing_status)
             VALUES ($1, $2, $3, $4, 'PROCESSED') RETURNING id",
            &[&"web", &"URL Analyzer", &text, &url],
        )
        .await
        .map_err(internal_error)?
        .get(0);

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

    let mut sources = serde_json::Map::new();
    sources.insert("title".to_string(), json!("Diambil dari tag <title> di halaman web"));
    sources.insert("content".to_string(), json!("Diambil dari elemen body halaman web setelah menghapus tag HTML (script, style, dll.)"));
    sources.insert("language".to_string(), json!("Dideteksi oleh library Language Detection (langdetect)"));
    sources.insert("location_name".to_string(), json!("Dicocokkan dari database lokasi (tabel locations) berdasarkan penyebutan nama tempat dalam teks"));
    sources.insert("symptoms".to_string(), json!("Ditemukan melalui pencocokan kata kunci gejala dari database NLP Keywords (kategori 'symptom')"));
    sources.insert("disease_extracted".to_string(), json!("Ditemukan melalui pencocokan kata kunci penyakit dari database NLP Keywords (kategori 'disease')"));
    sources.insert("disease_classification".to_string(), json!("Diklasifikasikan oleh model AI XLM-RoBERTa menggunakan zero-shot classification dengan label penyakit dari database NLP Labels"));
    sources.insert("case_count".to_string(), json!("Diekstrak menggunakan pola regex: angka yang diikuti kata 'warga', 'pasien', 'kasus', atau 'residents'"));
    sources.insert("death_count".to_string(), json!("Diekstrak menggunakan pola regex: angka yang diikuti kata 'meninggal', 'death', atau 'deaths'"));
    sources.insert("confidence".to_string(), json!("Nilai confidence (keyakinan) dari model AI dalam mengklasifikasikan penyakit — semakin tinggi semakin yakin"));
    sources.insert("outbreak_alert".to_string(), json!("Ditentukan dengan membandingkan jumlah kasus terhadap threshold minimum di database Outbreak Rules untuk penyakit terkait"));
    sources.insert("sentiment".to_string(), json!("Diklasifikasikan oleh model AI XLM-RoBERTa dengan label sentimen: positive, negative, atau neutral"));
    sources.insert("event_type".to_string(), json!("Diklasifikasikan oleh model AI XLM-RoBERTa dengan label tipe kejadian dari database NLP Labels (kategori 'event_type')"));
    sources.insert("relevance_score".to_string(), json!("Diklasifikasikan oleh model AI XLM-RoBERTa apakah teks terkait kesehatan (health) atau tidak"));
    sources.insert("source_credibility".to_string(), json!("Skor kredibilitas berdasarkan tipe sumber dari database Source Credibility. Tipe 'web' memiliki skor default 0.50"));

    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "title": title,
            "content": content,
            "url": url,
            "language": nlp.language,
            "location_name": nlp.location_name,
            "latitude": nlp.latitude,
            "longitude": nlp.longitude,
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

    let sql = "SELECT e.id, e.source_type, e.source_name, e.published_at::text, e.language, e.location_name,
                    e.disease_classification, e.case_count, e.death_count, e.confidence::float8 AS confidence, e.outbreak_alert,
                    ST_Y(e.geom) AS latitude, ST_X(e.geom) AS longitude, e.created_at::text,
                    e.sentiment, e.event_type, e.relevance_score,
                    e.source_credibility::float8 AS source_credibility, e.source_credibility_label, e.needs_review,
                    r.url, SUBSTRING(r.original_text FROM 1 FOR 200) AS title,
                    e.is_health_related
             FROM disease_events e
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
            "disease_classification": r.get::<_, Option<String>>(6),
            "case_count": r.get::<_, Option<i32>>(7),
            "death_count": r.get::<_, Option<i32>>(8),
            "confidence": r.get::<_, Option<f64>>(9),
            "outbreak_alert": r.get::<_, Option<bool>>(10),
            "latitude": r.get::<_, Option<f64>>(11),
            "longitude": r.get::<_, Option<f64>>(12),
            "created_at": r.get::<_, Option<String>>(13),
            "sentiment": r.get::<_, Option<String>>(14),
            "event_type": r.get::<_, Option<String>>(15),
            "relevance_score": r.get::<_, Option<String>>(16),
            "source_credibility": r.get::<_, Option<f64>>(17),
            "source_credibility_label": r.get::<_, Option<String>>(18),
            "needs_review": r.get::<_, Option<bool>>(19),
            "url": r.get::<_, Option<String>>(20),
            "title": r.get::<_, Option<String>>(21),
            "is_health_related": r.get::<_, Option<bool>>(22),
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
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let rows = client
        .query("SELECT id, name, latitude, longitude, country, is_active, created_at::text, updated_at::text FROM locations ORDER BY name", &[])
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
    Ok(Json(ApiResponse { success: true, data, total: None, page: None, per_page: None, total_pages: None }))
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
    tracing::error!("{:?}", err);
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "success": false, "error": err.to_string() })),
    )
}

async fn run_init_sql(pool: &Pool, dir: &str) -> anyhow::Result<()> {
    tracing::info!("Running init SQL from {dir}");
    let mut paths: Vec<_> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("sql"))
        .collect();
    paths.sort_by_key(|e| e.file_name());

    for entry in &paths {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        match std::fs::read_to_string(&path) {
            Ok(sql) => {
                tracing::info!("  init: {name}");
                let mut conn = pool.get().await?;
                match conn.batch_execute(&sql).await {
                    Ok(_) => tracing::info!("  OK   {name}"),
                    Err(e) => tracing::error!("  FAIL {name}: {e}"),
                }
            }
            Err(e) => tracing::error!("  SKIP {name}: {e}"),
        }
    }
    tracing::info!("Init SQL complete");
    Ok(())
}
