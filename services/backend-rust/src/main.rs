use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post, put},
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
    event_type: Option<String>,
    #[serde(default)]
    relevance_score: Option<String>,
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
    q: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Debug, Serialize)]
struct LoginResponse {
    token: String,
    user_id: Uuid,
    username: String,
    role: String,
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
struct EventsQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    disease: Option<String>,
    source_type: Option<String>,
    outbreak_alert: Option<bool>,
    date_from: Option<String>,
    date_to: Option<String>,
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
        .route("/api/v1/events", get(list_events))
        .route("/api/v1/summary", get(summary))
        .route("/api/v1/sources", get(list_sources).post(create_source))
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
                    r.url, SUBSTRING(r.original_text FROM 1 FOR 200) AS title
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
              ORDER BY e.created_at DESC
              LIMIT $7 OFFSET $8";
     let rows = client
        .query(sql, &[&query.q, &query.disease, &query.source_type, &query.outbreak_alert, &query.date_from, &query.date_to, &per_page, &offset])
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
             AND ($6::text IS NULL OR e.published_at::text <= $6)",
            &[&query.q, &query.disease, &query.source_type, &query.outbreak_alert, &query.date_from, &query.date_to],
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
                    ) AS last_run
             FROM collector_sources s
             LEFT JOIN LATERAL (
                 SELECT status, records_found, records_ingested, started_at, finished_at
                 FROM collector_runs
                 WHERE source_id = s.id
                 ORDER BY started_at DESC LIMIT 1
             ) lr ON TRUE
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
            "SELECT id, name, source_type, config, schedule, enabled, created_at::text, updated_at::text FROM collector_sources WHERE id = $1",
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

async fn verify_token(state: &AppState, token: &str) -> Result<Value, StatusCode> {
    let client = state.db.get().await.map_err(|_| StatusCode::UNAUTHORIZED)?;
    let row = client
        .query_opt(
            "SELECT u.id, u.username, u.role, u.display_name
             FROM auth_tokens t JOIN users u ON u.id = t.user_id
             WHERE t.token = $1 AND t.expires_at > NOW() AND u.is_active = TRUE",
            &[&token],
        )
        .await
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    match row {
        Some(r) => Ok(json!({
            "id": r.get::<_, Uuid>(0),
            "username": r.get::<_, String>(1),
            "role": r.get::<_, String>(2),
            "display_name": r.get::<_, Option<String>>(3),
        })),
        None => Err(StatusCode::UNAUTHORIZED),
    }
}

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

fn get_token(headers: &axum::http::HeaderMap) -> &str {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("")
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
