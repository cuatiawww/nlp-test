mod security;

use axum::{
    extract::{Path, Query, Request, State},
    http::{Method, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::{get, post, put},
    Json, Router,
};
use chrono::{Datelike, NaiveDate, Weekday};
use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio_postgres::{Config, NoTls};
use lapin::{
    options::{BasicPublishOptions, QueueDeclareOptions},
    types::FieldTable,
    BasicProperties, Connection, ConnectionProperties,
};
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

struct PublicDashCache {
    key: String,
    expires_at: Instant,
    payload: Value,
}

static PUBLIC_DASH_CACHE: Mutex<Option<PublicDashCache>> = Mutex::new(None);

#[derive(Clone, Copy)]
struct SharedKpis {
    cases: i64,
    deaths: i64,
    events: i64,
    active_locations: i64,
    alerts: i64,
    location_master_count: i64,
}

#[derive(Clone)]
struct KpiSnapshotRow {
    id: String,
    filter_key: String,
    start_date: NaiveDate,
    end_date: NaiveDate,
    country: String,
    disease: String,
    source: String,
    kpis: SharedKpis,
    computed_at: String,
    is_stale: bool,
    age_secs: i64,
}

const KPI_SNAPSHOT_MIN_REFRESH_SECS: i64 = 90;

/// Canonical 11 jurisdictions for default KPI/map/TV/reports scope.
/// Display names Lao PDR / Viet Nam alias to Laos / Vietnam in storage.
const ASEAN11_MEMBERS: [&str; 11] = [
    "Brunei",
    "Cambodia",
    "Indonesia",
    "Laos",
    "Malaysia",
    "Myanmar",
    "Philippines",
    "Singapore",
    "Thailand",
    "Timor-Leste",
    "Vietnam",
];

const ASEAN11_SQL_IN: &str = "'Brunei', 'Cambodia', 'Indonesia', 'Laos', 'Malaysia', 'Myanmar', 'Philippines', 'Singapore', 'Thailand', 'Timor-Leste', 'Vietnam'";

fn asean11_fold_sql(expr: &str) -> String {
    format!(
        r#"CASE
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('brunei', 'brunei darussalam') THEN 'Brunei'
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('cambodia', 'kampuchea', 'kamboja') THEN 'Cambodia'
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('indonesia') THEN 'Indonesia'
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('laos', 'lao pdr', 'lao people''s democratic republic') THEN 'Laos'
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('malaysia') THEN 'Malaysia'
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('myanmar', 'burma') THEN 'Myanmar'
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('philippines', 'the philippines', 'philippine') THEN 'Philippines'
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('singapore', 'singapura') THEN 'Singapore'
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('thailand') THEN 'Thailand'
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('timor-leste', 'timor leste', 'east timor') THEN 'Timor-Leste'
          WHEN LOWER(BTRIM(COALESCE({expr}, ''))) IN ('vietnam', 'viet nam') THEN 'Vietnam'
          ELSE 'OUTSIDE ASEAN'
        END"#
    )
}

fn resolved_country_expr(event_alias: &str, loc_alias: &str) -> String {
    let folded = asean11_fold_sql(&format!(
        "COALESCE({loc_alias}.country, {event_alias}.location_name)"
    ));
    format!(
        "CASE WHEN LOWER(COALESCE({event_alias}.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia' ELSE {folded} END"
    )
}

fn country_scope_sql() -> String {
    country_scope_predicate("resolved_country", 3)
}

/// `$N IS NULL` is Global (no country filter). `all` / `ASEAN` / `asean11` use the 11-member IN-list.
fn country_scope_predicate(resolved_expr: &str, country_param: u32) -> String {
    format!(
        "(${p}::text IS NULL OR (${p}::text IN ('ASEAN', 'asean11', 'all') AND {expr} IN ({list})) OR LOWER({expr}) = LOWER(${p}) OR (LOWER(${p}) IN ('laos', 'lao pdr') AND {expr} = 'Laos') OR (LOWER(${p}) IN ('vietnam', 'viet nam') AND {expr} = 'Vietnam'))",
        p = country_param,
        expr = resolved_expr,
        list = ASEAN11_SQL_IN,
    )
}

fn is_default_asean_scope_token(value: &str) -> bool {
    value.is_empty()
        || value.eq_ignore_ascii_case("all")
        || value.eq_ignore_ascii_case("asean")
        || value.eq_ignore_ascii_case("asean11")
}

fn is_global_scope_token(value: &str) -> bool {
    value.eq_ignore_ascii_case("global") || value.eq_ignore_ascii_case("world")
}

fn canonical_member_name(value: &str) -> Option<String> {
    let folded = value.trim().to_ascii_lowercase();
    match folded.as_str() {
        "brunei" | "brunei darussalam" => Some("Brunei".into()),
        "cambodia" | "kampuchea" | "kamboja" => Some("Cambodia".into()),
        "indonesia" => Some("Indonesia".into()),
        "laos" | "lao pdr" | "lao people's democratic republic" => Some("Laos".into()),
        "malaysia" => Some("Malaysia".into()),
        "myanmar" | "burma" => Some("Myanmar".into()),
        "philippines" | "the philippines" | "philippine" => Some("Philippines".into()),
        "singapore" | "singapura" => Some("Singapore".into()),
        "thailand" => Some("Thailand".into()),
        "timor-leste" | "timor leste" | "east timor" => Some("Timor-Leste".into()),
        "vietnam" | "viet nam" => Some("Vietnam".into()),
        _ => None,
    }
}

fn source_credibility_threshold() -> f64 {
    env::var("SOURCE_CREDIBILITY_THRESHOLD")
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|value: &f64| *value > 0.0 && *value <= 1.0)
        .unwrap_or(0.70)
}

fn source_coverage_fields(country: &Option<String>) -> (String, bool) {
    match country.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) if canonical_member_name(value).is_some() => {
            ("asean_outlet".to_string(), true)
        }
        Some(value) if value.eq_ignore_ascii_case("global")
            || value.eq_ignore_ascii_case("international")
            || value.eq_ignore_ascii_case("world") =>
        {
            ("global_outlet".to_string(), true)
        }
        _ => ("unclassified".to_string(), false),
    }
}

fn resolve_kpi_country(country: &Option<String>, scope: &Option<String>) -> String {
    let country_raw = country.as_deref().unwrap_or("").trim();
    let scope_raw = scope.as_deref().unwrap_or("").trim();
    if !is_default_asean_scope_token(country_raw) && !is_global_scope_token(country_raw) {
        return canonical_member_name(country_raw).unwrap_or_else(|| country_raw.to_string());
    }
    if is_global_scope_token(country_raw) || is_global_scope_token(scope_raw) {
        return "global".to_string();
    }
    "asean11".to_string()
}

fn pad_asean11_country_rows(rows: Vec<Value>, scope: &str) -> Vec<Value> {
    if !scope.eq_ignore_ascii_case("asean11") && !scope.eq_ignore_ascii_case("ASEAN") {
        return rows;
    }
    let mut by_name = std::collections::HashMap::<String, Value>::new();
    for row in rows {
        if let Some(name) = row.get("name").and_then(Value::as_str) {
            by_name.insert(name.to_string(), row);
        }
    }
    ASEAN11_MEMBERS
        .iter()
        .map(|name| {
            by_name.remove(*name).unwrap_or_else(|| {
                json!({
                    "name": name,
                    "cases": 0,
                    "deaths": 0,
                    "events": 0,
                })
            })
        })
        .collect()
}

fn snapshot_needs_refresh(is_stale: bool, age_secs: i64) -> bool {
    is_stale && age_secs >= KPI_SNAPSHOT_MIN_REFRESH_SECS
}

fn canonical_kpi_country(raw: &Option<String>) -> String {
    resolve_kpi_country(raw, &None)
}

fn canonical_kpi_disease(raw: &Option<String>) -> String {
    let value = raw.as_deref().unwrap_or("").trim();
    if value.is_empty() || value.eq_ignore_ascii_case("all") {
        "all".to_string()
    } else {
        value.to_string()
    }
}

fn canonical_kpi_source(_raw: &Option<String>) -> String {
    // SKDR IBS/EBS are detached; headline KPIs ignore source filters.
    "all".to_string()
}

fn kpi_filter_key(
    start_date: NaiveDate,
    end_date: NaiveDate,
    country: &str,
    disease: &str,
    source: &str,
) -> String {
    format!("{start_date}|{end_date}|{country}|{disease}|{source}").to_lowercase()
}

fn default_kpi_dates(
    year: Option<i32>,
    start_year: Option<i32>,
    start_week: Option<u32>,
    end_year: Option<i32>,
    end_week: Option<u32>,
) -> (NaiveDate, NaiveDate) {
    let now = chrono::Utc::now();
    let epi_year = now.iso_week().year();
    let epi_week = now.iso_week().week();
    if start_week.is_none()
        && end_week.is_none()
        && start_year.is_none()
        && end_year.is_none()
        && year.is_none()
    {
        return resolve_dashboard_dates(
            epi_year,
            Some(epi_year),
            Some(1),
            Some(epi_year),
            Some(epi_week),
        );
    }
    let default_year = year.or(end_year).or(start_year).unwrap_or(epi_year);
    resolve_dashboard_dates(
        default_year,
        start_year.or(Some(default_year)),
        start_week.or(Some(1)),
        end_year.or(Some(default_year)),
        end_week.or(Some(epi_week)),
    )
}

fn kpi_scope_label(canonical: &str) -> &str {
    if canonical.eq_ignore_ascii_case("asean11") || canonical.eq_ignore_ascii_case("asean") {
        "ASEAN 11 jurisdictions"
    } else if canonical.eq_ignore_ascii_case("global") {
        "all monitored countries"
    } else {
        canonical
    }
}

fn sql_country_param(canonical: &str) -> Option<String> {
    if canonical.eq_ignore_ascii_case("global") {
        None
    } else {
        Some(canonical.to_string())
    }
}

fn sql_disease_param(canonical: &str) -> Option<String> {
    if canonical.eq_ignore_ascii_case("all") {
        None
    } else {
        Some(canonical.to_string())
    }
}

fn kpi_snapshot_json(row: &KpiSnapshotRow) -> Value {
    json!({
        "snapshot_id": row.id,
        "filter_key": row.filter_key,
        "computed_at": row.computed_at,
        "is_stale": row.is_stale,
        "kpi_source": "materialized_kpi_snapshot",
        "scope": row.country,
        "refresh": "On ingest the previous snapshot is marked stale. The next reader recomputes under pg_advisory_lock(filter_key) and upserts. Concurrent dashboard/TV/reports widgets read that same row and never invent totals.",
        "start_date": row.start_date.to_string(),
        "end_date": row.end_date.to_string(),
        "country": row.country,
        "disease": row.disease,
        "source": row.source,
    })
}

fn dashboard_valid_cte() -> String {
    format!(
        r#"WITH ranked AS (
             SELECT e.*, rr.url AS report_url,
                    ROW_NUMBER() OVER (
                      PARTITION BY COALESCE(NULLIF(rr.url, ''), e.raw_report_id::text, e.id::text)
                      ORDER BY e.confidence DESC NULLS LAST, e.created_at DESC
                    ) AS dedup_rank
             FROM disease_events e
             LEFT JOIN raw_reports rr ON rr.id = e.raw_report_id
             WHERE {pred}
               AND e.published_at::date >= $1 AND e.published_at::date <= $2
               AND ($4::text IS NULL OR $4::text = 'all' OR LOWER(e.disease_classification) = LOWER($4) OR LOWER(e.disease_classification) LIKE '%' || LOWER($4) || '%')
               AND ($5::text IS NULL OR (EXISTS (
                 SELECT 1 FROM skdr_reports sr
                 WHERE sr.raw_report_id = e.raw_report_id
                   AND ($5::text = 'skdr' OR sr.endpoint_name = $5::text)
               ) OR ($5::text = 'skdr' AND LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))))
           ), valid AS (
             SELECT ranked.*,
                    {resolved} AS resolved_country
             FROM ranked
             LEFT JOIN LATERAL (
               SELECT l0.* FROM locations l0
               WHERE LOWER(l0.name) = LOWER(ranked.location_name) AND l0.is_active = TRUE
               ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
               LIMIT 1
             ) l ON TRUE
             WHERE ranked.dedup_rank = 1
           )"#,
        pred = security::DASHBOARD_EVENT_PREDICATE,
        resolved = resolved_country_expr("ranked", "l"),
    )
}

async fn query_shared_kpis(
    client: &deadpool_postgres::Object,
    start_date: NaiveDate,
    end_date: NaiveDate,
    selected_country: &Option<String>,
    selected_disease: &Option<String>,
    selected_source: &Option<String>,
) -> Result<SharedKpis, (StatusCode, Json<Value>)> {
    let sql = format!(
        "{} SELECT
            COALESCE(SUM({cases}), 0)::bigint AS cases,
            COALESCE(SUM({deaths}), 0)::bigint AS deaths,
            COUNT(*)::bigint AS events,
            COUNT(DISTINCT NULLIF(TRIM(location_name), ''))::bigint AS active_locations,
            COUNT(*) FILTER (WHERE outbreak_alert = TRUE)::bigint AS alerts,
            (SELECT COUNT(*)::bigint FROM locations loc WHERE loc.is_active = TRUE AND {master_scope}) AS location_master_count
         FROM valid
         WHERE {}",
        dashboard_valid_cte(),
        country_scope_sql(),
        cases = security::SANE_CASES_SQL,
        deaths = security::SANE_DEATHS_SQL,
        master_scope = country_scope_predicate(&asean11_fold_sql("loc.country"), 3),
    );
    let row = client
        .query_one(
            &sql,
            &[
                &start_date,
                &end_date,
                selected_country,
                selected_disease,
                selected_source,
            ],
        )
        .await
        .map_err(internal_error)?;
    Ok(SharedKpis {
        cases: row.get("cases"),
        deaths: row.get("deaths"),
        events: row.get("events"),
        active_locations: row.get("active_locations"),
        alerts: row.get("alerts"),
        location_master_count: row.get("location_master_count"),
    })
}

fn snapshot_from_row(row: &tokio_postgres::Row, fallback_key: &str) -> KpiSnapshotRow {
    KpiSnapshotRow {
        id: row.get::<_, Uuid>("id").to_string(),
        filter_key: row
            .try_get::<_, String>("filter_key")
            .unwrap_or_else(|_| fallback_key.to_string()),
        start_date: row.get("start_date"),
        end_date: row.get("end_date"),
        country: row.get("country"),
        disease: row.get("disease"),
        source: row.get("source"),
        kpis: SharedKpis {
            cases: row.get("cases"),
            deaths: row.get("deaths"),
            events: row.get("events"),
            active_locations: row.get("active_locations"),
            alerts: row.get("alerts"),
            location_master_count: row.get("location_master_count"),
        },
        computed_at: row
            .try_get::<_, String>("computed_at")
            .unwrap_or_else(|_| String::new()),
        is_stale: row.get("is_stale"),
        age_secs: row.try_get::<_, i64>("age_secs").unwrap_or(0),
    }
}

async fn read_kpi_snapshot(
    client: &deadpool_postgres::Object,
    filter_key: &str,
) -> Result<Option<KpiSnapshotRow>, (StatusCode, Json<Value>)> {
    match client
        .query_opt(
            "SELECT id, filter_key, start_date, end_date, country, disease, source,
                    cases, deaths, events, active_locations, alerts, location_master_count,
                    computed_at::text, is_stale,
                    EXTRACT(EPOCH FROM (NOW() - computed_at))::bigint AS age_secs
             FROM kpi_snapshots WHERE filter_key = $1",
            &[&filter_key],
        )
        .await
    {
        Ok(Some(row)) => Ok(Some(snapshot_from_row(&row, filter_key))),
        Ok(None) => Ok(None),
        Err(err) => {
            let text = err.to_string();
            if text.contains("kpi_snapshots") {
                Ok(None)
            } else {
                Err(internal_error(err))
            }
        }
    }
}

async fn mark_kpi_snapshots_stale(client: &deadpool_postgres::Object) {
    let _ = client
        .execute(
            "UPDATE kpi_snapshots SET is_stale = TRUE WHERE is_stale = FALSE",
            &[],
        )
        .await;
    if let Ok(mut guard) = PUBLIC_DASH_CACHE.lock() {
        *guard = None;
    }
}

async fn skdr_detached() -> (StatusCode, Json<Value>) {
    (
        StatusCode::GONE,
        Json(json!({
            "success": false,
            "error": "SKDR IBS and EBS integrations are detached and will be reattached later",
            "code": "skdr_detached"
        })),
    )
}

async fn kpi_snapshot(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PublicDashboardQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let country_key = resolve_kpi_country(&query.country, &query.scope);
    let disease_key = canonical_kpi_disease(&query.disease);
    let source_key = canonical_kpi_source(&query.source);
    let (start_date, end_date) = default_kpi_dates(
        query.year,
        query.start_year,
        query.start_week,
        query.end_year,
        query.end_week,
    );
    let snapshot = load_or_refresh_kpi_snapshot(
        &client,
        start_date,
        end_date,
        &country_key,
        &disease_key,
        &source_key,
    )
    .await?;
    Ok(Json(json!({
        "success": true,
        "data": {
            "kpis": kpis_json_with_snapshot(&snapshot),
            "snapshot": kpi_snapshot_json(&snapshot),
        }
    })))
}

async fn kpi_events(
    State(state): State<Arc<AppState>>,
    Query(query): Query<KpiEventsQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let country_key = resolve_kpi_country(&query.country, &query.scope);
    let disease_key = canonical_kpi_disease(&query.disease);
    let source_key = canonical_kpi_source(&None);
    let (start_date, end_date) = default_kpi_dates(
        query.year,
        query.start_year,
        query.start_week,
        query.end_year,
        query.end_week,
    );
    let snapshot = load_or_refresh_kpi_snapshot(
        &client,
        start_date,
        end_date,
        &country_key,
        &disease_key,
        &source_key,
    )
    .await?;
    let sql_country = sql_country_param(&country_key);
    let sql_disease = sql_disease_param(&disease_key);
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);
    let sql = format!(
        "{} SELECT id::text AS id,
            COALESCE(NULLIF(TRIM(location_name), ''), resolved_country) AS location_name,
            resolved_country AS country,
            COALESCE(NULLIF(TRIM(disease_classification), ''), 'UNKNOWN') AS disease,
            {cases}::bigint AS cases,
            {deaths}::bigint AS deaths,
            COALESCE(confidence, 0)::float8 AS confidence,
            COALESCE(outbreak_alert, FALSE) AS outbreak_alert,
            COALESCE(needs_review, FALSE) AS needs_review,
            COALESCE(source_name, '') AS source_name,
            COALESCE(source_type, '') AS source_type,
            COALESCE(report_url, '') AS url,
            COALESCE(published_at::text, '') AS published_at
         FROM valid
         WHERE {}
         ORDER BY published_at DESC NULLS LAST, confidence DESC NULLS LAST
         LIMIT $6 OFFSET $7",
        dashboard_valid_cte(),
        country_scope_sql(),
        cases = security::SANE_CASES_SQL,
        deaths = security::SANE_DEATHS_SQL,
    );
    let rows = client
        .query(
            &sql,
            &[
                &start_date,
                &end_date,
                &sql_country,
                &sql_disease,
                &None::<String>,
                &per_page,
                &offset,
            ],
        )
        .await
        .map_err(internal_error)?;
    let data: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<_, String>("id"),
                "location_name": r.get::<_, String>("location_name"),
                "country": r.get::<_, String>("country"),
                "disease_classification": r.get::<_, String>("disease"),
                "case_count": r.get::<_, i64>("cases"),
                "death_count": r.get::<_, i64>("deaths"),
                "confidence": r.get::<_, f64>("confidence"),
                "outbreak_alert": r.get::<_, bool>("outbreak_alert"),
                "needs_review": r.get::<_, bool>("needs_review"),
                "source_name": r.get::<_, String>("source_name"),
                "source_type": r.get::<_, String>("source_type"),
                "url": r.get::<_, String>("url"),
                "published_at": r.get::<_, String>("published_at"),
            })
        })
        .collect();
    Ok(Json(json!({
        "success": true,
        "data": data,
        "total": snapshot.kpis.events,
        "page": page,
        "per_page": per_page,
        "total_pages": calc_total_pages(snapshot.kpis.events, per_page),
        "snapshot_id": snapshot.id,
        "snapshot_computed_at": snapshot.computed_at,
        "snapshot_filter_key": snapshot.filter_key,
    })))
}

async fn load_or_refresh_kpi_snapshot(
    client: &deadpool_postgres::Object,
    start_date: NaiveDate,
    end_date: NaiveDate,
    country: &str,
    disease: &str,
    source: &str,
) -> Result<KpiSnapshotRow, (StatusCode, Json<Value>)> {
    let filter_key = kpi_filter_key(start_date, end_date, country, disease, source);
    let previous = read_kpi_snapshot(client, &filter_key).await?;
    if let Some(row) = previous.as_ref() {
        if !snapshot_needs_refresh(row.is_stale, row.age_secs) {
            return Ok(row.clone());
        }
    }

    let locked = client
        .query_one(
            "SELECT pg_try_advisory_lock(hashtext($1)::bigint)",
            &[&filter_key],
        )
        .await
        .ok()
        .map(|row| row.get::<_, bool>(0))
        .unwrap_or(false);
    if !locked {
        if let Some(row) = previous {
            return Ok(row);
        }
        let _ = client
            .execute("SELECT pg_advisory_lock(hashtext($1)::bigint)", &[&filter_key])
            .await;
    }
    let outcome = async {
        if let Some(row) = read_kpi_snapshot(client, &filter_key).await? {
            if !snapshot_needs_refresh(row.is_stale, row.age_secs) {
                return Ok(row);
            }
        }
        let sql_country = sql_country_param(country);
        let sql_disease = sql_disease_param(disease);
        let shared = match query_shared_kpis(
            client,
            start_date,
            end_date,
            &sql_country,
            &sql_disease,
            &None,
        )
        .await
        {
            Ok(value) => value,
            Err(err) => {
                if let Some(row) = read_kpi_snapshot(client, &filter_key).await? {
                    return Ok(row);
                }
                return Err(err);
            }
        };
        match client
            .query_one(
                "INSERT INTO kpi_snapshots (
                    filter_key, start_date, end_date, country, disease, source,
                    cases, deaths, events, active_locations, alerts, location_master_count,
                    computed_at, is_stale
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(), FALSE)
                 ON CONFLICT (filter_key) DO UPDATE SET
                    cases = EXCLUDED.cases,
                    deaths = EXCLUDED.deaths,
                    events = EXCLUDED.events,
                    active_locations = EXCLUDED.active_locations,
                    alerts = EXCLUDED.alerts,
                    location_master_count = EXCLUDED.location_master_count,
                    start_date = EXCLUDED.start_date,
                    end_date = EXCLUDED.end_date,
                    country = EXCLUDED.country,
                    disease = EXCLUDED.disease,
                    source = EXCLUDED.source,
                    computed_at = NOW(),
                    is_stale = FALSE
                 RETURNING id, filter_key, start_date, end_date, country, disease, source,
                           cases, deaths, events, active_locations, alerts, location_master_count,
                           computed_at::text, is_stale",
                &[
                    &filter_key,
                    &start_date,
                    &end_date,
                    &country,
                    &disease,
                    &source,
                    &shared.cases,
                    &shared.deaths,
                    &shared.events,
                    &shared.active_locations,
                    &shared.alerts,
                    &shared.location_master_count,
                ],
            )
            .await
        {
            Ok(row) => Ok(snapshot_from_row(&row, &filter_key)),
            Err(err) => {
                let text = err.to_string();
                if let Some(row) = read_kpi_snapshot(client, &filter_key).await? {
                    return Ok(row);
                }
                if text.contains("kpi_snapshots") {
                    Ok(KpiSnapshotRow {
                        id: "ephemeral".to_string(),
                        filter_key: filter_key.clone(),
                        start_date,
                        end_date,
                        country: country.to_string(),
                        disease: disease.to_string(),
                        source: source.to_string(),
                        kpis: shared,
                        computed_at: chrono::Utc::now().to_rfc3339(),
                        is_stale: false,
                        age_secs: 0,
                    })
                } else {
                    Err(internal_error(err))
                }
            }
        }
    }
    .await;
    let _ = client
        .execute(
            "SELECT pg_advisory_unlock(hashtext($1)::bigint)",
            &[&filter_key],
        )
        .await;
    outcome
}

async fn query_shared_by_disease(
    client: &deadpool_postgres::Object,
    start_date: NaiveDate,
    end_date: NaiveDate,
    selected_country: &Option<String>,
    selected_disease: &Option<String>,
    selected_source: &Option<String>,
) -> Result<Vec<Value>, (StatusCode, Json<Value>)> {
    let sql = format!(
        "{} SELECT COALESCE(NULLIF(TRIM(disease_classification), ''), 'UNKNOWN') AS name,
            COALESCE(SUM({cases}), 0)::bigint AS cases,
            COALESCE(SUM({deaths}), 0)::bigint AS deaths,
            COUNT(*)::bigint AS events
         FROM valid
         WHERE {}
         GROUP BY 1
         ORDER BY cases DESC
         LIMIT 25",
        dashboard_valid_cte(),
        country_scope_sql(),
        cases = security::SANE_CASES_SQL,
        deaths = security::SANE_DEATHS_SQL,
    );
    let rows = client
        .query(
            &sql,
            &[
                &start_date,
                &end_date,
                selected_country,
                selected_disease,
                selected_source,
            ],
        )
        .await
        .map_err(internal_error)?;
    Ok(rows
        .iter()
        .map(|r| {
            json!({
                "name": r.get::<_, String>("name"),
                "cases": r.get::<_, i64>("cases"),
                "deaths": r.get::<_, i64>("deaths"),
                "events": r.get::<_, i64>("events"),
            })
        })
        .collect())
}

async fn query_shared_by_country(
    client: &deadpool_postgres::Object,
    start_date: NaiveDate,
    end_date: NaiveDate,
    selected_country: &Option<String>,
    selected_disease: &Option<String>,
    selected_source: &Option<String>,
) -> Result<Vec<Value>, (StatusCode, Json<Value>)> {
    let sql = format!(
        "{} SELECT resolved_country AS name,
            COALESCE(SUM({cases}), 0)::bigint AS cases,
            COALESCE(SUM({deaths}), 0)::bigint AS deaths
         FROM valid
         WHERE {}
         GROUP BY resolved_country
         ORDER BY cases DESC",
        dashboard_valid_cte(),
        country_scope_sql(),
        cases = security::SANE_CASES_SQL,
        deaths = security::SANE_DEATHS_SQL,
    );
    let rows = client
        .query(
            &sql,
            &[
                &start_date,
                &end_date,
                selected_country,
                selected_disease,
                selected_source,
            ],
        )
        .await
        .map_err(internal_error)?;
    Ok(rows
        .iter()
        .map(|r| {
            json!({
                "name": r.get::<_, String>("name"),
                "cases": r.get::<_, i64>("cases"),
                "deaths": r.get::<_, i64>("deaths"),
            })
        })
        .collect())
}

fn kpis_json(kpis: &SharedKpis) -> Value {
    json!({
        "cases": kpis.cases,
        "deaths": kpis.deaths,
        "events": kpis.events,
        "locations": kpis.active_locations,
        "active_locations": kpis.active_locations,
        "location_master_count": kpis.location_master_count,
        "active_alerts": kpis.alerts,
    })
}

fn kpis_json_with_snapshot(snapshot: &KpiSnapshotRow) -> Value {
    let mut value = kpis_json(&snapshot.kpis);
    if let Value::Object(map) = &mut value {
        map.insert("snapshot_id".to_string(), json!(snapshot.id));
        map.insert("snapshot_computed_at".to_string(), json!(snapshot.computed_at));
        map.insert("snapshot_filter_key".to_string(), json!(snapshot.filter_key));
        map.insert("snapshot_stale".to_string(), json!(snapshot.is_stale));
        map.insert("kpi_source".to_string(), json!("materialized_kpi_snapshot"));
        map.insert("scope".to_string(), json!(snapshot.country.clone()));
        map.insert(
            "scope_label".to_string(),
            json!(if snapshot.country.eq_ignore_ascii_case("asean11")
                || snapshot.country.eq_ignore_ascii_case("ASEAN")
            {
                "asean11"
            } else {
                snapshot.country.as_str()
            }),
        );
    }
    value
}

async fn auth_gate(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    if method == Method::OPTIONS || security::is_public_route(&method, &path) {
        return Ok(next.run(request).await);
    }

    let token = security::bearer_token(request.headers());
    if security::is_service_route(&path) {
        if !token.is_empty() && token == state.dashboard_api_token {
            return Ok(next.run(request).await);
        }
        if require_admin_token(&state, &token).await.is_ok() {
            return Ok(next.run(request).await);
        }
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"success": false, "error": "Authentication required"})),
        ));
    }

    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"success": false, "error": "Authentication required"})),
        ));
    }
    if security::is_admin_route(&method, &path) {
        require_admin_token(&state, &token).await?;
    } else {
        require_user_token(&state, &token).await?;
    }
    Ok(next.run(request).await)
}

fn normalize_cfr_percent(value: f64) -> f64 {
    if !value.is_finite() {
        0.0
    } else {
        value.clamp(0.0, 100.0)
    }
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
    #[serde(default, rename = "async")]
    asynchronous: bool,
    #[serde(default)]
    force_refresh: bool,
}

#[cfg(test)]
mod analysis_contract_tests {
    use super::*;
    #[test]
    fn old_request_remains_synchronous() {
        let request: AnalyzeUrlRequest = serde_json::from_value(json!({"url":"https://example.org"})).unwrap();
        assert!(!request.asynchronous);
        assert!(!request.force_refresh);
    }
    #[test]
    fn force_refresh_is_explicit_opt_in() {
        let request: AnalyzeUrlRequest = serde_json::from_value(json!({"url":"https://example.org","force_refresh":true})).unwrap();
        assert!(request.force_refresh);
    }
    #[test]
    fn async_is_explicit_opt_in() {
        let request: AnalyzeUrlRequest = serde_json::from_value(json!({"url":"https://example.org","async":true})).unwrap();
        assert!(request.asynchronous);
    }

    #[test]
    fn disease_master_request_keeps_icd11_fields_optional_for_pending_review() {
        let request: CreateDiseaseConceptRequest = serde_json::from_value(json!({
            "canonical_name": "Unresolved local disease term"
        })).unwrap();
        assert_eq!(request.canonical_name, "Unresolved local disease term");
        assert!(request.ontology_code.is_none());
        assert!(request.is_active.is_none());
    }

    #[test]
    fn disease_candidate_review_requires_official_concept_when_resolving() {
        assert!(validate_candidate_review("resolved", None).is_err());
        assert!(validate_candidate_review("resolved", Some(Uuid::new_v4())).is_ok());
        assert!(validate_candidate_review("rejected", None).is_ok());
        assert!(validate_candidate_review("pending", None).is_err());
        assert!(validate_candidate_review("unknown", None).is_err());
    }

    #[test]
    fn unified_dashboard_filter_uses_iso_week_boundaries() {
        let (start, end) = resolve_dashboard_dates(2026, Some(2025), Some(1), Some(2026), Some(36));
        assert_eq!(start, NaiveDate::from_ymd_opt(2024, 12, 30).unwrap());
        assert_eq!(end, NaiveDate::from_ymd_opt(2026, 9, 6).unwrap());
    }

    #[test]
    fn kpi_filter_key_is_stable_and_defaults_to_asean() {
        assert_eq!(canonical_kpi_country(&None), "asean11");
        assert_eq!(canonical_kpi_country(&Some("all".into())), "asean11");
        assert_eq!(canonical_kpi_country(&Some("ASEAN".into())), "asean11");
        assert_eq!(canonical_kpi_country(&Some("asean11".into())), "asean11");
        assert_eq!(canonical_kpi_country(&Some("global".into())), "global");
        assert_eq!(sql_country_param("asean11").as_deref(), Some("asean11"));
        assert_eq!(sql_country_param("global"), None);
        assert_eq!(kpi_scope_label("asean11"), "ASEAN 11 jurisdictions");
        assert_eq!(
            resolve_kpi_country(&Some("ASEAN".into()), &Some("asean11".into())),
            "asean11"
        );
        assert_eq!(canonical_kpi_source(&Some("ibs".into())), "all");
        let (start, end) = default_kpi_dates(Some(2026), Some(2026), Some(1), Some(2026), Some(36));
        let key_a = kpi_filter_key(start, end, "asean11", "all", "all");
        let key_b = kpi_filter_key(start, end, "asean11", "all", "all");
        assert_eq!(key_a, key_b);
        assert!(key_a.contains("asean11"));
        assert_ne!(
            kpi_filter_key(start, end, "asean11", "all", "all"),
            kpi_filter_key(start, end, "global", "all", "all")
        );
    }

    #[test]
    fn asean11_scope_sql_uses_allowlist_not_outside_asean_negation() {
        let sql = country_scope_sql();
        assert!(sql.contains("asean11"));
        assert!(sql.contains("Timor-Leste"));
        assert!(sql.contains("'all'"));
        assert!(!sql.contains("$3::text = 'all' OR"));
        assert!(!sql.to_lowercase().contains("<> 'outside asean'"));
        let folded = asean11_fold_sql("l.country");
        assert!(folded.contains("viet nam"));
        assert!(folded.contains("lao pdr"));
        assert!(folded.contains("OUTSIDE ASEAN"));
        let padded = pad_asean11_country_rows(vec![], "asean11");
        assert_eq!(padded.len(), 11);
        assert_eq!(padded[0]["name"], "Brunei");
        assert_eq!(padded[3]["name"], "Laos");
        assert_eq!(padded[9]["name"], "Timor-Leste");
        assert_eq!(padded[10]["name"], "Vietnam");
    }

    #[test]
    fn four_aggregate_endpoints_share_one_canonical_filter() {
        let country = canonical_kpi_country(&None);
        let disease = canonical_kpi_disease(&None);
        let source = canonical_kpi_source(&Some("ebs".into()));
        let (start, end) = default_kpi_dates(None, None, None, None, None);
        let dashboard = kpi_filter_key(start, end, &country, &disease, &source);
        let heatmap = kpi_filter_key(start, end, &country, &disease, &source);
        let trend = kpi_filter_key(start, end, &country, &disease, &source);
        let morbidity = kpi_filter_key(start, end, &country, &disease, &source);
        assert_eq!(dashboard, heatmap);
        assert_eq!(dashboard, trend);
        assert_eq!(dashboard, morbidity);
    }

    #[test]
    fn stale_snapshot_is_served_until_min_refresh_interval() {
        assert!(!snapshot_needs_refresh(false, 10_000));
        assert!(!snapshot_needs_refresh(true, 30));
        assert!(snapshot_needs_refresh(true, KPI_SNAPSHOT_MIN_REFRESH_SECS));
        assert!(snapshot_needs_refresh(true, KPI_SNAPSHOT_MIN_REFRESH_SECS + 1));
    }

    #[test]
    fn cfr_percentage_is_normalized_to_valid_range() {
        assert_eq!(normalize_cfr_percent(-1.0), 0.0);
        assert_eq!(normalize_cfr_percent(17_800.0), 100.0);
        assert_eq!(normalize_cfr_percent(12.345), 12.345);
        assert_eq!(normalize_cfr_percent(f64::NAN), 0.0);
    }
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
    #[serde(default)]
    geocode_confidence: Option<f64>,
    #[serde(default)]
    geocode_needs_review: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize)]
struct NlpResponse {
    language: String,
    normalized_text: String,
    #[serde(default)]
    summary: String,
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
    #[serde(default)]
    disease_mentions: Vec<Value>,
    disease_classification: String,
    case_count: i32,
    death_count: i32,
    #[serde(default)]
    case_count_unknown: Option<bool>,
    #[serde(default)]
    province: Option<String>,
    #[serde(default)]
    city: Option<String>,
    #[serde(default)]
    geocode_confidence: Option<f64>,
    #[serde(default)]
    geocode_needs_review: Option<bool>,
    #[serde(default)]
    evidence: Option<Vec<String>>,
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
    #[serde(default)]
    country: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateSourceRequest {
    name: Option<String>,
    source_type: Option<String>,
    config: Option<Value>,
    schedule: Option<String>,
    enabled: Option<bool>,
    country: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateInteroperabilityIntegrationRequest {
    name: String,
    integration_type: String,
    provider: Option<String>,
    source_url: Option<String>,
    endpoint: Option<String>,
    status: Option<String>,
    #[serde(default)]
    integrated_in: Value,
    description: Option<String>,
    enabled: Option<bool>,
    last_checked_at: Option<String>,
    last_error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateInteroperabilityIntegrationRequest {
    name: Option<String>,
    integration_type: Option<String>,
    provider: Option<String>,
    source_url: Option<String>,
    endpoint: Option<String>,
    status: Option<String>,
    integrated_in: Option<Value>,
    description: Option<String>,
    enabled: Option<bool>,
    last_checked_at: Option<String>,
    last_error: Option<String>,
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
struct MorbidityQuery {
    disease: Option<String>,
    weeks: Option<i32>,
    country: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    start_year: Option<i32>,
    start_week: Option<u32>,
    end_year: Option<i32>,
    end_week: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct TrendOverviewQuery {
    days: Option<i32>,
    country: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    disease: Option<String>,
    start_year: Option<i32>,
    start_week: Option<u32>,
    end_year: Option<i32>,
    end_week: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct HeatmapQuery {
    year: Option<i32>,
    country: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    disease: Option<String>,
    start_year: Option<i32>,
    start_week: Option<u32>,
    end_year: Option<i32>,
    end_week: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct PublicDashboardQuery {
    country: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    year: Option<i32>,
    source: Option<String>,
    disease: Option<String>,
    start_year: Option<i32>,
    start_week: Option<u32>,
    end_year: Option<i32>,
    end_week: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct KpiEventsQuery {
    country: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    year: Option<i32>,
    disease: Option<String>,
    start_year: Option<i32>,
    start_week: Option<u32>,
    end_year: Option<i32>,
    end_week: Option<u32>,
    page: Option<i64>,
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct CrawlingStatsQuery {
    country: Option<String>,
}

/// Resolve the same ISO-week date boundaries used by the main dashboard.
/// Optional fields preserve the legacy year-only behavior of the supporting
/// dashboard endpoints when callers do not send the unified filter.
fn resolve_dashboard_dates(
    default_year: i32,
    start_year: Option<i32>,
    start_week: Option<u32>,
    end_year: Option<i32>,
    end_week: Option<u32>,
) -> (NaiveDate, NaiveDate) {
    let start_year = start_year.unwrap_or(default_year);
    let end_year = end_year.unwrap_or(default_year);
    let start_date = start_week
        .and_then(|week| NaiveDate::from_isoywd_opt(start_year, week, Weekday::Mon))
        .or_else(|| NaiveDate::from_ymd_opt(start_year, 1, 1))
        .unwrap();
    let end_date = end_week
        .and_then(|week| NaiveDate::from_isoywd_opt(end_year, week, Weekday::Sun))
        .or_else(|| NaiveDate::from_ymd_opt(end_year, 12, 31))
        .unwrap();
    (start_date, end_date)
}

#[derive(Debug, Deserialize)]
struct IbsSummaryQuery {
    year: Option<i32>,
    province: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DiseaseCandidateQuery {
    status: Option<String>,
    language: Option<String>,
    page: Option<i64>,
    per_page: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ReviewDiseaseCandidateRequest {
    status: String,
    resolved_concept_id: Option<Uuid>,
}


#[derive(Debug, Deserialize)]
struct CreateUserRequest {
    username: String,
    password: String,
    display_name: Option<String>,
    role: Option<String>,
    email: Option<String>,
    permissions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct UpdateUserRequest {
    password: Option<String>,
    display_name: Option<String>,
    role: Option<String>,
    email: Option<String>,
    is_active: Option<bool>,
    permissions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct CreateRoleRequest {
    name: String,
    description: Option<String>,
    permissions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct UpdateRoleRequest {
    name: Option<String>,
    description: Option<String>,
    permissions: Option<Vec<String>>,
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
    coverage_scope: Option<String>,
    covers_asean: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct InteroperabilityIntegrationsQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    status: Option<String>,
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
struct DiseaseConceptQuery {
    page: Option<i64>,
    per_page: Option<i64>,
    q: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CreateDiseaseConceptRequest {
    canonical_name: String,
    ontology_code: Option<String>,
    ontology_uri: Option<String>,
    ontology_release: Option<String>,
    ontology_system: Option<String>,
    source: Option<String>,
    confidence: Option<f64>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateDiseaseConceptRequest {
    canonical_name: Option<String>,
    ontology_code: Option<String>,
    ontology_uri: Option<String>,
    ontology_release: Option<String>,
    ontology_system: Option<String>,
    source: Option<String>,
    confidence: Option<f64>,
    is_active: Option<bool>,
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
    tracing::info!("connected to RabbitMQ (queue: disease.raw; SKDR IBS/EBS detached)");

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
        .route("/api/v1/ingest/raw", post(ingest))
        .route("/api/v1/collect/raw", post(ingest))
        .route("/api/v1/ingest/skdr", post(skdr_detached))
        .route("/api/v1/analyze-url", post(analyze_url))
        .route("/api/v1/analysis-jobs/:id", get(analysis_job_status))
        .route("/api/v1/crawl-jobs", post(create_crawl_job))
        .route("/api/v1/crawl-jobs/:id", get(crawl_job_status))
        .route("/api/v1/crawl-jobs/:id/reprocess", post(reprocess_crawl_job))
        .route("/api/v1/manual-crawler/jobs", post(create_crawl_job))
        .route("/api/v1/manual-crawler/jobs/:id", get(crawl_job_status))
        .route("/api/v1/manual-crawler/jobs/:id/reprocess", post(reprocess_crawl_job))
        .route("/api/v1/events", get(list_events))
        .route("/api/v1/events/stats", get(dashboard_stats))
        .route(
            "/api/v1/disease-discovery-candidates",
            get(list_disease_discovery_candidates),
        )
        .route(
            "/api/v1/disease-discovery-candidates/metrics",
            get(disease_discovery_candidate_metrics),
        )
        .route(
            "/api/v1/disease-discovery-candidates/:id/review",
            post(review_disease_discovery_candidate),
        )
        .route("/api/v1/crawling-stats", get(crawling_stats))
        .route("/api/v1/summary", get(summary))
        .route("/api/v1/public-dashboard", get(public_dashboard))
        .route("/api/v1/kpi-snapshot", get(kpi_snapshot))
        .route("/api/v1/kpi-events", get(kpi_events))
        .route("/api/v1/skdr/ibs-summary", get(skdr_detached))
        .route("/api/v1/skdr/ebs-summary", get(skdr_detached))
        .route("/api/v1/spatial-heatmap", get(spatial_heatmap))
        .route("/api/v1/disease-trend-overview", get(disease_trend_overview))
        .route("/api/v1/morbidity-mortality", get(morbidity_mortality_handler))
        .route("/api/v1/skdr-reports", get(skdr_detached))
        .route("/api/v1/dashboard/summary", get(dashboard_summary))
        .route("/api/v1/sources/summary", get(source_summary))
        .route("/api/v1/sources", get(list_sources).post(create_source))
        .route("/api/v1/sources/collect-all", post(trigger_collect_all))
        .route(
            "/api/v1/sources/:id",
            get(get_source).put(update_source).delete(delete_source),
        )
        .route("/api/v1/sources/:id/collect", post(trigger_collect))
        .route(
            "/api/v1/interoperability-integrations",
            get(list_interoperability_integrations).post(create_interoperability_integration),
        )
        .route(
            "/api/v1/interoperability-integrations/:id",
            get(get_interoperability_integration)
                .put(update_interoperability_integration)
                .delete(delete_interoperability_integration),
        )
        .route("/api/v1/runs", get(list_runs))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/v1/users", get(list_users).post(create_user))
        .route("/api/v1/users/:id", get(get_user).put(update_user).patch(update_user).delete(delete_user))
        .route("/api/v1/users/:id/edit", post(update_user))
        .route("/api/v1/roles", get(list_roles).post(create_role))
        .route("/api/v1/roles/:id", put(update_role).delete(delete_role))
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
        .route("/api/v1/disease-concepts", get(list_disease_concepts).post(create_disease_concept))
        .route("/api/v1/disease-concepts/:id", put(update_disease_concept).delete(delete_disease_concept))
        .route("/api/v1/source-credibility", get(list_source_credibility).post(create_source_credibility))
        .route("/api/v1/source-credibility/recompute", post(recompute_source_credibility))
        .route("/api/v1/source-credibility/:id", put(update_source_credibility).delete(delete_source_credibility))
        .route("/api/v1/crawl-ops", get(crawl_ops))
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
        .route("/api/v1/pipeline-health", get(pipeline_health))
        .layer(middleware::from_fn_with_state(state.clone(), auth_gate))
        .layer(security::build_cors_layer())
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

async fn pipeline_health(
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let nlp_url = format!("{}/health", state.nlp_service_url.trim_end_matches('/'));
    let nlp = match state
        .http
        .get(&nlp_url)
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            resp.json::<Value>().await.unwrap_or_else(|_| json!({"status": "ok"}))
        }
        Ok(resp) => json!({"status": "degraded", "http_status": resp.status().as_u16()}),
        Err(_) => json!({"status": "unreachable"}),
    };

    let (last_event_at, last_run, recent_runs, recent_failures) = match state.db.get().await {
        Ok(client) => {
            let last_event: Option<String> = client
                .query_opt(
                    "SELECT MAX(created_at)::text FROM disease_events",
                    &[],
                )
                .await
                .ok()
                .and_then(|row| row.and_then(|r| r.get(0)));
            let last_run = client
                .query_opt(
                    "SELECT id::text, status, started_at::text, finished_at::text, records_found, error_message
                     FROM collector_runs
                     ORDER BY started_at DESC NULLS LAST
                     LIMIT 1",
                    &[],
                )
                .await
                .ok()
                .flatten()
                .map(|r| {
                    json!({
                        "id": r.get::<_, Option<String>>(0),
                        "status": r.get::<_, Option<String>>(1),
                        "started_at": r.get::<_, Option<String>>(2),
                        "finished_at": r.get::<_, Option<String>>(3),
                        "records_found": r.get::<_, Option<i32>>(4),
                        "has_error": r.get::<_, Option<String>>(5).map(|msg| !msg.is_empty()).unwrap_or(false),
                    })
                });
            let recent = client
                .query_one(
                    "SELECT COUNT(*)::bigint AS total,
                            COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) IN ('FAILED', 'ERROR'))::bigint AS failed
                     FROM collector_runs
                     WHERE started_at >= NOW() - INTERVAL '24 hours'",
                    &[],
                )
                .await
                .ok();
            let (total, failed) = match recent {
                Some(r) => (r.get::<_, i64>(0), r.get::<_, i64>(1)),
                None => (0, 0),
            };
            (last_event, last_run, total, failed)
        }
        Err(_) => (None, None, 0, 0),
    };

    let nlp_ok = nlp.get("status").and_then(Value::as_str) == Some("ok");
    let overall = if nlp_ok { "ok" } else { "degraded" };
    Json(json!({
        "success": true,
        "data": {
            "status": overall,
            "nlp": nlp,
            "last_event_at": last_event_at,
            "last_collector_run": last_run,
            "collector_runs_24h": recent_runs,
            "collector_failures_24h": recent_failures,
        }
    }))
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
            let nlp_url = format!("{}/nlp/analyze/raw", state.nlp_service_url.trim_end_matches('/'));
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
                sentiment, event_type, relevance_score, province, city
             ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7,
                CASE WHEN $8::float8 IS NULL OR $9::float8 IS NULL THEN NULL
                     ELSE ST_SetSRID(ST_MakePoint($9, $8), 4326)
                END,
                $10::jsonb, $11::jsonb, $12,
                $13, $14, $15, $16,
                $17, $18, $19, $20, $21
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
                        &nlp.province,
                        &nlp.city,
                    ],
                )
                .await
                .map_err(|err| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": format!("Sync processing failed: {}", err) })),
                    )
                })?;

            mark_kpi_snapshots_stale(&client).await;

            Ok(Json(ApiResponse {
                success: true,
                data: json!({ "raw_report_id": raw_id, "nlp": nlp, "status": "processed_sync" }),
                total: None, page: None, per_page: None, total_pages: None,
            }))
        }
    }
}

#[allow(dead_code)]
async fn ingest_skdr(
    State(_state): State<Arc<AppState>>,
    Json(_payload): Json<IngestRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    Err(skdr_detached().await)
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

async fn analysis_job_status(
    State(state): State<Arc<AppState>>, Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let response = state.http.get(format!("{}/analysis-jobs/{}", state.collector_url, id))
        .timeout(std::time::Duration::from_secs(8)).send().await.map_err(internal_error)?;
    let status = response.status();
    let body: Value = response.json().await.map_err(internal_error)?;
    if !status.is_success() {
        return Err((StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY), Json(body)));
    }
    Ok(Json(body))
}

async fn collector_post_retry(
    client: &Client,
    url: String,
    body: Option<&Value>,
    attempts: u32,
) -> Result<reqwest::Response, String> {
    let mut last_error = String::from("collector is unavailable");
    for attempt in 0..attempts.max(1) {
        let mut request = client.post(&url).timeout(Duration::from_secs(8));
        if let Some(value) = body {
            request = request.json(value);
        }
        match request.send().await {
            Ok(response) => return Ok(response),
            Err(error) => {
                last_error = error.to_string();
                if attempt + 1 < attempts.max(1) {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }
    }
    Err(last_error)
}

async fn collector_get_retry(
    client: &Client,
    url: String,
    attempts: u32,
) -> Result<reqwest::Response, String> {
    let mut last_error = String::from("collector is unavailable");
    for attempt in 0..attempts.max(1) {
        match client.get(&url).timeout(Duration::from_secs(8)).send().await {
            Ok(response) => return Ok(response),
            Err(error) => {
                last_error = error.to_string();
                if attempt + 1 < attempts.max(1) {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            }
        }
    }
    Err(last_error)
}

async fn create_crawl_job(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let response = collector_post_retry(
        &state.http,
        format!("{}/crawl-jobs", state.collector_url),
        Some(&payload),
        5,
    ).await.map_err(internal_error)?;
    let status = response.status();
    let body: Value = response.json().await.map_err(internal_error)?;
    if !status.is_success() {
        return Err((StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY), Json(body)));
    }
    Ok(Json(body))
}

async fn crawl_job_status(
    State(state): State<Arc<AppState>>, Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let response = match collector_get_retry(
        &state.http,
        format!("{}/crawl-jobs/{}", state.collector_url, id),
        3,
    ).await {
        Ok(response) => response,
        Err(error) => {
            // The frontend keeps polling this transient state. This avoids a
            // toast storm while the collector container is still starting.
            return Ok(Json(json!({
                "success": true,
                "data": {
                    "job_id": id,
                    "status": "waiting_for_collector",
                    "discovered_count": 0,
                    "processed_count": 0,
                    "row_count": 0,
                    "warnings": [error],
                    "rows": []
                }
            })));
        }
    };
    let status = response.status();
    let body: Value = response.json().await.map_err(internal_error)?;
    if !status.is_success() {
        return Err((StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY), Json(body)));
    }
    Ok(Json(body))
}

async fn reprocess_crawl_job(
    State(state): State<Arc<AppState>>, Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let response = collector_post_retry(
        &state.http,
        format!("{}/crawl-jobs/{}/reprocess", state.collector_url, id),
        None,
        5,
    ).await.map_err(internal_error)?;
    let status = response.status();
    let body: Value = response.json().await.map_err(internal_error)?;
    if !status.is_success() {
        return Err((StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY), Json(body)));
    }
    Ok(Json(body))
}

async fn analyze_url(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AnalyzeUrlRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let url = match security::validate_public_http_url(&payload.url) {
        Ok(valid) => valid,
        Err(msg) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "success": false, "error": msg })),
            ));
        }
    };
    if url.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(json!({ "success": false, "error": "URL tidak boleh kosong" }))));
    }

    let entity_location_storage_enabled = env::var("ENTITY_LOCATION_STORAGE_ENABLED")
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(true);
    let entity_disease_storage_enabled = env::var("ENTITY_DISEASE_STORAGE_ENABLED")
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(true);

    let client = state.db.get().await.map_err(internal_error)?;

    // URL analysis caching: enabled by default unless ANALYZE_URL_USE_CACHE=false or force_refresh is requested
    let env_use_cache = env::var("ANALYZE_URL_USE_CACHE")
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(true);
    let use_analysis_cache = env_use_cache && !payload.force_refresh;

    let row = if use_analysis_cache {
        client
            .query_opt(
                "SELECT de.id, de.raw_report_id, de.original_text, rr.summary, de.language,
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
                        de.symptoms, de.disease_extracted, de.disease_mentions,
                        de.disease_classification, de.case_count, de.death_count, de.confidence,
                        de.outbreak_alert, de.sentiment, de.needs_review, de.event_type,
                        de.event_confidence::float8, de.relevance_score, de.relevance_confidence::float8,
                        de.source_credibility::float8, de.source_credibility_label, de.is_health_related
                 FROM disease_events de
                 JOIN raw_reports rr ON de.raw_report_id = rr.id
                 LEFT JOIN locations l ON LOWER(l.name) = LOWER(de.location_name)
                 WHERE rr.url = $1
                 ORDER BY de.created_at DESC
                 LIMIT 1",
                 &[&url],
            )
            .await
            .map_err(internal_error)?
    } else {
        None
    };

    if let Some(row) = row {
        // Older disease-event rows can contain NULLs because those columns
        // were populated by earlier versions of the NLP pipeline. Cache
        // reads must never panic on legacy data; a bad cached row should be
        // treated as an incomplete cache entry, not as a gateway failure.
        let original_text: String = row
            .try_get::<_, Option<String>>("original_text")
            .ok()
            .flatten()
            .unwrap_or_default();
        let cached_summary: Option<String> = row
            .try_get::<_, Option<String>>("summary")
            .ok()
            .flatten();
        let (cached_title, cached_content) = if let Some(pos) = original_text.find(".\n") {
            (original_text[..pos].to_string(), original_text[pos + 2..].to_string())
        } else {
            (String::new(), original_text.clone())
        };

        let symptoms: Vec<String> = row
            .try_get::<_, Option<serde_json::Value>>("symptoms")
            .ok()
            .flatten()
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();
        let disease_extracted: Vec<String> = row
            .try_get::<_, Option<serde_json::Value>>("disease_extracted")
            .ok()
            .flatten()
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();

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
        let cached_locations: Vec<serde_json::Value> = loc_rows.iter().filter_map(|r| {
            let name = r.try_get::<_, Option<String>>("location_name").ok().flatten()?;
            Some(json!({
                "name": name,
                "latitude": r.try_get::<_, Option<f64>>("latitude").ok().flatten(),
                "longitude": r.try_get::<_, Option<f64>>("longitude").ok().flatten(),
                "country": r.try_get::<_, Option<String>>("country").ok().flatten(),
            }))
        }).collect();

        let language = row
            .try_get::<_, Option<String>>("language")
            .ok()
            .flatten()
            .unwrap_or_else(|| "unknown".to_string());
        let disease_mentions = row
            .try_get::<_, Option<Value>>("disease_mentions")
            .ok()
            .flatten()
            .unwrap_or_else(|| json!([]));
        let disease_classification = row
            .try_get::<_, Option<String>>("disease_classification")
            .ok()
            .flatten()
            .unwrap_or_else(|| "Unknown".to_string());
        let case_count = row
            .try_get::<_, Option<i32>>("case_count")
            .ok()
            .flatten()
            .unwrap_or_default();
        let death_count = row
            .try_get::<_, Option<i32>>("death_count")
            .ok()
            .flatten()
            .unwrap_or_default();
        let confidence = row
            .try_get::<_, Option<f64>>("confidence")
            .ok()
            .flatten()
            .unwrap_or_default();

        return Ok(Json(ApiResponse {
            success: true,
            data: json!({
                "title": cached_title,
                "content": cached_content,
                "summary": cached_summary.unwrap_or_default(),
                "url": url,
                "published_at": row.get::<_, Option<NaiveDate>>("published_at").map(|date| date.to_string()),
                "language": language,
                "location_name": row.try_get::<_, Option<String>>("location_name").ok().flatten(),
                "latitude": row.try_get::<_, Option<f64>>("latitude").ok().flatten(),
                "longitude": row.try_get::<_, Option<f64>>("longitude").ok().flatten(),
                "country": row.try_get::<_, Option<String>>("country").ok().flatten(),
                "locations": cached_locations,
                "symptoms": symptoms,
                "disease_extracted": disease_extracted,
                "disease_mentions": disease_mentions,
                "disease_classification": disease_classification,
                "case_count": case_count,
                "death_count": death_count,
                "confidence": confidence,
                "sentiment": row.try_get::<_, Option<String>>("sentiment").ok().flatten(),
                "sentiment_score": Value::Null,
                "event_type": row.try_get::<_, Option<String>>("event_type").ok().flatten(),
                "event_confidence": row.try_get::<_, Option<f64>>("event_confidence").ok().flatten(),
                "relevance_score": row.try_get::<_, Option<String>>("relevance_score").ok().flatten(),
                "relevance_confidence": row.try_get::<_, Option<f64>>("relevance_confidence").ok().flatten(),
                "source_credibility": row.try_get::<_, Option<f64>>("source_credibility").ok().flatten(),
                "source_credibility_label": row.try_get::<_, Option<String>>("source_credibility_label").ok().flatten(),
                "needs_review": row.try_get::<_, Option<bool>>("needs_review").ok().flatten(),
                "is_health_related": row.try_get::<_, Option<bool>>("is_health_related").ok().flatten(),
                "raw_report_id": raw_report_id,
                "event_id": event_id,
                "sources": Value::Object(sources),
                "cached": true,
            }),
            total: None,
            page: None,
            per_page: None,
            total_pages: None,
        }))
    }

    // Async is the safe default for interactive URL analysis. Set the
    // environment variable to false only when intentionally using the legacy
    // synchronous path during a controlled rollback.
    let async_enabled = env::var("ANALYZE_URL_ASYNC_ENABLED")
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(true);
    if payload.asynchronous && async_enabled {
        let response = state.http.post(format!("{}/analysis-jobs", state.collector_url))
            .json(&json!({"url": url, "force_refresh": payload.force_refresh})).timeout(std::time::Duration::from_secs(8))
            .send().await.map_err(internal_error)?;
        let status = response.status();
        let body: Value = response.json().await.map_err(internal_error)?;
        if !status.is_success() {
            return Err((StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY), Json(body)));
        }
        return Ok(Json(ApiResponse { success: true, data: body["data"].clone(),
            total: None, page: None, per_page: None, total_pages: None }));
    }

    let collector_endpoint = format!("{}/extract-url", state.collector_url.trim_end_matches('/'));
    let resp = state
        .http
        .post(&collector_endpoint)
        .json(&json!({ "url": url, "fetch_mode": "http", "timeout_ms": 18000, "max_retries": 0 }))
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
        let mapped_status = if status.as_u16() == 408 {
            StatusCode::GATEWAY_TIMEOUT
        } else {
            StatusCode::BAD_REQUEST
        };
        return Err((mapped_status, Json(json!({
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

    // Keep the synchronous fallback on the dedicated interactive URL route;
    // bulk/raw ingestion uses /nlp/analyze/raw in the collector worker.
    let nlp_url = format!("{}/nlp/analyze/url", state.nlp_service_url.trim_end_matches('/'));
    let nlp: NlpResponse = state
        .http
        .post(&nlp_url)
        .json(&json!({
            "text": text,
            "source_type": "web",
            "source_name": "URL Analyzer",
            "source_url": url,
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
            "INSERT INTO raw_reports (source_type, source_name, original_text, summary, url, processing_status)
             VALUES ($1, $2, $3, $4, $5, 'PROCESSED') RETURNING id",
            &[&"web", &"URL Analyzer", &text, &nlp.summary, &url],
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
                case_count, death_count, confidence, outbreak_alert, disease_mentions,
                sentiment, needs_review, event_type, event_confidence,
                relevance_score, relevance_confidence, source_credibility,
                source_credibility_label, is_health_related, province, city
             ) VALUES (
                $1, $2, $3, $4, $5,
                $6,
                CASE WHEN $7::float8 IS NULL OR $8::float8 IS NULL THEN NULL
                     ELSE ST_SetSRID(ST_MakePoint($8, $7), 4326)
                END,
                 $9::jsonb, $10::jsonb, $11,
                 $12, $13, $14, $15,
                 $16::jsonb,
                 $17, $18, $19, $20::float8,
                 $21, $22::float8, $23::float8,
                 $24, $25, $26, $27
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
                &json!(nlp.disease_mentions),
                &nlp.sentiment,
                &nlp.needs_review.unwrap_or(false),
                &nlp.event_type,
                &nlp.event_confidence,
                &nlp.relevance_score,
                &nlp.relevance_confidence,
                &nlp.source_credibility,
                &nlp.source_credibility_label,
                &nlp.is_health_related,
                &nlp.province,
                &nlp.city,
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

    if entity_disease_storage_enabled {
        let mut mentions = nlp.disease_mentions.clone();
        if mentions.is_empty() {
            mentions.push(json!({
                "surface_form": nlp.disease_classification,
                "canonical_name": nlp.disease_classification,
                "role": "primary",
                "confidence": nlp.confidence,
                "resolution_source": "legacy_primary",
            }));
        }
        for mention in mentions {
            let disease_name = mention
                .get("canonical_name")
                .and_then(Value::as_str)
                .or_else(|| mention.get("surface_form").and_then(Value::as_str))
                .unwrap_or("")
                .trim()
                .to_string();
            if disease_name.is_empty()
                || disease_name.eq_ignore_ascii_case("unknown")
                || disease_name.to_ascii_uppercase().starts_with("NEGATIVE")
            {
                continue;
            }
            let surface_form = mention
                .get("surface_form")
                .and_then(Value::as_str)
                .unwrap_or(&disease_name)
                .to_string();
            let is_primary = mention
                .get("role")
                .and_then(Value::as_str)
                .map(|role| role.eq_ignore_ascii_case("primary"))
                .unwrap_or(false)
                || disease_name.eq_ignore_ascii_case(&nlp.disease_classification);
            let role = if is_primary { "primary" } else { "mentioned" };
            let case_count = if is_primary { Some(nlp.case_count) } else { None };
            let death_count = if is_primary { Some(nlp.death_count) } else { None };
            let icd11_code = mention
                .get("icd11_code")
                .and_then(Value::as_str)
                .map(str::to_string);
            let confidence = mention
                .get("confidence")
                .and_then(Value::as_f64)
                .or(Some(nlp.confidence));
            let evidence = mention
                .get("evidence")
                .and_then(Value::as_str)
                .map(str::to_string);
            let resolution_source = mention
                .get("resolution_source")
                .and_then(Value::as_str)
                .map(str::to_string);
            client
                .execute(
                    "INSERT INTO disease_event_diseases
                       (disease_event_id, surface_form, disease_name, role,
                        icd11_code, confidence, case_count, death_count,
                        evidence, resolution_source)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                     ON CONFLICT (disease_event_id, disease_name, role) DO UPDATE SET
                       surface_form = EXCLUDED.surface_form,
                       icd11_code = EXCLUDED.icd11_code,
                       confidence = EXCLUDED.confidence,
                       case_count = EXCLUDED.case_count,
                       death_count = EXCLUDED.death_count,
                       evidence = EXCLUDED.evidence,
                       resolution_source = EXCLUDED.resolution_source",
                    &[
                        &event_id,
                        &surface_form,
                        &disease_name,
                        &role,
                        &icd11_code,
                        &confidence,
                        &case_count,
                        &death_count,
                        &evidence,
                        &resolution_source,
                    ],
                )
                .await
                .map_err(internal_error)?;
        }
    }

    let mut entity_locations = nlp.locations.clone();
    if entity_locations.is_empty() {
        if let Some(name) = nlp.location_name.clone() {
            entity_locations.push(LocationItem {
                name,
                latitude: nlp.latitude,
                longitude: nlp.longitude,
                country: nlp.country.clone(),
                geocode_confidence: nlp.geocode_confidence,
                geocode_needs_review: nlp.geocode_needs_review,
            });
        }
    }
    if entity_location_storage_enabled {
        for loc in &entity_locations {
            let is_event_location = Some(&loc.name) == nlp.location_name.as_ref();
            let role = if is_event_location { "event" } else { "other" };
            let case_count = if is_event_location { Some(nlp.case_count) } else { None };
            let death_count = if is_event_location { Some(nlp.death_count) } else { None };
            let geocode_confidence = loc.geocode_confidence.or(if is_event_location {
                nlp.geocode_confidence
            } else {
                None
            });
            let geocode_needs_review = loc.geocode_needs_review.unwrap_or(
                is_event_location && nlp.geocode_needs_review.unwrap_or(false),
            );
            client
                .execute(
                    "INSERT INTO disease_event_locations
                       (disease_event_id, location_ref, location_name, role, country,
                        latitude, longitude, case_count, death_count, evidence,
                        geocode_confidence, geocode_needs_review)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                     ON CONFLICT (disease_event_id, location_ref, role) DO UPDATE SET
                       country = EXCLUDED.country,
                       latitude = EXCLUDED.latitude,
                       longitude = EXCLUDED.longitude,
                       case_count = EXCLUDED.case_count,
                       death_count = EXCLUDED.death_count,
                       evidence = EXCLUDED.evidence,
                       geocode_confidence = EXCLUDED.geocode_confidence,
                       geocode_needs_review = EXCLUDED.geocode_needs_review",
                    &[
                        &event_id,
                        &loc.name,
                        &loc.name,
                        &role,
                        &loc.country,
                        &loc.latitude,
                        &loc.longitude,
                        &case_count,
                        &death_count,
                        &Option::<String>::None,
                        &geocode_confidence,
                        &geocode_needs_review,
                    ],
                )
                .await
                .map_err(internal_error)?;
        }
    } else {
    for loc in &entity_locations {
        if Some(&loc.name) == nlp.location_name.as_ref() {
            continue;
        }
        let sec_event_id: Option<Uuid> = client
            .query_opt(
                "INSERT INTO disease_events (
                    raw_report_id, source_type, source_name, original_text, language,
                    location_name, geom, symptoms, disease_extracted, disease_classification,
                    case_count, death_count, confidence, outbreak_alert, disease_mentions,
                    sentiment, needs_review, event_type, event_confidence,
                    relevance_score, relevance_confidence, source_credibility,
                    source_credibility_label, is_health_related, province, city
                 ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6,
                    CASE WHEN $7::float8 IS NULL OR $8::float8 IS NULL THEN NULL
                         ELSE ST_SetSRID(ST_MakePoint($8, $7), 4326)
                    END,
                     $9::jsonb, $10::jsonb, $11,
                     $12, $13, $14, $15,
                     $16::jsonb,
                     $17, $18, $19, $20::float8,
                     $21, $22::float8, $23::float8,
                     $24, $25, $26, $27
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
                    &json!(nlp.disease_mentions),
                    &nlp.sentiment,
                    &nlp.needs_review.unwrap_or(false),
                    &nlp.event_type,
                    &nlp.event_confidence,
                    &nlp.relevance_score,
                    &nlp.relevance_confidence,
                    &nlp.source_credibility,
                    &nlp.source_credibility_label,
                    &nlp.is_health_related,
                    &nlp.province,
                    &nlp.city,
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
    }

    mark_kpi_snapshots_stale(&client).await;

    let mut sources = serde_json::Map::new();
    sources.insert("title".to_string(), json!("Extracted by Scrapling/Trafilatura from article title"));
    sources.insert("content".to_string(), json!(format!(
        "Clean main content extracted via collector (mode: {}, HTTP: {})",
        fetch_mode.as_deref().unwrap_or("unknown"),
        http_status.map(|s| s.to_string()).unwrap_or_else(|| "unknown".to_string())
    )));
    sources.insert("summary".to_string(), json!("Generated by deterministic evidence-preserving NLP summarization"));
    sources.insert("language".to_string(), json!("Detected by Language Detection library (langdetect)"));
    sources.insert("location_name".to_string(), json!("Matched from geographic database (locations table) based on place name mentions in text"));
    sources.insert("symptoms".to_string(), json!("Identified via symptom keyword matching from NLP Keywords database ('symptom' category)"));
    sources.insert("disease_extracted".to_string(), json!("Identified via disease keyword matching from NLP Keywords database ('disease' category)"));
    sources.insert("disease_classification".to_string(), json!("Classified by XLM-RoBERTa AI model using zero-shot classification with disease labels from NLP Labels database"));
    sources.insert("case_count".to_string(), json!("Extracted using regex patterns: numeric count followed by terms like 'cases', 'patients', or 'residents'"));
    sources.insert("death_count".to_string(), json!("Extracted using regex patterns: numeric count followed by terms like 'deaths' or 'fatalities'"));
    sources.insert("confidence".to_string(), json!("Confidence score from the AI classification model — higher indicates higher certainty"));
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
            "summary": nlp.summary,
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
            "disease_mentions": nlp.disease_mentions,
            "disease_classification": nlp.disease_classification,
            "case_count": nlp.case_count,
            "case_count_unknown": nlp.case_count_unknown.unwrap_or(false),
            "death_count": nlp.death_count,
            "province": nlp.province,
            "city": nlp.city,
            "evidence": nlp.evidence,
            "confidence": nlp.confidence,
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
            "cached": false,
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

fn page_params(page: Option<i64>, per_page: Option<i64>) -> (i64, i64, i64) {
    build_pagination(page, per_page)
}

fn calc_total_pages(total: i64, per_page: i64) -> i64 {
    if total == 0 { 1 } else { (total as f64 / per_page as f64).ceil() as i64 }
}

fn validate_candidate_review(
    status: &str,
    resolved_concept_id: Option<Uuid>,
) -> Result<(), &'static str> {
    match status {
        "resolved" if resolved_concept_id.is_some() => Ok(()),
        "resolved" => Err("resolved candidates require resolved_concept_id"),
        "rejected" => Ok(()),
        "pending" => Err("pending is not a review action"),
        _ => Err("status must be resolved or rejected"),
    }
}

async fn list_disease_discovery_candidates(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DiseaseCandidateQuery>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let requested_status = query.status.as_deref().unwrap_or("pending");
    if !matches!(requested_status, "pending" | "resolved" | "rejected" | "all") {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "status must be pending, resolved, rejected, or all"})),
        ));
    }

    let (page, per_page, offset) = page_params(query.page, query.per_page);
    let status_filter = if requested_status == "all" {
        None
    } else {
        Some(requested_status.to_string())
    };
    let language_filter = query
        .language
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let client = state.db.get().await.map_err(internal_error)?;
    let total: i64 = client
        .query_one(
            "SELECT COUNT(*)::bigint
             FROM disease_discovery_candidates
             WHERE ($1::text IS NULL OR status = $1)
               AND ($2::text IS NULL OR language = $2)",
            &[&status_filter, &language_filter],
        )
        .await
        .map_err(internal_error)?
        .get(0);
    let rows = client
        .query(
            "SELECT id, surface_form, normalized_form, language, sample_text,
                    source_url, status, resolved_concept_id, provider,
                    confidence, occurrences, created_at::text, updated_at::text
             FROM disease_discovery_candidates
             WHERE ($1::text IS NULL OR status = $1)
               AND ($2::text IS NULL OR language = $2)
             ORDER BY updated_at DESC, occurrences DESC
             LIMIT $3 OFFSET $4",
            &[&status_filter, &language_filter, &per_page, &offset],
        )
        .await
        .map_err(internal_error)?;

    let items = rows
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<_, Uuid>("id"),
                "surface_form": row.get::<_, String>("surface_form"),
                "normalized_form": row.get::<_, String>("normalized_form"),
                "language": row.get::<_, Option<String>>("language"),
                "sample_text": row.get::<_, Option<String>>("sample_text"),
                "source_url": row.get::<_, Option<String>>("source_url"),
                "status": row.get::<_, String>("status"),
                "resolved_concept_id": row.get::<_, Option<Uuid>>("resolved_concept_id"),
                "provider": row.get::<_, Option<String>>("provider"),
                "confidence": row.get::<_, Option<f64>>("confidence"),
                "occurrences": row.get::<_, i32>("occurrences"),
                "created_at": row.get::<_, String>("created_at"),
                "updated_at": row.get::<_, String>("updated_at"),
            })
        })
        .collect::<Vec<_>>();

    Ok(Json(ApiResponse {
        success: true,
        data: json!({"items": items}),
        total: Some(total),
        page: Some(page),
        per_page: Some(per_page),
        total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

async fn disease_discovery_candidate_metrics(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let rows = client
        .query(
            "WITH counts AS (
                 SELECT COALESCE(NULLIF(language, ''), 'unknown') AS language,
                        status, COUNT(*)::bigint AS count,
                        SUM(occurrences)::bigint AS occurrences
                 FROM disease_discovery_candidates
                 GROUP BY 1, status
             ), totals AS (
                 SELECT language, SUM(count)::bigint AS total
                 FROM counts
                 GROUP BY language
             )
             SELECT counts.language, counts.status, counts.count,
                    counts.occurrences,
                    ROUND((counts.count::numeric * 100 / NULLIF(totals.total, 0)), 2)::float8
                        AS percentage
             FROM counts
             JOIN totals USING (language)
             ORDER BY counts.language, counts.status",
            &[],
        )
        .await
        .map_err(internal_error)?;
    let by_language = rows
        .iter()
        .map(|row| {
            json!({
                "language": row.get::<_, String>("language"),
                "status": row.get::<_, String>("status"),
                "count": row.get::<_, i64>("count"),
                "occurrences": row.get::<_, Option<i64>>("occurrences").unwrap_or(0),
                "percentage": row.get::<_, Option<f64>>("percentage").unwrap_or(0.0),
            })
        })
        .collect::<Vec<_>>();
    let unknown_rows = client
        .query(
            "WITH totals AS (
                 SELECT COALESCE(NULLIF(language, ''), 'unknown') AS language,
                        COUNT(*)::bigint AS total
                 FROM disease_events
                 GROUP BY 1
             ), unknowns AS (
                 SELECT COALESCE(NULLIF(language, ''), 'unknown') AS language,
                        COUNT(*)::bigint AS count
                 FROM disease_events
                 WHERE UPPER(COALESCE(disease_classification, 'UNKNOWN')) = 'UNKNOWN'
                 GROUP BY 1
             )
             SELECT totals.language, COALESCE(unknowns.count, 0)::bigint AS count,
                    ROUND((COALESCE(unknowns.count, 0)::numeric * 100 /
                           NULLIF(totals.total, 0)), 2)::float8 AS percentage
             FROM totals
             LEFT JOIN unknowns USING (language)
             ORDER BY totals.language",
            &[],
        )
        .await
        .map_err(internal_error)?;
    let unknown_by_language = unknown_rows
        .iter()
        .map(|row| {
            json!({
                "language": row.get::<_, String>("language"),
                "count": row.get::<_, i64>("count"),
                "percentage": row.get::<_, Option<f64>>("percentage").unwrap_or(0.0),
            })
        })
        .collect::<Vec<_>>();
    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "by_language": by_language,
            "unknown_events_by_language": unknown_by_language,
        }),
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
}

async fn review_disease_discovery_candidate(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<ReviewDiseaseCandidateRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    if let Err(message) =
        validate_candidate_review(&payload.status, payload.resolved_concept_id)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": message})),
        ));
    }
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_opt(
            "UPDATE disease_discovery_candidates
             SET status = $2, resolved_concept_id = $3, updated_at = NOW()
             WHERE id = $1
             RETURNING id, surface_form, status, resolved_concept_id,
                       updated_at::text",
            &[&id, &payload.status, &payload.resolved_concept_id],
        )
        .await
        .map_err(internal_error)?;
    let Some(row) = row else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "error": "Disease candidate not found"})),
        ));
    };
    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "id": row.get::<_, Uuid>("id"),
            "surface_form": row.get::<_, String>("surface_form"),
            "status": row.get::<_, String>("status"),
            "resolved_concept_id": row.get::<_, Option<Uuid>>("resolved_concept_id"),
            "updated_at": row.get::<_, String>("updated_at"),
        }),
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
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
                    e.is_health_related, e.province, e.city
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
            "province": r.get::<_, Option<String>>(24),
            "city": r.get::<_, Option<String>>(25),
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
            "SELECT COALESCE(disease_classification, 'UNKNOWN') AS name, SUM(GREATEST(LEAST(COALESCE(case_count, 0), 2000000), 0)) AS cases, SUM(GREATEST(LEAST(COALESCE(death_count, 0), 200000), 0)) AS deaths
             FROM disease_events e WHERE is_health_related = TRUE
               AND LOWER(COALESCE(source_type, '')) <> 'test'
               AND disease_classification IS NOT NULL
               AND UPPER(disease_classification) <> 'UNKNOWN'
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
               AND LOWER(COALESCE(source_type, '')) <> 'test'
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

async fn crawling_stats(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CrawlingStatsQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let selected_country = query
        .country
        .filter(|value| !value.trim().is_empty() && value != "all" && value != "ASEAN");

    let summary_row = client
        .query_one(
            "WITH report_scope AS (
               SELECT DISTINCT rr.id, rr.created_at, rr.processing_status, rr.source_type
               FROM raw_reports rr
               LEFT JOIN disease_events e ON e.raw_report_id = rr.id
               LEFT JOIN LATERAL (
                 SELECT l0.country
                 FROM locations l0
                 WHERE LOWER(l0.name) = LOWER(e.location_name) AND l0.is_active = TRUE
                 ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
                 LIMIT 1
               ) l ON TRUE
               WHERE $1::text IS NULL OR LOWER(
                 CASE
                   WHEN LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia'
                   ELSE COALESCE(l.country, CASE
                     WHEN LOWER(e.location_name) IN ('brunei', 'brunei darussalam') THEN 'Brunei'
                     WHEN LOWER(e.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                       THEN INITCAP(LOWER(e.location_name))
                     ELSE 'OUTSIDE ASEAN'
                   END)
                 END
               ) = LOWER($1)
             ),
             active_runs AS (
               SELECT
                 COUNT(*)::BIGINT AS active_run_count,
                 COALESCE(SUM(records_found), 0)::BIGINT AS active_records_found,
                 MIN(started_at)::text AS active_since
               FROM collector_runs
               WHERE status = 'RUNNING'
                 AND finished_at IS NULL
                 AND started_at >= NOW() - INTERVAL '30 minutes'
             ),
             run_totals AS (
               SELECT COALESCE(SUM(records_found), 0)::BIGINT AS historical_crawled
               FROM collector_runs
               WHERE status <> 'RUNNING'
             ),
             active_received AS (
               SELECT COUNT(*)::BIGINT AS current_live_crawl
               FROM report_scope rr
               WHERE EXISTS (
                 SELECT 1
                 FROM collector_runs cr
                 WHERE cr.status = 'RUNNING'
                   AND cr.finished_at IS NULL
                   AND cr.started_at >= NOW() - INTERVAL '30 minutes'
                   AND rr.created_at >= cr.started_at
               )
             )
             SELECT
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) AS this_month,
               COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
                                  AND created_at < date_trunc('month', NOW())) AS last_month,
               COUNT(*) FILTER (WHERE processing_status = 'PROCESSED') AS total_processed,
               COUNT(*) FILTER (WHERE processing_status IN ('PROCESSED', 'NON_HEALTH')) AS stored_in_db,
               COUNT(*) FILTER (WHERE processing_status IN ('NEW', 'PROCESSING')) AS nlp_processing,
               TO_CHAR(date_trunc('month', NOW()), 'YYYY-MM') AS current_month_label,
               TO_CHAR(date_trunc('month', NOW()) - INTERVAL '1 month', 'YYYY-MM') AS previous_month_label,
               ar.active_run_count,
               ar.active_since,
               CASE WHEN $1::text IS NULL
                 THEN GREATEST(ar.active_records_found, received.current_live_crawl)
                 ELSE received.current_live_crawl
               END AS live_crawled,
               received.current_live_crawl,
               CASE WHEN $1::text IS NULL
                 THEN totals.historical_crawled + received.current_live_crawl
                 ELSE COUNT(*)
               END AS total_crawled_all_time,
               CASE WHEN ar.active_run_count > 0 THEN 'RUNNING' ELSE 'IDLE' END AS collector_status,
               MAX(created_at)::text AS last_report_at
             FROM report_scope
             CROSS JOIN active_runs ar
             CROSS JOIN active_received received
             CROSS JOIN run_totals totals
             GROUP BY ar.active_run_count, ar.active_since, ar.active_records_found,
                      received.current_live_crawl, totals.historical_crawled",
            &[&selected_country],
        )
        .await
        .map_err(internal_error)?;

    let total: i64 = summary_row.get("total");
    let this_month: i64 = summary_row.get("this_month");
    let last_month: i64 = summary_row.get("last_month");
    let total_processed: i64 = summary_row.get("total_processed");
    let stored_in_db: i64 = summary_row.get("stored_in_db");
    let nlp_processing: i64 = summary_row.get("nlp_processing");
    let current_month_label: String = summary_row
        .get::<_, Option<String>>("current_month_label")
        .unwrap_or_default();
    let previous_month_label: String = summary_row
        .get::<_, Option<String>>("previous_month_label")
        .unwrap_or_default();
    let active_run_count: i64 = summary_row.get("active_run_count");
    let active_since: Option<String> = summary_row.get("active_since");
    let live_crawled: i64 = summary_row.get("live_crawled");
    let current_live_crawl: i64 = summary_row.get("current_live_crawl");
    let total_crawled_all_time: i64 = summary_row.get("total_crawled_all_time");
    let collector_status: String = summary_row.get("collector_status");
    let last_report_at: Option<String> = summary_row.get("last_report_at");

    let by_source_rows = client
        .query(
            "WITH report_scope AS (
               SELECT DISTINCT rr.id, rr.created_at, rr.processing_status, rr.source_type
               FROM raw_reports rr
               LEFT JOIN disease_events e ON e.raw_report_id = rr.id
               LEFT JOIN LATERAL (
                 SELECT l0.country FROM locations l0
                 WHERE LOWER(l0.name) = LOWER(e.location_name) AND l0.is_active = TRUE
                 ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
                 LIMIT 1
               ) l ON TRUE
               WHERE $1::text IS NULL OR LOWER(
                 CASE WHEN LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api') THEN 'Indonesia'
                 ELSE COALESCE(l.country, CASE
                   WHEN LOWER(e.location_name) IN ('brunei', 'brunei darussalam') THEN 'Brunei'
                   WHEN LOWER(e.location_name) IN ('cambodia','indonesia','laos','malaysia','myanmar','philippines','singapore','thailand','timor-leste','vietnam')
                     THEN INITCAP(LOWER(e.location_name))
                   ELSE 'OUTSIDE ASEAN' END) END
               ) = LOWER($1)
             )
             SELECT COALESCE(source_type, 'unknown') AS source_type,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE processing_status = 'PROCESSED') AS processed,
               COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) AS this_month
             FROM report_scope
             WHERE LOWER(COALESCE(source_type, '')) <> 'test'
             GROUP BY source_type
             ORDER BY total DESC",
            &[&selected_country],
        )
        .await
        .map_err(internal_error)?;

    let by_source_type: Vec<serde_json::Value> = by_source_rows
        .iter()
        .map(|r| {
            json!({
                "source_type": r.get::<_, String>("source_type"),
                "total": r.get::<_, i64>("total"),
                "processed": r.get::<_, i64>("processed"),
                "this_month": r.get::<_, i64>("this_month"),
            })
        })
        .collect();

    let crawl_meta = client
        .query_opt(
            "SELECT
                COUNT(*) FILTER (WHERE enabled = TRUE AND LOWER(COALESCE(source_type,'')) <> 'skdr_api')::bigint AS enabled_sources,
                (SELECT MAX(COALESCE(finished_at, started_at))::text FROM collector_runs) AS last_run_at
             FROM collector_sources",
            &[],
        )
        .await
        .ok()
        .flatten();
    let enabled_sources = crawl_meta
        .as_ref()
        .map(|row| row.get::<_, i64>("enabled_sources"))
        .unwrap_or(0);
    let last_run_at: Option<String> = crawl_meta
        .as_ref()
        .and_then(|row| row.get::<_, Option<String>>("last_run_at"));

    Ok(Json(json!({
        "success": true,
        "data": {
            "total": total,
            "this_month": this_month,
            "last_month": last_month,
            "total_processed": total_processed,
            "stored_in_db": stored_in_db,
            "nlp_processing": nlp_processing,
            "current_month": current_month_label,
            "previous_month": previous_month_label,
            "live_crawled": live_crawled,
            "current_live_crawl": current_live_crawl,
            "total_crawled_all_time": total_crawled_all_time,
            "active_run_count": active_run_count,
            "active_since": active_since,
            "collector_status": collector_status,
            "last_report_at": last_report_at,
            "last_run_at": last_run_at,
            "enabled_sources": enabled_sources,
            "crawler_mode": "continuous_interval_with_backoff",
            "by_source_type": by_source_type,
        }
    })))
}


async fn spatial_heatmap(
    State(state): State<Arc<AppState>>,
    Query(query): Query<HeatmapQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let selected_year = query.year.unwrap_or_else(|| chrono::Utc::now().year());
    let (start_date, end_date) = default_kpi_dates(
        query.year,
        query.start_year,
        query.start_week,
        query.end_year,
        query.end_week,
    );
    let country_key = resolve_kpi_country(&query.country, &query.scope);
    let disease_key = canonical_kpi_disease(&query.disease);
    let source_key = canonical_kpi_source(&None);
    let selected_country = sql_country_param(&country_key);
    let selected_disease = sql_disease_param(&disease_key);
    let resolved = resolved_country_expr("ranked", "l");
    let scope = country_scope_sql();

    let rows = client
        .query(
            &format!(
            "WITH ranked AS (
               SELECT e.*, rr.url AS report_url,
                      ROW_NUMBER() OVER (
                        PARTITION BY COALESCE(NULLIF(rr.url, ''), e.raw_report_id::text, e.id::text)
                        ORDER BY e.confidence DESC NULLS LAST, e.created_at DESC
                      ) AS dedup_rank
               FROM disease_events e
               LEFT JOIN raw_reports rr ON rr.id = e.raw_report_id
               WHERE (e.is_health_related = TRUE AND LOWER(COALESCE(e.source_type, '')) NOT IN ('skdr', 'skdr_api'))
                 AND e.disease_classification IS NOT NULL
                 AND UPPER(e.disease_classification) <> 'UNKNOWN'
                 AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
                 AND (COALESCE(e.confidence, 0) >= 0.15)
                 AND e.published_at IS NOT NULL
                 AND LOWER(COALESCE(e.source_type, '')) <> 'test'
                 AND e.published_at::date >= $1 AND e.published_at::date <= $2
             ), valid AS (
               SELECT ranked.*,
                      {resolved} AS resolved_country
               FROM ranked
               LEFT JOIN LATERAL (
                 SELECT l0.* FROM locations l0
                 WHERE LOWER(l0.name) = LOWER(ranked.location_name) AND l0.is_active = TRUE
                 ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
                 LIMIT 1
               ) l ON TRUE
               WHERE ranked.dedup_rank = 1
             )
             SELECT resolved_country AS country,
                    EXTRACT(MONTH FROM published_at)::int AS month_num,
                    TO_CHAR(published_at, 'Mon') AS month_name,
                    SUM(GREATEST(LEAST(COALESCE(case_count, 0), 2000000), 0))::bigint AS cases,
                    SUM(GREATEST(LEAST(COALESCE(death_count, 0), 200000), 0))::bigint AS deaths,
                    COUNT(*)::bigint AS event_count,
                    COUNT(*) FILTER (WHERE outbreak_alert = TRUE)::bigint AS alert_count
             FROM valid
             WHERE {scope}
               AND ($4::text IS NULL OR LOWER(disease_classification) = LOWER($4) OR LOWER(disease_classification) LIKE '%' || LOWER($4) || '%')
             GROUP BY resolved_country, 2, 3
             ORDER BY resolved_country, month_num"
            ),
            &[&start_date, &end_date, &selected_country, &selected_disease],
        )
        .await
        .map_err(internal_error)?;

    let asean_list = vec![
        ("Philippines", "PH"),
        ("Indonesia", "ID"),
        ("Malaysia", "MY"),
        ("Vietnam", "VN"),
        ("Thailand", "TH"),
        ("Singapore", "SG"),
        ("Cambodia", "KH"),
        ("Myanmar", "MM"),
        ("Brunei", "BN"),
        ("Laos", "LA"),
        ("Timor-Leste", "TL"),
    ];

    let month_names = vec![
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    let mut country_data = Vec::new();
    let mut grand_cases: i64 = 0;
    let mut grand_deaths: i64 = 0;
    let mut grand_events: i64 = 0;

    for (cname, iso) in asean_list {
        let mut months = Vec::new();
        let mut c_cases: i64 = 0;
        let mut c_deaths: i64 = 0;
        let mut c_events: i64 = 0;

        for m_idx in 1..=12 {
            let m_name = month_names[m_idx - 1];
            let row_match = rows.iter().find(|r| {
                let r_country: String = r.get("country");
                let r_month: i32 = r.get("month_num");
                r_country.eq_ignore_ascii_case(cname) && r_month == m_idx as i32
            });

            if let Some(r) = row_match {
                let cases: i64 = r.get("cases");
                let deaths: i64 = r.get("deaths");
                let events: i64 = r.get("event_count");
                let alerts: i64 = r.get("alert_count");

                c_cases += cases;
                c_deaths += deaths;
                c_events += events;

                months.push(json!({
                    "month_num": m_idx,
                    "month_name": m_name,
                    "cases": cases,
                    "deaths": deaths,
                    "events": events,
                    "alerts": alerts,
                }));
            } else {
                months.push(json!({
                    "month_num": m_idx,
                    "month_name": m_name,
                    "cases": 0,
                    "deaths": 0,
                    "events": 0,
                    "alerts": 0,
                }));
            }
        }

        grand_cases += c_cases;
        grand_deaths += c_deaths;
        grand_events += c_events;

        country_data.push(json!({
            "country": cname,
            "iso": iso,
            "total_cases": c_cases,
            "total_deaths": c_deaths,
            "total_events": c_events,
            "months": months,
        }));
    }

    let snapshot = load_or_refresh_kpi_snapshot(
        &client,
        start_date,
        end_date,
        &country_key,
        &disease_key,
        &source_key,
    )
    .await?;
    let shared = &snapshot.kpis;

    Ok(Json(json!({
        "success": true,
        "data": {
            "year": selected_year,
            "countries": country_data,
            "summary": {
                "total_countries": 11,
                "total_cases": shared.cases,
                "total_deaths": shared.deaths,
                "total_events": shared.events,
                "active_locations": shared.active_locations,
                "location_master_count": shared.location_master_count,
                "grid_cases": grand_cases,
                "grid_deaths": grand_deaths,
                "grid_events": grand_events,
                "kpi_source": "materialized_kpi_snapshot",
                "snapshot_id": snapshot.id,
                "snapshot_computed_at": snapshot.computed_at,
                "snapshot_filter_key": snapshot.filter_key,
                "snapshot_stale": snapshot.is_stale,
            }
        }
    })))
}


fn iso_code_for_country(name: &str) -> &'static str {
    match name.to_ascii_lowercase().as_str() {
        "philippines" => "PH",
        "vietnam" | "viet nam" => "VN",
        "indonesia" => "ID",
        "malaysia" => "MY",
        "thailand" => "TH",
        "singapore" => "SG",
        "cambodia" => "KH",
        "myanmar" => "MM",
        "brunei" | "brunei darussalam" => "BN",
        "laos" | "lao pdr" => "LA",
        "timor-leste" => "TL",
        _ => "OTHER",
    }
}

async fn disease_trend_overview(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TrendOverviewQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let _days_count = query.days.unwrap_or(7).clamp(3, 90);
    let (start_date, end_date) = default_kpi_dates(
        None,
        query.start_year,
        query.start_week,
        query.end_year,
        query.end_week,
    );
    let country_key = resolve_kpi_country(&query.country, &query.scope);
    let disease_key = canonical_kpi_disease(&query.disease);
    let source_key = canonical_kpi_source(&None);
    let selected_country = sql_country_param(&country_key);
    let selected_disease = sql_disease_param(&disease_key);
    let trend_days = (end_date - start_date).num_days().saturating_add(1) as i32;
    let trend_resolved = resolved_country_expr("ranked", "l");
    let trend_scope = country_scope_sql();

    let rows = client.query(
        &format!(
        "WITH ranked AS (
           SELECT e.*, rr.url AS report_url,
                  ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(NULLIF(rr.url, ''), e.raw_report_id::text, e.id::text)
                    ORDER BY e.confidence DESC NULLS LAST, e.created_at DESC
                  ) AS dedup_rank
           FROM disease_events e
           LEFT JOIN raw_reports rr ON rr.id = e.raw_report_id
           WHERE (e.is_health_related = TRUE AND LOWER(COALESCE(e.source_type, '')) NOT IN ('skdr', 'skdr_api'))
             AND e.disease_classification IS NOT NULL
             AND UPPER(e.disease_classification) NOT IN ('UNKNOWN')
             AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
             AND (COALESCE(e.confidence, 0) >= 0.15)
             AND e.published_at IS NOT NULL
             AND LOWER(COALESCE(e.source_type, '')) <> 'test'
         ), valid AS (
           SELECT ranked.*,
                  {trend_resolved} AS resolved_country,
                  CASE
                    WHEN LOWER(ranked.disease_classification) LIKE '%dengue%' OR UPPER(ranked.disease_classification) = 'DBD' THEN 'Demam Berdarah (DBD)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%hand foot%' OR LOWER(ranked.disease_classification) LIKE '%hfmd%' THEN 'HFMD (Flu Singapura)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%covid%' OR LOWER(ranked.disease_classification) LIKE '%corona%' THEN 'COVID-19'
                    WHEN LOWER(ranked.disease_classification) LIKE '%measles%' OR LOWER(ranked.disease_classification) LIKE '%campak%' THEN 'Campak (Measles)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%rabies%' THEN 'Rabies'
                    WHEN LOWER(ranked.disease_classification) LIKE '%chikungunya%' THEN 'Chikungunya'
                    WHEN LOWER(ranked.disease_classification) LIKE '%avian%' OR LOWER(ranked.disease_classification) LIKE '%h5n1%' THEN 'Flu Burung (H5N1)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%flu%' OR LOWER(ranked.disease_classification) LIKE '%influenza%' THEN 'Influenza'
                    WHEN LOWER(ranked.disease_classification) LIKE '%filariasis%' THEN 'Filariasis'
                    WHEN LOWER(ranked.disease_classification) LIKE '%leptospirosis%' THEN 'Leptospirosis'
                    WHEN LOWER(ranked.disease_classification) LIKE '%tbc%' OR LOWER(ranked.disease_classification) LIKE '%tuberkulosis%' OR LOWER(ranked.disease_classification) LIKE '%tuberculosis%' THEN 'Tuberkulosis (TBC)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%cholera%' OR LOWER(ranked.disease_classification) LIKE '%kolera%' THEN 'Kolera (Cholera)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%mpox%' OR LOWER(ranked.disease_classification) LIKE '%cacar monyet%' THEN 'Mpox'
                    WHEN LOWER(ranked.disease_classification) LIKE '%zika%' THEN 'Zika'
                    ELSE INITCAP(ranked.disease_classification)
                  END AS standard_disease
           FROM ranked
           LEFT JOIN LATERAL (
             SELECT l0.* FROM locations l0
             WHERE LOWER(l0.name) = LOWER(ranked.location_name) AND l0.is_active = TRUE
             ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
             LIMIT 1
           ) l ON TRUE
           WHERE ranked.dedup_rank = 1
         )
         SELECT standard_disease,
                resolved_country,
                COUNT(*)::bigint as event_count,
                SUM(GREATEST(LEAST(COALESCE(case_count, 0), 2000000), 0))::bigint as total_cases,
                SUM(GREATEST(LEAST(COALESCE(death_count, 0), 200000), 0))::bigint as total_deaths,
                COALESCE(TO_CHAR(MAX(published_at), 'YYYY-MM-DD'), '') as latest_published,
                COALESCE(TO_CHAR(MAX(published_at), 'DD Mon YYYY'), '') as latest_published_label,
                COUNT(*) FILTER (WHERE outbreak_alert = TRUE)::bigint as alert_count
         FROM valid
         WHERE {trend_scope}
           AND published_at::date >= $1 AND published_at::date <= $2
           AND ($4::text IS NULL OR $4::text = 'all' OR LOWER(disease_classification) = LOWER($4) OR LOWER(disease_classification) LIKE '%' || LOWER($4) || '%')
         GROUP BY standard_disease, resolved_country
         ORDER BY standard_disease, total_cases DESC, event_count DESC;"
        ),
        &[&start_date, &end_date, &selected_country, &selected_disease],
    ).await.map_err(internal_error)?;

    let daily_resolved = resolved_country_expr("e", "l");
    let daily_scope = country_scope_predicate(&daily_resolved, 4);
    let trend_rows = client.query(
        &format!(
        "SELECT (e.published_at::date)::text as date_str,
                TO_CHAR(published_at, 'DD Mon') as date_label,
                SUM(CASE WHEN LOWER(e.disease_classification) LIKE '%dengue%' OR UPPER(e.disease_classification) = 'DBD' THEN GREATEST(COALESCE(e.case_count, 0), 0) ELSE 0 END)::bigint as dbd,
                SUM(CASE WHEN LOWER(e.disease_classification) LIKE '%measles%' OR LOWER(e.disease_classification) LIKE '%campak%' THEN GREATEST(COALESCE(e.case_count, 0), 0) ELSE 0 END)::bigint as campak,
                SUM(CASE WHEN LOWER(e.disease_classification) LIKE '%covid%' OR LOWER(e.disease_classification) LIKE '%corona%' THEN GREATEST(COALESCE(e.case_count, 0), 0) ELSE 0 END)::bigint as covid,
                SUM(CASE WHEN LOWER(e.disease_classification) LIKE '%rabies%' THEN GREATEST(COALESCE(e.case_count, 0), 0) ELSE 0 END)::bigint as rabies,
                SUM(CASE WHEN LOWER(e.disease_classification) LIKE '%hand foot%' OR LOWER(e.disease_classification) LIKE '%hfmd%' THEN GREATEST(COALESCE(e.case_count, 0), 0) ELSE 0 END)::bigint as hfmd
         FROM disease_events e
         LEFT JOIN LATERAL (
           SELECT l0.* FROM locations l0
           WHERE LOWER(l0.name) = LOWER(e.location_name) AND l0.is_active = TRUE
           ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
           LIMIT 1
         ) l ON TRUE
         WHERE e.published_at::date >= $1
           AND e.published_at::date <= $2
           AND (e.is_health_related = TRUE AND LOWER(COALESCE(e.source_type, '')) NOT IN ('skdr', 'skdr_api'))
           AND ($3::text IS NULL OR LOWER(e.disease_classification) = LOWER($3) OR LOWER(e.disease_classification) LIKE '%' || LOWER($3) || '%')
           AND {daily_scope}
         GROUP BY (e.published_at::date)::text, TO_CHAR(e.published_at, 'DD Mon')
         ORDER BY date_str ASC;"
        ),
        &[&start_date, &end_date, &selected_disease, &selected_country],
    ).await.map_err(internal_error)?;

    // Aggregate into disease structures
    use std::collections::BTreeMap;
    struct DiseaseAcc {
        total_cases: i64,
        total_deaths: i64,
        event_count: i64,
        alert_count: i64,
        top_country: String,
        top_country_iso: String,
        top_country_cases: i64,
        latest_published: String,
        latest_published_label: String,
        breakdowns: Vec<Value>,
    }

    let mut disease_map: BTreeMap<String, DiseaseAcc> = BTreeMap::new();

    for r in rows {
        let d_name: String = r.get("standard_disease");
        let c_name: String = r.get("resolved_country");
        let events: i64 = r.get("event_count");
        let cases: i64 = r.get("total_cases");
        let deaths: i64 = r.get("total_deaths");
        let latest_pub: String = r.get("latest_published");
        let latest_label: String = r.get("latest_published_label");
        let alerts: i64 = r.get("alert_count");
        let c_iso = iso_code_for_country(&c_name).to_string();

        let entry = disease_map.entry(d_name.clone()).or_insert_with(|| DiseaseAcc {
            total_cases: 0,
            total_deaths: 0,
            event_count: 0,
            alert_count: 0,
            top_country: c_name.clone(),
            top_country_iso: c_iso.clone(),
            top_country_cases: cases,
            latest_published: latest_pub.clone(),
            latest_published_label: latest_label.clone(),
            breakdowns: Vec::new(),
        });

        entry.total_cases += cases;
        entry.total_deaths += deaths;
        entry.event_count += events;
        entry.alert_count += alerts;

        if cases > entry.top_country_cases {
            entry.top_country = c_name.clone();
            entry.top_country_iso = c_iso.clone();
            entry.top_country_cases = cases;
        }

        if latest_pub > entry.latest_published {
            entry.latest_published = latest_pub.clone();
            entry.latest_published_label = latest_label.clone();
        }

        entry.breakdowns.push(json!({
            "country": c_name,
            "iso": c_iso,
            "cases": cases,
            "deaths": deaths,
            "events": events,
            "alerts": alerts,
        }));
    }

    let mut priority_alerts = Vec::new();

    for (d_name, acc) in disease_map {
        let severity = if acc.total_cases >= 50_000 || acc.alert_count > 0 {
            "TINGGI"
        } else if acc.total_cases >= 500 {
            "SEDANG"
        } else {
            "RENDAH"
        };

        priority_alerts.push(json!({
            "disease": d_name,
            "top_country": acc.top_country,
            "top_country_iso": acc.top_country_iso,
            "top_country_cases": acc.top_country_cases,
            "total_asean_cases": acc.total_cases,
            "total_deaths": acc.total_deaths,
            "event_count": acc.event_count,
            "alert_count": acc.alert_count,
            "latest_published": acc.latest_published,
            "latest_published_label": acc.latest_published_label,
            "severity": severity,
            "country_breakdown": acc.breakdowns,
        }));
    }

    // Sort priority alerts by total cases desc, then event count desc
    priority_alerts.sort_by(|a, b| {
        let cases_b = b["total_asean_cases"].as_i64().unwrap_or(0);
        let cases_a = a["total_asean_cases"].as_i64().unwrap_or(0);
        let ev_b = b["event_count"].as_i64().unwrap_or(0);
        let ev_a = a["event_count"].as_i64().unwrap_or(0);
        cases_b.cmp(&cases_a).then(ev_b.cmp(&ev_a))
    });

    // Format daily trend items
    let mut daily_trends = Vec::new();
    for tr in trend_rows {
        let date_str: String = tr.get("date_str");
        let date_label: String = tr.get("date_label");
        let dbd: i64 = tr.get("dbd");
        let campak: i64 = tr.get("campak");
        let covid: i64 = tr.get("covid");
        let rabies: i64 = tr.get("rabies");
        let hfmd: i64 = tr.get("hfmd");

        daily_trends.push(json!({
            "date": date_str,
            "date_label": date_label,
            "dbd": dbd,
            "campak": campak,
            "covid": covid,
            "rabies": rabies,
            "hfmd": hfmd,
        }));
    }

    let top_disease = priority_alerts.first().map(|p| p["disease"].as_str().unwrap_or("")).unwrap_or("None");
    let top_country = priority_alerts.first().map(|p| p["top_country"].as_str().unwrap_or("")).unwrap_or("None");

    let snapshot = load_or_refresh_kpi_snapshot(
        &client,
        start_date,
        end_date,
        &country_key,
        &disease_key,
        &source_key,
    )
    .await?;
    let shared = &snapshot.kpis;

    Ok(Json(json!({
        "success": true,
        "data": {
            "summary": {
                "total_diseases": priority_alerts.len(),
                "top_burden_disease": top_disease,
                "top_burden_country": top_country,
                "total_cases_tracked": shared.cases,
                "total_deaths": shared.deaths,
                "total_events": shared.events,
                "active_locations": shared.active_locations,
                "location_master_count": shared.location_master_count,
                "kpi_source": "materialized_kpi_snapshot",
                "snapshot_id": snapshot.id,
                "snapshot_computed_at": snapshot.computed_at,
                "snapshot_filter_key": snapshot.filter_key,
                "snapshot_stale": snapshot.is_stale,
                "trend_days": trend_days,
            },
            "priority_alerts": priority_alerts,
            "daily_trends": daily_trends,
        }
    })))
}


async fn morbidity_mortality_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MorbidityQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let weeks_count = query.weeks.unwrap_or(12).clamp(4, 52);
    let (start_date, end_date) = default_kpi_dates(
        None,
        query.start_year,
        query.start_week,
        query.end_year,
        query.end_week,
    );
    let country_key = resolve_kpi_country(&query.country, &query.scope);
    let disease_key = canonical_kpi_disease(&query.disease);
    let source_key = canonical_kpi_source(&None);
    let selected_country = sql_country_param(&country_key);
    let selected_disease = disease_key.to_lowercase();
    let snapshot = load_or_refresh_kpi_snapshot(
        &client,
        start_date,
        end_date,
        &country_key,
        &disease_key,
        &source_key,
    )
    .await?;
    let shared = &snapshot.kpis;
    let total_morbidity = shared.cases;
    let total_mortality = shared.deaths;
    let cfr_pct = if total_morbidity <= 0 {
        0.0
    } else {
        normalize_cfr_percent((total_mortality as f64 / total_morbidity as f64) * 100.0)
    };

    // 2. Monthly trends (converted to monthly aggregation per user request)
    let monthly_resolved = resolved_country_expr("e", "l");
    let monthly_scope = country_scope_predicate(&monthly_resolved, 4);
    let monthly_rows = client.query(
        &format!(
        "WITH monthly AS (
           SELECT 
             EXTRACT(YEAR FROM e.published_at)::int as year_num,
             EXTRACT(MONTH FROM e.published_at)::int as month_num,
             TO_CHAR(MIN(e.published_at), 'Mon') as month_str,
             SUM(GREATEST(COALESCE(e.case_count, 0), 0))::bigint as morbidity,
             SUM(GREATEST(COALESCE(e.death_count, 0), 0))::bigint as mortality
           FROM disease_events e
           LEFT JOIN LATERAL (
             SELECT l0.* FROM locations l0
             WHERE LOWER(l0.name) = LOWER(e.location_name) AND l0.is_active = TRUE
             ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
             LIMIT 1
           ) l ON TRUE
           WHERE e.published_at IS NOT NULL
             AND e.published_at::date >= $2
             AND e.published_at::date <= $3
             AND e.disease_classification IS NOT NULL
             AND UPPER(e.disease_classification) <> 'UNKNOWN'
             AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
             AND (COALESCE(e.confidence, 0) >= 0.15)
             AND LOWER(COALESCE(e.source_type, '')) <> 'test'
             AND (e.is_health_related = TRUE AND LOWER(COALESCE(e.source_type, '')) NOT IN ('skdr', 'skdr_api'))
             AND {monthly_scope}
             AND (
               $1 = 'all' OR
               ($1 = 'dbd' AND (LOWER(e.disease_classification) LIKE '%dengue%' OR UPPER(e.disease_classification) = 'DBD')) OR
               ($1 = 'campak' AND (LOWER(e.disease_classification) LIKE '%measles%' OR LOWER(e.disease_classification) LIKE '%campak%')) OR
               ($1 = 'hfmd' AND (LOWER(e.disease_classification) LIKE '%hand foot%' OR LOWER(e.disease_classification) LIKE '%hfmd%')) OR
               ($1 = 'covid' AND (LOWER(e.disease_classification) LIKE '%covid%' OR LOWER(e.disease_classification) LIKE '%corona%')) OR
               ($1 = 'rabies' AND LOWER(e.disease_classification) LIKE '%rabies%') OR
               ($1 = 'influenza' AND (LOWER(e.disease_classification) LIKE '%flu%' OR LOWER(e.disease_classification) LIKE '%influenza%')) OR
               ($1 = 'cholera' AND (LOWER(e.disease_classification) LIKE '%cholera%' OR LOWER(e.disease_classification) LIKE '%kolera%')) OR
               LOWER(e.disease_classification) LIKE '%' || $1 || '%'
             )
           GROUP BY 1, 2
           ORDER BY 1, 2
         )
         SELECT year_num, month_num, 
                (month_str || ' ' || year_num::text) as month_label,
                month_str,
                morbidity, mortality,
                LEAST(100.0, GREATEST(0.0, COALESCE(ROUND((mortality::numeric / NULLIF(morbidity, 0)) * 100, 2), 0)))::float8 as cfr_pct
         FROM monthly;"
        ),
        &[&selected_disease, &start_date, &end_date, &selected_country],
    ).await.map_err(internal_error)?;

    let mut weekly_trends = Vec::new();
    for row in monthly_rows {
        let year_num: i32 = row.get("year_num");
        let month_num: i32 = row.get("month_num");
        let month_label: String = row.get("month_label");
        let month_str: String = row.get("month_str");
        let morbidity: i64 = row.get("morbidity");
        let mortality: i64 = row.get("mortality");
        let cfr = normalize_cfr_percent(row.get("cfr_pct"));

        weekly_trends.push(json!({
            "year": year_num,
            "month": month_num,
            "month_label": month_label,
            "week": month_num,
            "week_label": month_str, // "Jan", "Feb", "Mar", etc.
            "morbidity": morbidity,
            "mortality": mortality,
            "cfr_pct": cfr,
        }));
    }

    // 3. Top diseases comparative breakdown
    let disease_resolved = resolved_country_expr("ranked", "l");
    let disease_scope = country_scope_sql();
    let disease_rows = client.query(
        &format!(
        "WITH ranked AS (
           SELECT e.*, rr.url AS report_url,
                  ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(NULLIF(rr.url, ''), e.raw_report_id::text, e.id::text)
                    ORDER BY e.confidence DESC NULLS LAST, e.created_at DESC
                  ) AS dedup_rank
           FROM disease_events e
           LEFT JOIN raw_reports rr ON rr.id = e.raw_report_id
           WHERE (e.is_health_related = TRUE AND LOWER(COALESCE(e.source_type, '')) NOT IN ('skdr', 'skdr_api'))
             AND e.disease_classification IS NOT NULL
             AND UPPER(e.disease_classification) NOT IN ('UNKNOWN')
             AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
             AND (COALESCE(e.confidence, 0) >= 0.15)
         ), valid AS (
           SELECT ranked.*,
                  {disease_resolved} AS resolved_country,
                  CASE
                    WHEN LOWER(ranked.disease_classification) LIKE '%dengue%' OR UPPER(ranked.disease_classification) = 'DBD' THEN 'Demam Berdarah (DBD)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%hand foot%' OR LOWER(ranked.disease_classification) LIKE '%hfmd%' THEN 'HFMD (Flu Singapura)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%covid%' OR LOWER(ranked.disease_classification) LIKE '%corona%' THEN 'COVID-19'
                    WHEN LOWER(ranked.disease_classification) LIKE '%measles%' OR LOWER(ranked.disease_classification) LIKE '%campak%' THEN 'Campak (Measles)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%rabies%' THEN 'Rabies'
                    WHEN LOWER(ranked.disease_classification) LIKE '%chikungunya%' THEN 'Chikungunya'
                    WHEN LOWER(ranked.disease_classification) LIKE '%avian%' OR LOWER(ranked.disease_classification) LIKE '%h5n1%' THEN 'Flu Burung (H5N1)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%flu%' OR LOWER(ranked.disease_classification) LIKE '%influenza%' THEN 'Influenza'
                    WHEN LOWER(ranked.disease_classification) LIKE '%filariasis%' THEN 'Filariasis'
                    WHEN LOWER(ranked.disease_classification) LIKE '%leptospirosis%' THEN 'Leptospirosis'
                    WHEN LOWER(ranked.disease_classification) LIKE '%tbc%' OR LOWER(ranked.disease_classification) LIKE '%tuberkulosis%' OR LOWER(ranked.disease_classification) LIKE '%tuberculosis%' THEN 'Tuberkulosis (TBC)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%cholera%' OR LOWER(ranked.disease_classification) LIKE '%kolera%' THEN 'Kolera (Cholera)'
                    WHEN LOWER(ranked.disease_classification) LIKE '%mpox%' OR LOWER(ranked.disease_classification) LIKE '%cacar monyet%' THEN 'Mpox'
                    WHEN LOWER(ranked.disease_classification) LIKE '%zika%' THEN 'Zika'
                    ELSE INITCAP(ranked.disease_classification)
                  END AS standard_disease
           FROM ranked
           LEFT JOIN LATERAL (
             SELECT l0.* FROM locations l0
             WHERE LOWER(l0.name) = LOWER(ranked.location_name) AND l0.is_active = TRUE
             ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
             LIMIT 1
           ) l ON TRUE
           WHERE ranked.dedup_rank = 1
         )
         SELECT standard_disease,
                SUM(GREATEST(COALESCE(case_count, 0), 0))::bigint as total_cases,
                SUM(GREATEST(COALESCE(death_count, 0), 0))::bigint as total_deaths,
                LEAST(100.0, GREATEST(0.0, COALESCE(ROUND((SUM(GREATEST(COALESCE(death_count, 0), 0))::numeric / NULLIF(SUM(GREATEST(COALESCE(case_count, 0), 0)), 0)) * 100, 2), 0)))::float8 as cfr_pct,
                COUNT(*)::bigint as event_count
         FROM valid
         WHERE published_at IS NOT NULL
           AND published_at::date >= $1
           AND published_at::date <= $2
           AND {disease_scope}
           AND ($4::text IS NULL OR $4::text = 'all' OR LOWER(disease_classification) = LOWER($4) OR LOWER(disease_classification) LIKE '%' || LOWER($4) || '%')
         GROUP BY standard_disease
         ORDER BY total_cases DESC
         LIMIT 12;"
        ),
        &[&start_date, &end_date, &selected_country, &selected_disease],
    ).await.map_err(internal_error)?;

    let mut disease_breakdowns = Vec::new();
    for row in disease_rows {
        let d_name: String = row.get("standard_disease");
        let cases: i64 = row.get("total_cases");
        let deaths: i64 = row.get("total_deaths");
        let cfr = normalize_cfr_percent(row.get("cfr_pct"));
        let events: i64 = row.get("event_count");

        disease_breakdowns.push(json!({
            "disease": d_name,
            "total_cases": cases,
            "total_deaths": deaths,
            "cfr_pct": cfr,
            "event_count": events,
        }));
    }

    Ok(Json(json!({
        "success": true,
        "data": {
            "summary": {
                "total_morbidity": total_morbidity,
                "total_mortality": total_mortality,
                "cfr_pct": cfr_pct,
                "selected_disease": selected_disease,
                "weeks": weeks_count,
                "total_events": shared.events,
                "active_locations": shared.active_locations,
                "location_master_count": shared.location_master_count,
                "kpi_source": "materialized_kpi_snapshot",
                "snapshot_id": snapshot.id,
                "snapshot_computed_at": snapshot.computed_at,
                "snapshot_filter_key": snapshot.filter_key,
                "snapshot_stale": snapshot.is_stale,
            },
            "weekly_trends": weekly_trends,
            "top_diseases": disease_breakdowns,
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

fn normalized_json_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// Matches the normalization used by disease_aliases.normalized_alias.
/// Classification text is retained for audit, while dashboard labels use the
/// canonical WHO concept when an unambiguous active alias exists.
fn normalized_disease_alias(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || character == '_' || character == '-' {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn find_json_field<'a>(payload: &'a Value, candidates: &[&str]) -> Option<&'a Value> {
    match payload {
        Value::Object(values) => {
            for candidate in candidates {
                let wanted = normalized_json_key(candidate);
                if let Some((_, value)) = values
                    .iter()
                    .find(|(key, _)| normalized_json_key(key) == wanted)
                {
                    if !value.is_null() {
                        return Some(value);
                    }
                }
            }
            values
                .values()
                .find_map(|value| find_json_field(value, candidates))
        }
        Value::Array(values) => values
            .iter()
            .find_map(|value| find_json_field(value, candidates)),
        _ => None,
    }
}

fn json_field_text(payload: &Value, candidates: &[&str]) -> Option<String> {
    let value = find_json_field(payload, candidates)?;
    let text = match value {
        Value::String(text) => text.trim().to_string(),
        Value::Number(number) => number.to_string(),
        Value::Bool(value) => value.to_string(),
        _ => return None,
    };
    (!text.is_empty()).then_some(text)
}

fn json_field_count(payload: &Value, candidates: &[&str]) -> i64 {
    let Some(value) = find_json_field(payload, candidates) else {
        return 0;
    };
    if let Some(number) = value.as_i64() {
        return number.max(0);
    }
    if let Some(number) = value.as_f64() {
        return number.max(0.0).round() as i64;
    }
    let Some(raw) = value.as_str().map(str::trim) else {
        return 0;
    };
    if let Ok(number) = raw.parse::<i64>() {
        return number.max(0);
    }
    let digits = raw.chars().filter(char::is_ascii_digit).collect::<String>();
    digits.parse::<i64>().unwrap_or(0)
}

/// Dedicated IBS aggregate sourced directly from official SKDR records.
/// Detached: HTTP 410 until a later reattach.
#[allow(dead_code)]
async fn skdr_ibs_summary(
    State(_state): State<Arc<AppState>>,
    Query(_query): Query<IbsSummaryQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    Err(skdr_detached().await)
}

/// Dedicated EBS aggregate sourced directly from official SKDR records.
/// Detached: HTTP 410 until a later reattach.
#[allow(dead_code)]
async fn skdr_ebs_summary(
    State(_state): State<Arc<AppState>>,
    Query(_query): Query<IbsSummaryQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    Err(skdr_detached().await)
}

#[allow(dead_code)]
async fn skdr_summary(
    state: Arc<AppState>,
    query: IbsSummaryQuery,
    endpoint_name: &'static str,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let selected_year = query.year.unwrap_or_else(|| chrono::Utc::now().year());
    let province_filter = query
        .province
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty() && value != "all");

    let available_years = client
        .query(
            "SELECT DISTINCT report_year FROM skdr_reports
             WHERE endpoint_name=$1 ORDER BY report_year DESC",
            &[&endpoint_name],
        )
        .await
        .map_err(internal_error)?
        .into_iter()
        .map(|row| row.get::<_, i32>(0))
        .collect::<Vec<_>>();

    let rows = client
        .query(
            "SELECT payload, epidemiological_week
             FROM skdr_reports
             WHERE endpoint_name=$1 AND report_year=$2
               AND ($3::text IS NULL OR LOWER(COALESCE(
                   NULLIF(payload->>'provinsi', ''),
                   NULLIF(payload->>'propinsi', ''),
                   NULLIF(payload->>'nama_provinsi', ''),
                   NULLIF(payload->>'province', '')
               )) = $3)",
            &[&endpoint_name, &selected_year, &province_filter],
        )
        .await
        .map_err(internal_error)?;

    let disease_fields = [
        "penyakit", "nama_penyakit", "nama_penyakit_sindrom",
        "penyakit_sindrom", "disease", "disease_name", "jenis_penyakit",
        "diagnosa", "verifikasi",
    ];
    let province_fields = ["provinsi", "propinsi", "nama_provinsi", "province"];
    let case_fields = ["kasus", "jumlah_kasus", "jml_kasus", "case_count", "cases", "jumlah"];
    let death_fields = ["kematian", "jumlah_kematian", "jml_kematian", "death_count", "deaths", "meninggal"];
    let date_fields = ["tgl_laporan", "tanggal_laporan", "report_date", "date"];
    let verification_fields = ["sts_verifikasi", "status_verifikasi"];
    let examination_fields = ["hasil_pemeriksaan", "examination_result"];
    let rumor_status_fields = ["sts_rumor", "status_rumor"];

    let mut total_reports = 0i64;
    let mut total_cases = 0i64;
    let mut total_deaths = 0i64;
    let mut klb_reports = 0i64;
    let mut investigation_reports = 0i64;
    let mut verified_reports = 0i64;
    let mut negative_discarded_reports = 0i64;
    let mut death_reports = 0i64;
    let mut by_disease = HashMap::<String, (i64, i64, i64)>::new();
    let mut by_province = HashMap::<String, (i64, i64, i64)>::new();
    let mut by_week = HashMap::<i32, (i64, i64, i64)>::new();

    for row in rows {
        let payload = row.get::<_, Value>(0);
        let mut week = row.get::<_, Option<i32>>(1).unwrap_or(0);
        if week <= 0 {
            if let Some(report_date) = json_field_text(&payload, &date_fields) {
                if let Ok(date) = NaiveDate::parse_from_str(report_date.get(..10).unwrap_or(&report_date), "%Y-%m-%d") {
                    week = date.iso_week().week() as i32;
                }
            }
        }
        let province = json_field_text(&payload, &province_fields)
            .unwrap_or_else(|| "Wilayah tidak diketahui".to_string());
        if let Some(ref expected) = province_filter {
            if province.to_lowercase() != *expected {
                continue;
            }
        }
        let disease = json_field_text(&payload, &disease_fields)
            .unwrap_or_else(|| "Penyakit tidak diketahui".to_string());
        let cases = json_field_count(&payload, &case_fields);
        let deaths = json_field_count(&payload, &death_fields);
        let klb = json_field_text(&payload, &["klb"]).unwrap_or_default();
        let verification = json_field_text(&payload, &verification_fields)
            .unwrap_or_default().to_lowercase();
        let examination = json_field_text(&payload, &examination_fields)
            .unwrap_or_default().to_lowercase();
        let rumor_status = json_field_text(&payload, &rumor_status_fields)
            .unwrap_or_default().to_lowercase();

        if (endpoint_name == "ebs" && klb == "1")
            || (endpoint_name == "ibs" && !klb.is_empty() && klb != "0")
        {
            klb_reports += 1;
        }
        if (endpoint_name == "ebs" && rumor_status.contains("dalam investigasi"))
            || (endpoint_name == "ibs" && (examination == "dalam_proses" || verification == "0"))
        {
            investigation_reports += 1;
        }
        if (endpoint_name == "ebs" && rumor_status.contains("terverifikasi"))
            || (endpoint_name == "ibs" && verification == "1")
        {
            verified_reports += 1;
        }
        if (endpoint_name == "ebs" && rumor_status.contains("discarded"))
            || (endpoint_name == "ibs" && examination == "negatif")
        {
            negative_discarded_reports += 1;
        }
        if deaths > 0 {
            death_reports += 1;
        }

        total_reports += 1;
        total_cases += cases;
        total_deaths += deaths;
        let disease_total = by_disease.entry(disease).or_insert((0, 0, 0));
        disease_total.0 += cases;
        disease_total.1 += deaths;
        disease_total.2 += 1;
        let province_total = by_province.entry(province).or_insert((0, 0, 0));
        province_total.0 += cases;
        province_total.1 += deaths;
        province_total.2 += 1;
        let week_total = by_week.entry(week).or_insert((0, 0, 0));
        week_total.0 += cases;
        week_total.1 += deaths;
        week_total.2 += 1;
    }

    let mut diseases = by_disease
        .into_iter()
        .map(|(name, (cases, deaths, reports))| json!({
            "name": name, "cases": cases, "deaths": deaths, "reports": reports
        }))
        .collect::<Vec<_>>();
    diseases.sort_by_key(|item| std::cmp::Reverse(item["cases"].as_i64().unwrap_or(0)));

    let mut provinces = by_province
        .into_iter()
        .map(|(name, (cases, deaths, reports))| json!({
            "name": name, "cases": cases, "deaths": deaths, "reports": reports
        }))
        .collect::<Vec<_>>();
    provinces.sort_by_key(|item| std::cmp::Reverse(item["cases"].as_i64().unwrap_or(0)));

    let mut weekly_trend = by_week
        .into_iter()
        .map(|(week, (cases, deaths, reports))| json!({
            "week": week, "cases": cases, "deaths": deaths, "reports": reports
        }))
        .collect::<Vec<_>>();
    weekly_trend.sort_by_key(|item| item["week"].as_i64().unwrap_or(0));

    Ok(Json(json!({
        "success": true,
        "data": {
            "source": format!("SKDR {}", endpoint_name.to_uppercase()),
            "year": selected_year,
            "available_years": available_years,
            "totals": {
                "reports": total_reports,
                "cases": total_cases,
                "deaths": total_deaths
            },
            "status": {
                "klb": klb_reports,
                "investigation": investigation_reports,
                "verified": verified_reports,
                "negative_discarded": negative_discarded_reports,
                "with_deaths": death_reports
            },
            "by_disease": diseases,
            "by_province": provinces,
            "weekly_trend": weekly_trend
        }
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

    let canonical_disease_by_alias = client
        .query(
            "SELECT a.normalized_alias, c.canonical_name
             FROM disease_aliases a
             JOIN disease_concepts c ON c.id = a.concept_id
             WHERE a.is_active = TRUE AND c.is_active = TRUE
               AND NULLIF(BTRIM(a.normalized_alias), '') IS NOT NULL
             ORDER BY a.confidence DESC, c.updated_at DESC NULLS LAST",
            &[],
        )
        .await
        .map_err(internal_error)?
        .into_iter()
        .fold(HashMap::<String, String>::new(), |mut aliases, row| {
            let alias: String = row.get(0);
            let canonical: String = row.get(1);
            aliases.entry(alias).or_insert(canonical);
            aliases
        });

    let canonical_for_dashboard = |raw: &str| {
        canonical_disease_by_alias
            .get(&normalized_disease_alias(raw))
            .cloned()
            .unwrap_or_else(|| raw.trim().to_string())
    };

    let is_non_specific_disease = |name: &str| {
        matches!(
            normalized_disease_alias(name).as_str(),
            "viral" | "virus" | "bacterial" | "bacteria" | "infection" | "infectious disease" | "penyakit menular" | "unknown" | "unknown disease"
        )
    };

    let now = chrono::Utc::now();
    let current_epi_week = now.iso_week().week();
    let current_epi_year = now.iso_week().year();

    let selected_year = query.year.unwrap_or(current_epi_year);
    let country_key = resolve_kpi_country(&query.country, &query.scope);
    let disease_key = canonical_kpi_disease(&query.disease);
    let source_key = canonical_kpi_source(&query.source);
    let selected_country = sql_country_param(&country_key);
    let selected_disease = sql_disease_param(&disease_key);
    let selected_source: Option<String> = None;
    let (start_date, end_date) = default_kpi_dates(
        query.year,
        query.start_year,
        query.start_week,
        query.end_year,
        query.end_week,
    );
    let start_week_val = query.start_week.or(Some(1));
    let end_week_val = query.end_week.or(Some(current_epi_week));
    let start_year = query.start_year.unwrap_or(selected_year);
    let end_year = query.end_year.unwrap_or(selected_year);

    let available_years = client
        .query(
            "SELECT DISTINCT EXTRACT(YEAR FROM published_at)::int AS year
             FROM disease_events
             WHERE published_at IS NOT NULL
               AND (is_health_related = TRUE AND LOWER(COALESCE(source_type, '')) NOT IN ('skdr', 'skdr_api'))
               AND disease_classification IS NOT NULL
               AND UPPER(disease_classification) <> 'UNKNOWN'
               AND UPPER(disease_classification) NOT LIKE 'NEGATIVE%'
               AND (COALESCE(confidence, 0) >= 0.15)
               AND LOWER(COALESCE(source_type, '')) <> 'test'
             ORDER BY year DESC",
            &[],
        )
        .await
        .map_err(internal_error)?
        .into_iter()
        .map(|row| row.get::<_, i32>(0))
        .collect::<Vec<_>>();

    let raw_available_diseases = client
        .query(
            "SELECT DISTINCT disease_classification
             FROM disease_events
             WHERE published_at IS NOT NULL
               AND (is_health_related = TRUE AND LOWER(COALESCE(source_type, '')) NOT IN ('skdr', 'skdr_api'))
               AND disease_classification IS NOT NULL
               AND UPPER(disease_classification) <> 'UNKNOWN'
               AND UPPER(disease_classification) NOT LIKE 'NEGATIVE%'
               AND (COALESCE(confidence, 0) >= 0.15)
               AND LOWER(COALESCE(source_type, '')) <> 'test'
             ORDER BY disease_classification ASC",
            &[],
        )
        .await
        .map_err(internal_error)?
        .into_iter()
        .map(|row| row.get::<_, String>(0))
        .collect::<Vec<_>>();

    let available_diseases = raw_available_diseases
        .into_iter()
        .filter(|name| !is_non_specific_disease(name))
        .map(|name| canonical_for_dashboard(&name))
        .fold(Vec::<String>::new(), |mut names, name| {
            if !names.iter().any(|item| item.eq_ignore_ascii_case(&name)) {
                names.push(name);
            }
            names
        });

    let cache_key = format!(
        "{}|{}|{:?}|{:?}|{:?}",
        start_date, end_date, selected_country, selected_disease, selected_source
    );
    if let Ok(guard) = PUBLIC_DASH_CACHE.lock() {
        if let Some(cache) = guard.as_ref() {
            if cache.key == cache_key && cache.expires_at > Instant::now() {
                return Ok(Json(cache.payload.clone()));
            }
        }
    }

    let snapshot = load_or_refresh_kpi_snapshot(
        &client,
        start_date,
        end_date,
        &country_key,
        &disease_key,
        &source_key,
    )
    .await?;
    let shared_kpis = snapshot.kpis.clone();
    let unbounded_by_disease = query_shared_by_disease(
        &client,
        start_date,
        end_date,
        &selected_country,
        &selected_disease,
        &selected_source,
    )
    .await?;
    let unbounded_by_country = query_shared_by_country(
        &client,
        start_date,
        end_date,
        &selected_country,
        &selected_disease,
        &selected_source,
    )
    .await?;

    let cluster_country = resolved_country_expr("e", "l");
    let cluster_scope = country_scope_predicate(&cluster_country, 3);
    let rows = client.query(
        &format!(
        "SELECT COALESCE(e.location_name, 'Unknown') AS location_name,
                e.disease_classification,
                {cluster_country} AS country,
                COALESCE(ST_Y(ST_Centroid(ST_Collect(e.geom))), l.latitude) AS latitude,
                COALESCE(ST_X(ST_Centroid(ST_Collect(e.geom))), l.longitude) AS longitude,
                SUM(GREATEST(LEAST(COALESCE(e.case_count, 0), 2000000), 0)) AS cases,
                SUM(GREATEST(LEAST(COALESCE(e.death_count, 0), 200000), 0)) AS deaths,
                COUNT(*) AS event_count,
                MAX(e.confidence::float8) AS confidence,
                BOOL_OR(COALESCE(e.outbreak_alert, FALSE)) AS model_alert,
                COALESCE(MAX(r.min_case_count), 1) AS threshold,
                MAX(e.published_at)::text AS latest_date,
                COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
                  'url', e.report_url, 'source_name', e.source_name,
                  'source_type', e.source_type, 'published_at', e.published_at::text
                ) ORDER BY e.published_at DESC, e.confidence DESC) FILTER (WHERE e.report_url IS NOT NULL), '[]'::jsonb) AS sources,
                COALESCE(SUM(GREATEST(LEAST(COALESCE(e.case_count, 0), 2000000), 0)) FILTER (WHERE e.published_at::date >= CURRENT_DATE - 7), 0)::bigint AS recent_cases,
                COALESCE(SUM(GREATEST(LEAST(COALESCE(e.case_count, 0), 2000000), 0)) FILTER (WHERE e.published_at::date >= CURRENT_DATE - 14 AND e.published_at::date < CURRENT_DATE - 7), 0)::bigint AS previous_period_cases,
                COUNT(*) FILTER (WHERE e.published_at::date >= CURRENT_DATE - 7)::bigint AS recent_event_count,
                COUNT(DISTINCT COALESCE(NULLIF(LOWER(TRIM(e.source_name)), ''), NULLIF(e.report_url, ''), e.raw_report_id::text, e.id::text)) FILTER (WHERE e.published_at::date >= CURRENT_DATE - 7)::bigint AS recent_source_count,
                (JSONB_AGG(JSONB_BUILD_OBJECT(
                  'event_id', e.id::text, 'raw_report_id', e.raw_report_id::text,
                  'url', e.report_url, 'content', LEFT(e.original_text, 400), 'language', e.language,
                  'source_type', e.source_type, 'source_name', e.source_name,
                  'published_at', e.published_at::text, 'symptoms', e.symptoms,
                  'disease_extracted', e.disease_extracted, 'sentiment', e.sentiment,
                  'event_type', e.event_type, 'event_confidence', e.event_confidence,
                  'relevance_score', e.relevance_score, 'relevance_confidence', e.relevance_confidence,
                  'source_credibility', e.source_credibility,
                  'source_credibility_label', e.source_credibility_label,
                  'needs_review', e.needs_review, 'is_health_related', e.is_health_related,
                  'outbreak_alert', e.outbreak_alert,
                  'province', e.province, 'city', e.city
                ) ORDER BY e.published_at DESC, e.confidence DESC)->0) AS detail,
                MAX(NULLIF(e.province, '')) AS province,
                MAX(NULLIF(e.city, '')) AS city
            FROM (
              SELECT e0.*, rr.url AS report_url,
                     ROW_NUMBER() OVER (
                       PARTITION BY COALESCE(NULLIF(rr.url, ''), e0.raw_report_id::text, e0.id::text)
                       ORDER BY e0.confidence DESC NULLS LAST, e0.created_at DESC
                     ) AS dedup_rank
              FROM disease_events e0
              LEFT JOIN raw_reports rr ON rr.id = e0.raw_report_id
               WHERE (e0.is_health_related = TRUE AND LOWER(COALESCE(e0.source_type, '')) NOT IN ('skdr', 'skdr_api'))
                AND e0.disease_classification IS NOT NULL
                AND UPPER(e0.disease_classification) <> 'UNKNOWN'
                AND UPPER(e0.disease_classification) NOT LIKE 'NEGATIVE%'
                 AND (COALESCE(e0.confidence, 0) >= 0.15)
                AND e0.published_at IS NOT NULL
                AND LOWER(COALESCE(e0.source_type, '')) <> 'test'
                AND e0.published_at::date >= $1
                AND e0.published_at::date <= $2
                AND ($4::text IS NULL OR $4::text = 'all' OR LOWER(e0.disease_classification) = LOWER($4) OR LOWER(e0.disease_classification) LIKE '%' || LOWER($4) || '%')
                AND ($5::text IS NULL OR (EXISTS (
                  SELECT 1 FROM skdr_reports sr
                  WHERE sr.raw_report_id = e0.raw_report_id
                    AND ($5::text = 'skdr' OR sr.endpoint_name = $5::text)
                ) OR ($5::text = 'skdr' AND LOWER(COALESCE(e0.source_type, '')) IN ('skdr', 'skdr_api'))))
            ) e
         LEFT JOIN LATERAL (
           SELECT l0.* FROM locations l0
           WHERE LOWER(l0.name) = LOWER(e.location_name) AND l0.is_active = TRUE
           ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
           LIMIT 1
         ) l ON TRUE
         LEFT JOIN disease_outbreak_rules r
           ON LOWER(r.disease_name) = LOWER(e.disease_classification) AND r.is_active = TRUE
          WHERE (e.is_health_related = TRUE AND LOWER(COALESCE(e.source_type, '')) NOT IN ('skdr', 'skdr_api'))
           AND e.disease_classification IS NOT NULL
           AND UPPER(e.disease_classification) <> 'UNKNOWN'
           AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
           AND (COALESCE(e.confidence, 0) >= 0.15)
           AND e.dedup_rank = 1
           AND e.published_at IS NOT NULL
           AND e.published_at::date >= $1
           AND e.published_at::date <= $2
           AND {cluster_scope}
         GROUP BY COALESCE(e.location_name, 'Unknown'), e.disease_classification,
                   {cluster_country}, l.latitude, l.longitude
         ORDER BY cases DESC, latest_date DESC
         LIMIT 250"
        ),
        &[&start_date, &end_date, &selected_country, &selected_disease, &selected_source],
    ).await.map_err(internal_error)?;

    let month_resolved = resolved_country_expr("ranked", "l");
    let month_scope = country_scope_sql();
    let trend_row = client.query_one(
        &format!(
        "WITH ranked AS (
           SELECT e.*, rr.url AS report_url,
                  ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(NULLIF(rr.url, ''), e.raw_report_id::text, e.id::text)
                    ORDER BY e.confidence DESC NULLS LAST, e.created_at DESC
                  ) AS dedup_rank
           FROM disease_events e
           LEFT JOIN raw_reports rr ON rr.id = e.raw_report_id
           WHERE (e.is_health_related = TRUE AND LOWER(COALESCE(e.source_type, '')) NOT IN ('skdr', 'skdr_api'))
             AND e.disease_classification IS NOT NULL
             AND UPPER(e.disease_classification) <> 'UNKNOWN'
             AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
             AND (COALESCE(e.confidence, 0) >= 0.15)
             AND e.published_at IS NOT NULL
             AND LOWER(COALESCE(e.source_type, '')) <> 'test'
             AND e.published_at::date >= $1
             AND e.published_at::date <= $2
             AND ($4::text IS NULL OR $4::text = 'all' OR LOWER(e.disease_classification) = LOWER($4) OR LOWER(e.disease_classification) LIKE '%' || LOWER($4) || '%')
             AND ($5::text IS NULL OR (EXISTS (
                SELECT 1 FROM skdr_reports sr
                WHERE sr.raw_report_id = e.raw_report_id
                  AND ($5::text = 'skdr' OR sr.endpoint_name = $5::text)
             ) OR ($5::text = 'skdr' AND LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))))
         ), valid AS (
           SELECT ranked.*, l.latitude AS resolved_latitude, l.longitude AS resolved_longitude,
                   {month_resolved} AS resolved_country
           FROM ranked
           LEFT JOIN LATERAL (
             SELECT l0.* FROM locations l0
             WHERE LOWER(l0.name) = LOWER(ranked.location_name) AND l0.is_active = TRUE
             ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
             LIMIT 1
           ) l ON TRUE
           WHERE ranked.dedup_rank = 1
         ), bounds AS (
          SELECT CASE WHEN $2 >= CURRENT_DATE - interval '30 days'
                   THEN date_trunc('month', CURRENT_DATE)::date
                   ELSE date_trunc('month', $2)::date END AS current_start,
                 CASE WHEN $2 >= CURRENT_DATE - interval '30 days'
                   THEN (date_trunc('month', CURRENT_DATE) - interval '1 month')::date
                   ELSE (date_trunc('month', $2) - interval '1 month')::date END AS previous_start
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
         LEFT JOIN valid ON {month_scope}
        GROUP BY b.current_start, b.previous_start"
        ),
        &[&start_date, &end_date, &selected_country, &selected_disease, &selected_source],
    ).await.map_err(internal_error)?;

    let trends = json!({
        "current_month": trend_row.get::<_, Option<String>>(10).unwrap_or_default(),
        "previous_month": trend_row.get::<_, Option<String>>(11).unwrap_or_default(),
        "cases": {"current": trend_row.get::<_, i64>(0), "previous": trend_row.get::<_, i64>(1)},
        "deaths": {"current": trend_row.get::<_, i64>(2), "previous": trend_row.get::<_, i64>(3)},
        "events": {"current": trend_row.get::<_, i64>(4), "previous": trend_row.get::<_, i64>(5)},
        "locations": {"current": trend_row.get::<_, i64>(6), "previous": trend_row.get::<_, i64>(7)},
        "alerts": {"current": trend_row.get::<_, i64>(8), "previous": trend_row.get::<_, i64>(9)}
    });

    let weekly_country = resolved_country_expr("e", "l");
    let weekly_scope = country_scope_predicate(&weekly_country, 3);
    let weekly_trend = client.query(
        &format!(
        "WITH ranked AS (
           SELECT e.*, rr.url AS report_url,
                  ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(NULLIF(rr.url, ''), e.raw_report_id::text, e.id::text)
                    ORDER BY e.confidence DESC NULLS LAST, e.created_at DESC
                  ) AS dedup_rank
           FROM disease_events e
           LEFT JOIN raw_reports rr ON rr.id = e.raw_report_id
           WHERE (e.is_health_related = TRUE AND LOWER(COALESCE(e.source_type, '')) NOT IN ('skdr', 'skdr_api'))
             AND e.disease_classification IS NOT NULL
             AND UPPER(e.disease_classification) <> 'UNKNOWN'
             AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
             AND (COALESCE(e.confidence, 0) >= 0.15)
             AND e.published_at IS NOT NULL
             AND LOWER(COALESCE(e.source_type, '')) <> 'test'
             AND e.published_at::date >= $1
             AND e.published_at::date <= $2
         )
         SELECT TO_CHAR(e.published_at, 'IYYY-\"W\"IW') AS period,
                EXTRACT(WEEK FROM e.published_at)::int AS epidemiological_week,
                COALESCE(SUM(GREATEST(LEAST(COALESCE(e.case_count, 0), 2000000), 0)), 0)::bigint AS cases,
                COALESCE(SUM(GREATEST(LEAST(COALESCE(e.death_count, 0), 200000), 0)), 0)::bigint AS deaths,
                COUNT(*)::bigint AS events,
                COUNT(*) FILTER (WHERE e.outbreak_alert = TRUE)::bigint AS alerts
         FROM ranked e
         LEFT JOIN skdr_reports sr ON sr.raw_report_id = e.raw_report_id
         LEFT JOIN LATERAL (
           SELECT l0.* FROM locations l0
           WHERE LOWER(l0.name) = LOWER(e.location_name) AND l0.is_active = TRUE
           ORDER BY l0.updated_at DESC NULLS LAST, l0.created_at DESC
           LIMIT 1
         ) l ON TRUE
         WHERE e.dedup_rank = 1
           AND {weekly_scope}
           AND ($4::text IS NULL OR $4::text = 'all' OR LOWER(e.disease_classification) = LOWER($4) OR LOWER(e.disease_classification) LIKE '%' || LOWER($4) || '%')
           AND ($5::text IS NULL OR ($5::text = 'skdr' AND (sr.id IS NOT NULL OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api')))
                OR ($5::text IN ('ibs', 'ebs') AND LOWER(COALESCE(sr.endpoint_name, '')) = $5::text))
         GROUP BY TO_CHAR(e.published_at, 'IYYY-\"W\"IW'), EXTRACT(WEEK FROM e.published_at)
         ORDER BY MIN(e.published_at)"
        ),
        &[&start_date, &end_date, &selected_country, &selected_disease, &selected_source],
    ).await.map_err(internal_error)?
    .into_iter()
    .map(|row| json!({
        "period": row.get::<_, String>(0),
        "week": row.get::<_, i32>(1),
        "cases": row.get::<_, i64>(2),
        "deaths": row.get::<_, i64>(3),
        "events": row.get::<_, i64>(4),
        "alerts": row.get::<_, i64>(5),
    }))
    .collect::<Vec<_>>();

    let mut locations = Vec::new();
    let mut alerts = Vec::new();

    for row in rows {
        let location: String = row.get(0);
        let raw_disease: String = row.get(1);
        if is_non_specific_disease(&raw_disease) {
            continue;
        }
        let disease = canonical_for_dashboard(&raw_disease);
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
        let sources: Value = row.get::<_, Option<Value>>(12).unwrap_or_else(|| json!([]));
        let mut recent_cases: i64 = row.get(13);
        let previous_period_cases: i64 = row.get(14);
        let recent_event_count: i64 = row.get(15);
        let recent_source_count: i64 = row.get(16);
        if recent_event_count == event_count {
            recent_cases = cases;
        }
        let mut detail: Value = row.get::<_, Option<Value>>(17).unwrap_or(Value::Null);
        let province: Option<String> = row.get(18);
        let city: Option<String> = row.get(19);
        if let Value::Object(ref mut detail_object) = detail {
            detail_object.insert("disease_classification".to_string(), json!(disease));
            if let Some(Value::Array(values)) = detail_object.get_mut("disease_extracted") {
                let canonical_values = values
                    .iter()
                    .filter_map(|value| value.as_str())
                    .filter(|value| !is_non_specific_disease(value))
                    .map(canonical_for_dashboard)
                    .collect::<Vec<_>>();
                *values = canonical_values.into_iter().map(Value::String).collect();
            }
        }
        let threshold_i64 = i64::from(threshold.max(1));
        let ratio = cases as f64 / threshold_i64 as f64;
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
        let is_recent = recent_event_count > 0;
        let has_case_surge = recent_cases >= 2
            && (previous_period_cases == 0 || recent_cases * 2 >= previous_period_cases * 3);
        let high_case_volume = recent_cases >= threshold_i64.saturating_mul(2);
        let is_hot = is_recent && (has_case_surge || high_case_volume);

        let item = json!({
            "location_name": location, "disease": disease, "country": country,
            "latitude": latitude, "longitude": longitude, "cases": cases,
            "deaths": deaths, "event_count": event_count, "confidence": confidence,
            "threshold": threshold_i64, "severity": severity, "has_alert": is_alert,
            "latest_date": latest_date, "sources": sources, "recent_cases": recent_cases,
            "previous_period_cases": previous_period_cases,
            "recent_event_count": recent_event_count,
            "recent_source_count": recent_source_count,
            "is_recent": is_recent, "is_hot": is_hot, "detail": detail,
            "province": province, "city": city
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
    let mut merged_diseases = std::collections::HashMap::<String, (i64, i64, i64)>::new();
    for item in unbounded_by_disease {
        let raw = item.get("name").and_then(Value::as_str).unwrap_or("UNKNOWN");
        if is_non_specific_disease(raw) {
            continue;
        }
        let name = canonical_for_dashboard(raw);
        let entry = merged_diseases.entry(name).or_insert((0, 0, 0));
        entry.0 += item.get("cases").and_then(Value::as_i64).unwrap_or(0);
        entry.1 += item.get("deaths").and_then(Value::as_i64).unwrap_or(0);
        entry.2 += item.get("events").and_then(Value::as_i64).unwrap_or(0);
    }
    let mut by_disease: Vec<Value> = merged_diseases
        .into_iter()
        .map(|(name, v)| json!({"name": name, "cases": v.0, "deaths": v.1, "events": v.2}))
        .collect();
    by_disease.sort_by(|a, b| b["cases"].as_i64().cmp(&a["cases"].as_i64()));
    let mut by_country = pad_asean11_country_rows(unbounded_by_country, &country_key);
    by_country.sort_by(|a, b| b["cases"].as_i64().cmp(&a["cases"].as_i64()));

    let summary_text = if shared_kpis.events == 0 {
        format!(
            "No stored NLP health events for {} from {} to {}. Summary unavailable until the pipeline produces matching results.",
            kpi_scope_label(&country_key),
            start_date,
            end_date
        )
    } else {
        format!(
            "Period {} to {} in {}: {} cases, {} deaths, {} health-related events across {} active locations, with {} outbreak-alert signals. Figures are aggregated from stored NLP extraction results (per-event caps applied).",
            start_date,
            end_date,
            kpi_scope_label(&country_key),
            shared_kpis.cases,
            shared_kpis.deaths,
            shared_kpis.events,
            shared_kpis.active_locations,
            shared_kpis.alerts
        )
    };
    let ai_provider = if shared_kpis.events == 0 {
        "unavailable"
    } else {
        "stored-nlp-aggregates"
    };

    let payload = json!({"success": true, "data": {
         "updated_at": chrono::Utc::now().to_rfc3339(),
         "available_years": available_years,
         "available_diseases": available_diseases,
         "current_epi_week": current_epi_week,
         "current_epi_year": current_epi_year,
         "filters": {
             "country": selected_country,
             "scope": country_key,
             "year": selected_year,
             "disease": selected_disease,
             "source": selected_source,
             "start_year": start_year,
             "start_week": start_week_val,
             "end_year": end_year,
             "end_week": end_week_val,
             "start_date": start_date.to_string(),
             "end_date": end_date.to_string(),
         },
         "kpis": kpis_json_with_snapshot(&snapshot),
         "map_locations_limit": 250,
         "alerts": alerts, "locations": locations, "by_disease": by_disease, "trends": trends,
         "weekly_trend": weekly_trend,
         "by_country": by_country,
         "ai_summary": {"text": summary_text, "provider": ai_provider, "cached": false, "mode": "evidence-from-kpis"}
    }});
    if let Ok(mut guard) = PUBLIC_DASH_CACHE.lock() {
        *guard = Some(PublicDashCache {
            key: cache_key,
            expires_at: Instant::now() + Duration::from_secs(15),
            payload: payload.clone(),
        });
    }
    Ok(Json(payload))
}

#[allow(dead_code)]
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

fn validate_interoperability_status(status: &str) -> Result<(), (StatusCode, Json<Value>)> {
    match status {
        "ACTIVE" | "IN_PROGRESS" | "INACTIVE" | "ERROR" | "PLANNED" => Ok(()),
        _ => Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "success": false,
                "error": "Invalid integration status. Use ACTIVE, IN_PROGRESS, INACTIVE, ERROR, or PLANNED.",
            })),
        )),
    }
}

fn normalize_integrated_in(value: Value) -> Value {
    if value.is_array() { value } else { json!([]) }
}

fn interoperability_value(row: &tokio_postgres::Row) -> Value {
    json!({
        "id": row.get::<_, Uuid>(0),
        "name": row.get::<_, String>(1),
        "integration_type": row.get::<_, String>(2),
        "provider": row.get::<_, Option<String>>(3),
        "source_url": row.get::<_, Option<String>>(4),
        "endpoint": row.get::<_, Option<String>>(5),
        "status": row.get::<_, String>(6),
        "integrated_in": row.get::<_, Value>(7),
        "description": row.get::<_, Option<String>>(8),
        "enabled": row.get::<_, bool>(9),
        "last_checked_at": row.get::<_, Option<String>>(10),
        "last_error": row.get::<_, Option<String>>(11),
        "created_at": row.get::<_, Option<String>>(12),
        "updated_at": row.get::<_, Option<String>>(13),
    })
}

async fn list_interoperability_integrations(
    State(state): State<Arc<AppState>>,
    Query(query): Query<InteroperabilityIntegrationsQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);
    let rows = client.query(
        "SELECT id, name, integration_type, provider, source_url, endpoint, status,
                integrated_in, description, enabled, last_checked_at::text, last_error,
                created_at::text, updated_at::text
         FROM interoperability_integrations
         WHERE ($1::text IS NULL OR name ILIKE '%'||$1||'%' OR provider ILIKE '%'||$1||'%' OR integration_type ILIKE '%'||$1||'%')
           AND ($2::text IS NULL OR status = $2)
           AND ($3::bool IS NULL OR enabled = $3)
         ORDER BY updated_at DESC
         LIMIT $4 OFFSET $5",
        &[&query.q, &query.status, &query.enabled, &per_page, &offset],
    ).await.map_err(internal_error)?;
    let data = rows.iter().map(interoperability_value).collect::<Vec<_>>();
    let total: i64 = client.query_one(
        "SELECT COUNT(*) FROM interoperability_integrations
         WHERE ($1::text IS NULL OR name ILIKE '%'||$1||'%' OR provider ILIKE '%'||$1||'%' OR integration_type ILIKE '%'||$1||'%')
           AND ($2::text IS NULL OR status = $2)
           AND ($3::bool IS NULL OR enabled = $3)",
        &[&query.q, &query.status, &query.enabled],
    ).await.map_err(internal_error)?.get(0);

    Ok(Json(ApiResponse {
        success: true,
        data,
        total: Some(total),
        page: Some(page),
        per_page: Some(per_page),
        total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

async fn get_interoperability_integration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client.query_opt(
        "SELECT id, name, integration_type, provider, source_url, endpoint, status,
                integrated_in, description, enabled, last_checked_at::text, last_error,
                created_at::text, updated_at::text
         FROM interoperability_integrations WHERE id = $1",
        &[&id],
    ).await.map_err(internal_error)?.ok_or_else(|| (
        StatusCode::NOT_FOUND,
        Json(json!({ "success": false, "error": "Integration not found" })),
    ))?;

    Ok(Json(ApiResponse {
        success: true,
        data: interoperability_value(&row),
        total: None, page: None, per_page: None, total_pages: None,
    }))
}

async fn create_interoperability_integration(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<CreateInteroperabilityIntegrationRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let _admin = require_admin(&state, &headers).await?;
    let name = payload.name.trim();
    let integration_type = payload.integration_type.trim();
    if name.is_empty() || integration_type.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "Name and integration type are required" })),
        ));
    }
    let status = payload.status.as_deref().unwrap_or("PLANNED");
    validate_interoperability_status(status)?;
    let integrated_in = normalize_integrated_in(payload.integrated_in);
    let enabled = payload.enabled.unwrap_or(true);
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client.query_one(
        "INSERT INTO interoperability_integrations
            (name, integration_type, provider, source_url, endpoint, status, integrated_in,
             description, enabled, last_checked_at, last_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::timestamptz, $11)
         RETURNING id, name, integration_type, provider, source_url, endpoint, status,
                   integrated_in, description, enabled, last_checked_at::text, last_error,
                   created_at::text, updated_at::text",
        &[&name, &integration_type, &payload.provider, &payload.source_url, &payload.endpoint,
          &status, &integrated_in, &payload.description, &enabled, &payload.last_checked_at,
          &payload.last_error],
    ).await.map_err(|e| {
        tracing::error!(error = ?e, "Failed to create interoperability integration");
        (StatusCode::BAD_REQUEST, Json(json!({ "success": false, "error": e.to_string() })))
    })?;

    Ok(Json(ApiResponse { success: true, data: interoperability_value(&row), total: None, page: None, per_page: None, total_pages: None }))
}

async fn update_interoperability_integration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<UpdateInteroperabilityIntegrationRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let _admin = require_admin(&state, &headers).await?;
    if let Some(status) = payload.status.as_deref() { validate_interoperability_status(status)?; }
    if let Some(name) = payload.name.as_deref() {
        if name.trim().is_empty() {
            return Err((StatusCode::BAD_REQUEST, Json(json!({ "success": false, "error": "Name cannot be empty" }))));
        }
    }
    let integrated_in = payload.integrated_in.map(normalize_integrated_in);
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client.query_opt(
        "UPDATE interoperability_integrations
         SET name = COALESCE($1, name), integration_type = COALESCE($2, integration_type),
             provider = COALESCE($3, provider), source_url = COALESCE($4, source_url),
             endpoint = COALESCE($5, endpoint), status = COALESCE($6, status),
             integrated_in = COALESCE($7, integrated_in), description = COALESCE($8, description),
             enabled = COALESCE($9, enabled),
             last_checked_at = COALESCE($10::text::timestamptz, last_checked_at),
             last_error = COALESCE($11, last_error), updated_at = NOW()
         WHERE id = $12
         RETURNING id, name, integration_type, provider, source_url, endpoint, status,
                   integrated_in, description, enabled, last_checked_at::text, last_error,
                   created_at::text, updated_at::text",
        &[&payload.name, &payload.integration_type, &payload.provider, &payload.source_url,
          &payload.endpoint, &payload.status, &integrated_in, &payload.description, &payload.enabled,
          &payload.last_checked_at, &payload.last_error, &id],
    ).await.map_err(internal_error)?.ok_or_else(|| (
        StatusCode::NOT_FOUND,
        Json(json!({ "success": false, "error": "Integration not found" })),
    ))?;

    Ok(Json(ApiResponse { success: true, data: interoperability_value(&row), total: None, page: None, per_page: None, total_pages: None }))
}

async fn delete_interoperability_integration(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<Value>)> {
    let _admin = require_admin(&state, &headers).await?;
    let client = state.db.get().await.map_err(internal_error)?;
    let deleted = client.execute("DELETE FROM interoperability_integrations WHERE id = $1", &[&id])
        .await.map_err(internal_error)?;
    if deleted == 0 {
        return Err((StatusCode::NOT_FOUND, Json(json!({ "success": false, "error": "Integration not found" }))));
    }
    Ok(Json(ApiResponse { success: true, data: "Integration deleted".to_string(), total: None, page: None, per_page: None, total_pages: None }))
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
                    CASE WHEN lr.status IS NULL THEN NULL ELSE json_build_object(
                        'status', lr.status,
                        'records_found', lr.records_found,
                        'records_ingested', lr.records_ingested,
                        'started_at', lr.started_at::text,
                        'finished_at', lr.finished_at::text
                    ) END AS last_run,
                    COALESCE(s.credibility_score, sc.score, 0.50) AS source_credibility,
                    s.country,
                    COALESCE(NULLIF(BTRIM(s.config->>'catalog_type'), ''), s.source_type) AS catalog_type,
                    NULLIF(BTRIM(s.config->>'validity_status'), '') AS validity_status,
                    NULLIF(BTRIM(s.config->>'source_origin'), '') AS source_origin,
                    EXISTS (
                        SELECT 1 FROM collector_runs r
                        WHERE r.source_id = s.id
                          AND r.status = 'RUNNING'
                          AND r.finished_at IS NULL
                          AND r.started_at >= NOW() - INTERVAL '30 minutes'
                    ) AS in_flight,
                    COALESCE(s.coverage_scope, 'unclassified') AS coverage_scope,
                    COALESCE(s.covers_asean, FALSE) AS covers_asean,
                    s.credibility_reason,
                    s.last_credibility_refresh::text,
                    s.credibility_override
             FROM collector_sources s
             LEFT JOIN LATERAL (
                 SELECT status, records_found, records_ingested, started_at, finished_at
                 FROM collector_runs
                 WHERE source_id = s.id
                   AND NOT (
                     status = 'RUNNING'
                     AND finished_at IS NULL
                     AND started_at < NOW() - INTERVAL '30 minutes'
                   )
                 ORDER BY started_at DESC LIMIT 1
             ) lr ON TRUE
             LEFT JOIN source_credibility sc ON LOWER(sc.source_type) = abvc_source_credibility_type(s.config, s.source_type) AND sc.is_active = TRUE
             WHERE ($1::text IS NULL OR s.name ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR s.source_type = $2)
             AND ($3::bool IS NULL OR s.enabled = $3)
             AND ($6::text IS NULL OR s.coverage_scope = $6)
             AND ($7::bool IS NULL OR s.covers_asean = $7)
             ORDER BY s.created_at DESC
             LIMIT $4 OFFSET $5",
            &[&query.q, &query.source_type, &query.enabled, &per_page, &offset, &query.coverage_scope, &query.covers_asean],
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
                "country": r.get::<_, Option<String>>(10),
                "schedule": r.get::<_, Option<String>>(4),
                "effective_schedule": r.get::<_, Option<String>>(4).filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "interval:60".to_string()),
                "enabled": r.get::<_, bool>(5),
                "created_at": r.get::<_, Option<String>>(6),
                "updated_at": r.get::<_, Option<String>>(7),
                "last_run": last_run,
                "in_flight": r.get::<_, bool>(14),
                "source_credibility": r.get::<_, Option<f64>>(9),
                "catalog_type": r.get::<_, String>(11),
                "validity_status": r.get::<_, Option<String>>(12),
                "source_origin": r.get::<_, Option<String>>(13),
                "coverage_scope": r.get::<_, String>(15),
                "covers_asean": r.get::<_, bool>(16),
                "credibility_reason": r.get::<_, Option<String>>(17),
                "last_credibility_refresh": r.get::<_, Option<String>>(18),
                "credibility_override": r.get::<_, Option<f64>>(19),
            })
        })
        .collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM collector_sources s
             WHERE ($1::text IS NULL OR s.name ILIKE '%'||$1||'%')
             AND ($2::text IS NULL OR s.source_type = $2)
             AND ($3::bool IS NULL OR s.enabled = $3)
             AND ($4::text IS NULL OR s.coverage_scope = $4)
             AND ($5::bool IS NULL OR s.covers_asean = $5)",
            &[&query.q, &query.source_type, &query.enabled, &query.coverage_scope, &query.covers_asean],
        )
        .await
        .map_err(internal_error)?
        .get(0);

    Ok(Json(ApiResponse {
        success: true, data, total: Some(total), page: Some(page), per_page: Some(per_page), total_pages: Some(calc_total_pages(total, per_page)),
    }))
}

async fn source_summary(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;

    // Source credibility: stored refresh score when present, else type baseline.
    // The threshold is env-configurable (SOURCE_CREDIBILITY_THRESHOLD, default 0.70).
    // It is a catalog/domain score, not epidemiologist verification.
    let threshold = source_credibility_threshold();
    let totals = client
        .query_one(
            "SELECT COUNT(*)::bigint AS total_sources,
                    COUNT(*) FILTER (WHERE LOWER(s.source_type) = 'web')::bigint AS web_sources,
                    COUNT(*) FILTER (WHERE COALESCE(s.credibility_score, sc.score, 0.50) >= $1)::bigint AS credible_sources,
                    COUNT(*) FILTER (WHERE COALESCE(s.credibility_score, sc.score, 0.50) < $1)::bigint AS needs_review_sources,
                    COALESCE(AVG(COALESCE(s.credibility_score, sc.score, 0.50)), 0.0)::double precision AS average_credibility,
                    COUNT(*) FILTER (WHERE abvc_asean11_source_country(s.country) IS NOT NULL)::bigint AS asean_sources,
                    COUNT(*) FILTER (WHERE s.coverage_scope = 'global_outlet')::bigint AS global_outlet_sources,
                    COUNT(*) FILTER (WHERE s.coverage_scope = 'unclassified' OR s.country IS NULL OR BTRIM(s.country) = '')::bigint AS unclassified_sources,
                    COUNT(*) FILTER (WHERE COALESCE(s.covers_asean, FALSE))::bigint AS covers_asean_sources,
                    COUNT(*) FILTER (WHERE s.coverage_scope = 'global_outlet' AND COALESCE(s.covers_asean, FALSE))::bigint AS global_covering_asean,
                    COUNT(*) FILTER (WHERE abvc_asean11_source_country(s.country) IS NULL)::bigint AS source_country_unfilled,
                    MAX(s.last_credibility_refresh)::text AS last_credibility_refresh
             FROM collector_sources s
             LEFT JOIN source_credibility sc ON LOWER(sc.source_type) = abvc_source_credibility_type(s.config, s.source_type)
               AND sc.is_active = TRUE
             WHERE s.id IS NOT NULL",
            &[&threshold],
        )
        .await
        .map_err(internal_error)?;

    let total_sources: i64 = totals.get(0);
    let asean_sources: i64 = totals.get(5);
    let source_country_unfilled: i64 = totals.get(10);
    let country_rows = client
        .query(
            "WITH normalized AS (
                 SELECT abvc_asean11_source_country(country) AS country
                 FROM collector_sources
             )
             SELECT country, COUNT(*)::bigint AS source_count
             FROM normalized
             WHERE country IS NOT NULL
             GROUP BY country
             ORDER BY source_count DESC, country ASC",
            &[],
        )
        .await
        .map_err(internal_error)?;

    let asean_by_country: Vec<Value> = country_rows
        .into_iter()
        .map(|row| json!({
            "country": row.get::<_, String>(0),
            "source_count": row.get::<_, i64>(1),
        }))
        .collect();

    let catalog_rows = client
        .query(
            "SELECT COALESCE(NULLIF(BTRIM(config->>'catalog_type'), ''), source_type) AS catalog_type,
                    COUNT(*)::bigint AS source_count
             FROM collector_sources
             GROUP BY 1
             ORDER BY source_count DESC, catalog_type ASC",
            &[],
        )
        .await
        .map_err(internal_error)?;
    let by_catalog_type: Vec<Value> = catalog_rows
        .into_iter()
        .map(|row| json!({
            "catalog_type": row.get::<_, String>(0),
            "source_count": row.get::<_, i64>(1),
        }))
        .collect();

    let crawl_health = client
        .query_one(
            "SELECT
                COUNT(*) FILTER (WHERE enabled = TRUE AND LOWER(COALESCE(source_type,'')) <> 'skdr_api')::bigint AS enabled_sources,
                COUNT(*) FILTER (WHERE enabled = TRUE AND LOWER(COALESCE(source_type,'')) <> 'skdr_api')::bigint AS scheduled_sources,
                (SELECT COUNT(*)::bigint FROM collector_runs
                  WHERE status = 'RUNNING'
                    AND finished_at IS NULL
                    AND started_at >= NOW() - INTERVAL '30 minutes') AS active_run_count,
                (SELECT MAX(started_at)::text FROM collector_runs) AS last_run_at
             FROM collector_sources",
            &[],
        )
        .await
        .ok();

    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "total_sources": total_sources,
            "web_sources": totals.get::<_, i64>(1),
            "credible_sources": totals.get::<_, i64>(2),
            "needs_review_sources": totals.get::<_, i64>(3),
            "average_credibility": totals.get::<_, f64>(4),
            "asean_sources": asean_sources,
            "asean_outlet_sources": asean_sources,
            "outside_sources": source_country_unfilled,
            "source_country_unfilled": source_country_unfilled,
            "global_outlet_sources": totals.get::<_, i64>(6),
            "unclassified_sources": totals.get::<_, i64>(7),
            "covers_asean_sources": totals.get::<_, i64>(8),
            "global_covering_asean": totals.get::<_, i64>(9),
            "asean_by_country": asean_by_country,
            "by_catalog_type": by_catalog_type,
            "credibility_threshold": threshold,
            "last_credibility_refresh": totals.get::<_, Option<String>>(11),
            "credibility_meaning": "Catalog/domain reputation score, not epidemiologist verification.",
            "source_country_meaning": "source_country is the outlet attribution (ASEAN-11 member or GLOBAL). It is not the article event country. Global aggregators used for ASEAN monitoring have covers_asean=true.",
            "enabled_sources": crawl_health.as_ref().map(|row| row.get::<_, i64>(0)).unwrap_or(0),
            "scheduled_sources": crawl_health.as_ref().map(|row| row.get::<_, i64>(1)).unwrap_or(0),
            "active_run_count": crawl_health.as_ref().map(|row| row.get::<_, i64>(2)).unwrap_or(0),
            "last_run_at": crawl_health.as_ref().and_then(|row| row.get::<_, Option<String>>(3)),
            "crawler_mode": "continuous_interval_with_backoff",
        }),
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
}

// ─── CREATE / UPDATE / DELETE SOURCE ──────────────────

async fn create_source(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateSourceRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (coverage_scope, covers_asean) = source_coverage_fields(&payload.country);
    let row = client
        .query_one(
            "INSERT INTO collector_sources (name, source_type, config, schedule, country, coverage_scope, covers_asean)
             VALUES ($1, $2, $3, $4, COALESCE($5, NULLIF(BTRIM($3->>'country'), '')), $6, $7)
             RETURNING id, name, source_type, config, schedule, enabled, created_at::text, updated_at::text, country, coverage_scope, covers_asean",
            &[&payload.name, &payload.source_type, &payload.config, &payload.schedule, &payload.country, &coverage_scope, &covers_asean],
        )
        .await
        .map_err(internal_error)?;

    let data = json!({
        "id": row.get::<_, Uuid>(0),
        "name": row.get::<_, String>(1),
        "source_type": row.get::<_, String>(2),
        "config": row.get::<_, Value>(3),
        "country": row.get::<_, Option<String>>(8),
        "coverage_scope": row.get::<_, String>(9),
        "covers_asean": row.get::<_, bool>(10),
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
                    COALESCE(s.credibility_score, sc.score, 0.50) AS source_credibility, s.country,
                    COALESCE(NULLIF(BTRIM(s.config->>'catalog_type'), ''), s.source_type) AS catalog_type,
                    NULLIF(BTRIM(s.config->>'validity_status'), '') AS validity_status,
                    NULLIF(BTRIM(s.config->>'source_origin'), '') AS source_origin,
                    COALESCE(s.coverage_scope, 'unclassified') AS coverage_scope,
                    COALESCE(s.covers_asean, FALSE) AS covers_asean,
                    s.credibility_reason,
                    s.last_credibility_refresh::text,
                    s.credibility_override
             FROM collector_sources s
             LEFT JOIN source_credibility sc ON LOWER(sc.source_type) = abvc_source_credibility_type(s.config, s.source_type) AND sc.is_active = TRUE
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
            "country": row.get::<_, Option<String>>(9),
            "schedule": row.get::<_, Option<String>>(4),
            "enabled": row.get::<_, bool>(5),
            "created_at": row.get::<_, Option<String>>(6),
            "updated_at": row.get::<_, Option<String>>(7),
            "source_credibility": row.get::<_, Option<f64>>(8),
            "catalog_type": row.get::<_, String>(10),
            "validity_status": row.get::<_, Option<String>>(11),
            "source_origin": row.get::<_, Option<String>>(12),
            "coverage_scope": row.get::<_, String>(13),
            "covers_asean": row.get::<_, bool>(14),
            "credibility_reason": row.get::<_, Option<String>>(15),
            "last_credibility_refresh": row.get::<_, Option<String>>(16),
            "credibility_override": row.get::<_, Option<f64>>(17),
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
                "SELECT id, name, source_type, config, schedule, enabled, country FROM collector_sources WHERE id = $1",
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
            "country": row.get::<_, Option<String>>(6),
        });
        e
    };

    let name = payload.name.unwrap_or_else(|| existing["name"].as_str().unwrap_or("").to_string());
    let source_type = payload.source_type.unwrap_or_else(|| existing["source_type"].as_str().unwrap_or("").to_string());
    let config = payload.config.unwrap_or_else(|| existing["config"].clone());
    let schedule = payload.schedule.or_else(|| existing["schedule"].as_str().map(|s| s.to_string()));
    let enabled = payload.enabled.unwrap_or_else(|| existing["enabled"].as_bool().unwrap_or(true));
    let country = payload.country.or_else(|| existing["country"].as_str().map(|s| s.to_string()));
    let (coverage_scope, covers_asean) = source_coverage_fields(&country);

    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "UPDATE collector_sources SET name=$1, source_type=$2, config=$3, schedule=$4, enabled=$5, country=$6,
                    coverage_scope=$7, covers_asean=$8, updated_at=NOW()
             WHERE id=$9 RETURNING id, name, source_type, config, schedule, enabled, created_at::text, updated_at::text, country, coverage_scope, covers_asean",
            &[&name, &source_type, &config, &schedule, &enabled, &country, &coverage_scope, &covers_asean, &id],
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
            "country": row.get::<_, Option<String>>(8),
            "coverage_scope": row.get::<_, String>(9),
            "covers_asean": row.get::<_, bool>(10),
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
            "SELECT r.id, r.source_id, s.name AS source_name, r.status, r.records_found, r.records_ingested, r.error_message, r.started_at::text, r.finished_at::text, s.schedule
             FROM collector_runs r
             LEFT JOIN collector_sources s ON s.id = r.source_id
             WHERE ($1::uuid IS NULL OR r.source_id = $1)
             AND ($2::text IS NULL OR r.status = $2)
             ORDER BY r.started_at DESC
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
                "source_name": r.get::<_, Option<String>>(2),
                "status": r.get::<_, String>(3),
                "records_found": r.get::<_, i32>(4),
                "records_ingested": r.get::<_, i32>(5),
                "error_message": r.get::<_, Option<String>>(6),
                "started_at": r.get::<_, Option<String>>(7),
                "finished_at": r.get::<_, Option<String>>(8),
                "schedule": r.get::<_, Option<String>>(9),
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

async fn crawl_ops(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let failed_rows = client
        .query(
            "SELECT s.id, s.name, s.schedule, r.id, r.status, r.error_message, r.started_at::text, r.finished_at::text,
                    r.records_found, r.records_ingested
             FROM collector_sources s
             JOIN LATERAL (
                 SELECT id, status, error_message, started_at, finished_at, records_found, records_ingested
                 FROM collector_runs
                 WHERE source_id = s.id
                 ORDER BY started_at DESC
                 LIMIT 1
             ) r ON TRUE
             WHERE r.status = 'FAILED'
             ORDER BY r.started_at DESC
             LIMIT 50",
            &[],
        )
        .await
        .map_err(internal_error)?;
    let failed_queue: Vec<Value> = failed_rows
        .into_iter()
        .map(|row| json!({
            "source_id": row.get::<_, Uuid>(0),
            "source_name": row.get::<_, String>(1),
            "schedule": row.get::<_, Option<String>>(2),
            "run_id": row.get::<_, Uuid>(3),
            "status": row.get::<_, String>(4),
            "error_message": row.get::<_, Option<String>>(5),
            "started_at": row.get::<_, Option<String>>(6),
            "finished_at": row.get::<_, Option<String>>(7),
            "records_found": row.get::<_, i32>(8),
            "records_ingested": row.get::<_, i32>(9),
        }))
        .collect();

    let history_rows = client
        .query(
            "SELECT r.id, r.source_id, s.name, r.status, r.records_found, r.records_ingested,
                    r.error_message, r.started_at::text, r.finished_at::text, s.schedule
             FROM collector_runs r
             LEFT JOIN collector_sources s ON s.id = r.source_id
             ORDER BY r.started_at DESC
             LIMIT 40",
            &[],
        )
        .await
        .map_err(internal_error)?;
    let recent_history: Vec<Value> = history_rows
        .into_iter()
        .map(|row| json!({
            "id": row.get::<_, Uuid>(0),
            "source_id": row.get::<_, Uuid>(1),
            "source_name": row.get::<_, Option<String>>(2),
            "status": row.get::<_, String>(3),
            "records_found": row.get::<_, i32>(4),
            "records_ingested": row.get::<_, i32>(5),
            "error_message": row.get::<_, Option<String>>(6),
            "started_at": row.get::<_, Option<String>>(7),
            "finished_at": row.get::<_, Option<String>>(8),
            "schedule": row.get::<_, Option<String>>(9),
        }))
        .collect();

    let backoff = client
        .query_one(
            "SELECT COUNT(*)::bigint
             FROM collector_sources s
             JOIN LATERAL (
                 SELECT status FROM collector_runs
                 WHERE source_id = s.id AND status IN ('SUCCESS', 'FAILED')
                 ORDER BY started_at DESC LIMIT 1
             ) r ON TRUE
             WHERE s.enabled = TRUE AND r.status = 'FAILED'",
            &[],
        )
        .await
        .ok();

    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "failed_queue": failed_queue,
            "recent_history": recent_history,
            "backoff_source_count": backoff.map(|row| row.get::<_, i64>(0)).unwrap_or(0),
            "dispatcher": "every 2 minutes, batch of due sources, exponential backoff up to 360 minutes",
            "default_schedule": "interval:60",
        }),
        total: None, page: None, per_page: None, total_pages: None,
    }))
}

async fn recompute_source_credibility(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let _admin = require_admin(&state, &headers).await?;
    let client = state.db.get().await.map_err(internal_error)?;
    let updated: i32 = client
        .query_one("SELECT abvc_recompute_source_credibility()", &[])
        .await
        .map_err(internal_error)?
        .get(0);
    Ok(Json(ApiResponse {
        success: true,
        data: json!({
            "updated": updated,
            "threshold": source_credibility_threshold(),
            "meaning": "Catalog/domain reputation score, not epidemiologist verification.",
        }),
        total: None, page: None, per_page: None, total_pages: None,
    }))
}

// ─── AUTH ──────────────────────────────────────────

async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !security::login_allowed(&payload.username) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"success": false, "error": "Too many login attempts. Try again later."})),
        ));
    }
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_opt(
            "SELECT id, password_hash, role, COALESCE(permissions, '[\"*\"]'::jsonb) FROM users WHERE username = $1 AND is_active = TRUE",
            &[&payload.username],
        )
        .await
        .map_err(internal_error)?;

    let (user_id, stored_hash, role, perms) = match row {
        Some(r) => (
            r.get::<_, Uuid>(0),
            r.get::<_, String>(1),
            r.get::<_, String>(2),
            r.get::<_, Option<Value>>(3),
        ),
        None => {
            security::record_login_failure(&payload.username);
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({"success": false, "error": "Invalid credentials"})),
            ))
        }
    };

    if !security::verify_password(&payload.password, &stored_hash) {
        security::record_login_failure(&payload.username);
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"success": false, "error": "Invalid credentials"})),
        ));
    }
    security::clear_login_failures(&payload.username);

    if security::is_legacy_sha256_hash(&stored_hash) {
        let migrated = security::hash_password(&payload.password);
        let _ = client
            .execute(
                "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
                &[&migrated, &user_id],
            )
            .await;
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
            "permissions": perms.unwrap_or_else(|| json!(["*"])),
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
            "SELECT id, username, display_name, role, email, is_active, created_at::text, COALESCE(permissions, '[\"*\"]'::jsonb) FROM users
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
        "permissions": r.get::<_, Option<Value>>(7).unwrap_or_else(|| json!(["*"])),
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
    let hash = security::hash_password(&payload.password);
    let perms_val: Value = payload.permissions
        .map(|p| json!(p))
        .unwrap_or_else(|| {
            if payload.role.as_deref().unwrap_or("").to_lowercase() == "admin" {
                json!(["*"])
            } else {
                json!([])
            }
        });

    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO users (username, password_hash, display_name, role, email, permissions) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, display_name, role, email, is_active, created_at::text, COALESCE(permissions, '[\"*\"]'::jsonb)",
            &[&payload.username, &hash, &payload.display_name, &payload.role, &payload.email, &perms_val],
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
        "permissions": row.get::<_, Option<Value>>(7).unwrap_or_else(|| json!(["*"])),
    }})))
}

async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_opt("SELECT id, username, display_name, role, email, is_active, created_at::text, COALESCE(permissions, '[\"*\"]'::jsonb) FROM users WHERE id = $1", &[&id])
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
        "permissions": row.get::<_, Option<Value>>(7).unwrap_or_else(|| json!(["*"])),
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

    let hash = payload.password.filter(|pw| !pw.trim().is_empty()).map(|pw| security::hash_password(&pw));
    let perms_val: Option<Value> = payload.permissions.map(|p| json!(p));

    let result = client
        .query_one(
            "UPDATE users SET
                password_hash = COALESCE($1, password_hash),
                display_name = COALESCE($2, display_name),
                role = COALESCE($3, role),
                email = COALESCE($4, email),
                is_active = COALESCE($5, is_active),
                permissions = COALESCE($6, permissions),
                updated_at = NOW()
             WHERE id = $7
             RETURNING id, username, display_name, role, email, is_active, created_at::text, COALESCE(permissions, '[\"*\"]'::jsonb)",
            &[&hash, &payload.display_name, &payload.role, &payload.email, &payload.is_active, &perms_val, &id],
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
            "permissions": row.get::<_, Option<Value>>(7).unwrap_or_else(|| json!(["*"])),
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

async fn list_roles(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let rows = client
        .query(
            "SELECT r.id, r.name, r.description, r.permissions, r.is_system, r.created_at::text,
                    (SELECT COUNT(*)::bigint FROM users u WHERE LOWER(u.role) = LOWER(r.id)) AS user_count
             FROM user_roles r
             ORDER BY r.is_system DESC, r.created_at ASC",
            &[],
        )
        .await
        .map_err(internal_error)?;

    let data: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.get::<_, String>(0),
                "name": r.get::<_, String>(1),
                "description": r.get::<_, Option<String>>(2),
                "permissions": r.get::<_, Option<Value>>(3).unwrap_or_else(|| json!([])),
                "is_system": r.get::<_, bool>(4),
                "created_at": r.get::<_, Option<String>>(5),
                "user_count": r.get::<_, i64>(6),
            })
        })
        .collect();

    Ok(Json(json!({ "success": true, "data": data })))
}

async fn create_role(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateRoleRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let raw_name = payload.name.trim();
    if raw_name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "Nama level/peran tidak boleh kosong"})),
        ));
    }

    let mut slug = raw_name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>();
    while slug.contains("__") {
        slug = slug.replace("__", "_");
    }
    let slug = slug.trim_matches('_').to_string();
    let role_id = if slug.is_empty() {
        format!("role_{}", &Uuid::new_v4().to_string()[..8])
    } else {
        slug
    };

    let perms_val: Value = payload.permissions
        .map(|p| json!(p))
        .unwrap_or_else(|| json!([]));

    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO user_roles (id, name, description, permissions, is_system)
             VALUES ($1, $2, $3, $4, FALSE)
             RETURNING id, name, description, permissions, is_system, created_at::text",
            &[&role_id, &raw_name, &payload.description.as_deref().map(|s| s.trim()), &perms_val],
        )
        .await
        .map_err(|e| {
            tracing::error!("{:?}", e);
            (
                StatusCode::CONFLICT,
                Json(json!({"success": false, "error": "Level/peran dengan nama ini sudah terdaftar"})),
            )
        })?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": row.get::<_, String>(0),
            "name": row.get::<_, String>(1),
            "description": row.get::<_, Option<String>>(2),
            "permissions": row.get::<_, Option<Value>>(3).unwrap_or_else(|| json!([])),
            "is_system": row.get::<_, bool>(4),
            "created_at": row.get::<_, Option<String>>(5),
            "user_count": 0,
        }
    })))
}

async fn update_role(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateRoleRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;

    let existing = client
        .query_opt("SELECT id, is_system FROM user_roles WHERE id = $1", &[&id])
        .await
        .map_err(internal_error)?;

    if existing.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "error": "Level/peran tidak ditemukan"})),
        ));
    }

    let perms_val: Option<Value> = payload.permissions.map(|p| json!(p));

    let row = client
        .query_one(
            "UPDATE user_roles
             SET name = COALESCE($1, name),
                 description = COALESCE($2, description),
                 permissions = COALESCE($3, permissions),
                 updated_at = NOW()
             WHERE id = $4
             RETURNING id, name, description, permissions, is_system, created_at::text,
                       (SELECT COUNT(*)::bigint FROM users u WHERE LOWER(u.role) = LOWER($4)) AS user_count",
            &[&payload.name.as_deref().map(|s| s.trim()), &payload.description.as_deref().map(|s| s.trim()), &perms_val, &id],
        )
        .await
        .map_err(internal_error)?;

    Ok(Json(json!({
        "success": true,
        "data": {
            "id": row.get::<_, String>(0),
            "name": row.get::<_, String>(1),
            "description": row.get::<_, Option<String>>(2),
            "permissions": row.get::<_, Option<Value>>(3).unwrap_or_else(|| json!([])),
            "is_system": row.get::<_, bool>(4),
            "created_at": row.get::<_, Option<String>>(5),
            "user_count": row.get::<_, i64>(6),
        }
    })))
}

async fn delete_role(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;

    let existing = client
        .query_opt("SELECT is_system FROM user_roles WHERE id = $1", &[&id])
        .await
        .map_err(internal_error)?;

    match existing {
        Some(r) => {
            let is_system: bool = r.get(0);
            if is_system {
                return Err((
                    StatusCode::FORBIDDEN,
                    Json(json!({"success": false, "error": "Peran sistem bawaan tidak dapat dihapus"})),
                ));
            }
        }
        None => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({"success": false, "error": "Level/peran tidak ditemukan"})),
            ));
        }
    }

    let user_count: i64 = client
        .query_one("SELECT COUNT(*) FROM users WHERE LOWER(role) = LOWER($1)", &[&id])
        .await
        .map_err(internal_error)?
        .get(0);

    if user_count > 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": format!("Tidak dapat menghapus peran ini karena masih digunakan oleh {} akun pengguna", user_count)})),
        ));
    }

    client
        .execute("DELETE FROM user_roles WHERE id = $1", &[&id])
        .await
        .map_err(internal_error)?;

    Ok(Json(json!({"success": true, "message": "Peran berhasil dihapus"})))
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

// ─── DISEASE MASTER (WHO ICD-11 CONCEPTS) ───────

async fn list_disease_concepts(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DiseaseConceptQuery>,
) -> Result<Json<ApiResponse<Vec<Value>>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let (page, per_page, offset) = build_pagination(query.page, query.per_page);
    let rows = client
        .query(
            "SELECT id, canonical_name, ontology_system, ontology_code, ontology_uri,
                    ontology_release, source, confidence, is_active,
                    created_at::text, updated_at::text
             FROM disease_concepts
             WHERE ($1::text IS NULL OR canonical_name ILIKE '%'||$1||'%'
                    OR ontology_code ILIKE '%'||$1||'%'
                    OR source ILIKE '%'||$1||'%' OR EXISTS (
                        SELECT 1 FROM disease_aliases a
                        WHERE a.concept_id = disease_concepts.id
                          AND a.is_active = TRUE
                          AND a.alias ILIKE '%'||$1||'%'
                    ))
               AND ($2::bool IS NULL OR is_active = $2)
             ORDER BY canonical_name
             LIMIT $3 OFFSET $4",
            &[&query.q, &query.is_active, &per_page, &offset],
        )
        .await
        .map_err(internal_error)?;

    let data: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<_, Uuid>(0),
                "canonical_name": r.get::<_, String>(1),
                "ontology_system": r.get::<_, Option<String>>(2),
                "ontology_code": r.get::<_, Option<String>>(3),
                "ontology_uri": r.get::<_, Option<String>>(4),
                "ontology_release": r.get::<_, Option<String>>(5),
                "source": r.get::<_, String>(6),
                "confidence": r.get::<_, f64>(7),
                "is_active": r.get::<_, bool>(8),
                "created_at": r.get::<_, Option<String>>(9),
                "updated_at": r.get::<_, Option<String>>(10),
            })
        })
        .collect();

    let total: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM disease_concepts
             WHERE ($1::text IS NULL OR canonical_name ILIKE '%'||$1||'%'
                    OR ontology_code ILIKE '%'||$1||'%'
                    OR source ILIKE '%'||$1||'%' OR EXISTS (
                        SELECT 1 FROM disease_aliases a
                        WHERE a.concept_id = disease_concepts.id
                          AND a.is_active = TRUE
                          AND a.alias ILIKE '%'||$1||'%'
                    ))
               AND ($2::bool IS NULL OR is_active = $2)",
            &[&query.q, &query.is_active],
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

async fn create_disease_concept(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateDiseaseConceptRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    let canonical_name = payload.canonical_name.trim();
    if canonical_name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "WHO ICD-11 disease name is required"})),
        ));
    }

    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "INSERT INTO disease_concepts
                (canonical_name, english_name, ontology_system, ontology_code,
                 ontology_uri, ontology_release, source, confidence, is_active)
             VALUES ($1, $1, COALESCE(NULLIF($2, ''), 'WHO ICD-11 MMS'), $3,
                     $4, $5, COALESCE(NULLIF($6, ''), 'manual'),
                     COALESCE($7, 1.0), COALESCE($8, TRUE))
             RETURNING id, canonical_name, ontology_system, ontology_code,
                       ontology_uri, ontology_release, source, confidence,
                       is_active, created_at::text, updated_at::text",
            &[
                &canonical_name,
                &payload.ontology_system,
                &payload.ontology_code,
                &payload.ontology_uri,
                &payload.ontology_release,
                &payload.source,
                &payload.confidence,
                &payload.is_active,
            ],
        )
        .await
        .map_err(|e| {
            (
                StatusCode::CONFLICT,
                Json(json!({"success": false, "error": format!("Disease concept already exists or is invalid: {e}")})),
            )
        })?;

    reload_nlp_runtime(&state).await;
    Ok(Json(ApiResponse {
        success: true,
        data: disease_concept_json(&row),
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
}

async fn update_disease_concept(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateDiseaseConceptRequest>,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    if payload
        .canonical_name
        .as_deref()
        .map(|value| value.trim().is_empty())
        .unwrap_or(false)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "WHO ICD-11 disease name cannot be empty"})),
        ));
    }

    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_one(
            "UPDATE disease_concepts
             SET canonical_name = COALESCE(NULLIF($1, ''), canonical_name),
                 english_name = COALESCE(NULLIF($1, ''), english_name),
                 ontology_system = COALESCE(NULLIF($2, ''), ontology_system),
                 ontology_code = COALESCE(NULLIF($3, ''), ontology_code),
                 ontology_uri = COALESCE(NULLIF($4, ''), ontology_uri),
                 ontology_release = COALESCE(NULLIF($5, ''), ontology_release),
                 source = COALESCE(NULLIF($6, ''), source),
                 confidence = COALESCE($7, confidence),
                 is_active = COALESCE($8, is_active),
                 updated_at = NOW()
             WHERE id = $9
             RETURNING id, canonical_name, ontology_system, ontology_code,
                       ontology_uri, ontology_release, source, confidence,
                       is_active, created_at::text, updated_at::text",
            &[
                &payload.canonical_name,
                &payload.ontology_system,
                &payload.ontology_code,
                &payload.ontology_uri,
                &payload.ontology_release,
                &payload.source,
                &payload.confidence,
                &payload.is_active,
                &id,
            ],
        )
        .await
        .map_err(|e| {
            if e.code().map(|code| code.code()) == Some("23505") {
                (
                    StatusCode::CONFLICT,
                    Json(json!({"success": false, "error": "WHO ICD-11 disease name already exists"})),
                )
            } else {
                (
                    StatusCode::NOT_FOUND,
                    Json(json!({"success": false, "error": "Disease concept not found"})),
                )
            }
        })?;

    reload_nlp_runtime(&state).await;
    Ok(Json(ApiResponse {
        success: true,
        data: disease_concept_json(&row),
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
}

async fn delete_disease_concept(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let updated = client
        .execute(
            "UPDATE disease_concepts SET is_active = FALSE, updated_at = NOW() WHERE id = $1",
            &[&id],
        )
        .await
        .map_err(internal_error)?;
    if updated == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"success": false, "error": "Disease concept not found"})),
        ));
    }
    reload_nlp_runtime(&state).await;
    Ok(Json(ApiResponse {
        success: true,
        data: "deactivated".to_string(),
        total: None,
        page: None,
        per_page: None,
        total_pages: None,
    }))
}

async fn reload_nlp_runtime(state: &Arc<AppState>) {
    let url = format!("{}/reload", state.nlp_service_url.trim_end_matches('/'));
    if let Err(error) = state
        .http
        .post(url)
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        // Disease master CRUD remains successful when NLP is restarting or
        // temporarily unavailable; the next service startup reloads the DB.
        tracing::warn!("NLP runtime reload after disease master change failed: {error}");
    }
}

fn disease_concept_json(row: &tokio_postgres::Row) -> Value {
    json!({
        "id": row.get::<_, Uuid>(0),
        "canonical_name": row.get::<_, String>(1),
        "ontology_system": row.get::<_, Option<String>>(2),
        "ontology_code": row.get::<_, Option<String>>(3),
        "ontology_uri": row.get::<_, Option<String>>(4),
        "ontology_release": row.get::<_, Option<String>>(5),
        "source": row.get::<_, String>(6),
        "confidence": row.get::<_, f64>(7),
        "is_active": row.get::<_, bool>(8),
        "created_at": row.get::<_, Option<String>>(9),
        "updated_at": row.get::<_, Option<String>>(10),
    })
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
        ALTER TABLE disease_events ADD COLUMN IF NOT EXISTS disease_mentions JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '["*"]'::jsonb;

        CREATE TABLE IF NOT EXISTS user_roles (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_system BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        INSERT INTO user_roles (id, name, description, permissions, is_system)
        VALUES
        ('admin', 'ADMIN', 'Akses Penuh Seluruh Modul & Konfigurasi Sistem', '["*"]'::jsonb, TRUE),
        ('data_analyst', 'DATA ANALYST', 'Access to data analysis, events, reports, and manual crawling', '["dashboard", "events", "sources", "analyze", "manual_crawler", "processing", "reports", "locations", "disease_master"]'::jsonb, TRUE),
        ('epidemiologi', 'EPIDEMIOLOGI', 'Disease surveillance, outbreak rules, and geospatial monitoring', '["dashboard", "events", "analyze", "manual_crawler", "reports", "locations", "disease_master", "outbreak_rules", "nlp_config"]'::jsonb, TRUE),
        ('executive', 'EXECUTIVE', 'Ringkasan Eksekutif, TV Center & Matriks Laporan', '["dashboard", "events", "reports", "tv"]'::jsonb, TRUE),
        ('skk', 'SKK', 'Monitoring Feed Sumber Data & Pemrosesan Queue', '["dashboard", "sources", "reports", "processing"]'::jsonb, TRUE)
        ON CONFLICT (id) DO NOTHING;
        UPDATE user_roles
        SET permissions = permissions || '["disease_master"]'::jsonb,
            updated_at = NOW()
        WHERE id IN ('data_analyst', 'epidemiologi')
          AND NOT (permissions ? 'disease_master')
          AND NOT (permissions ? '*');
        UPDATE user_roles
        SET permissions = permissions || '["manual_crawler"]'::jsonb,
            updated_at = NOW()
        WHERE id IN ('data_analyst', 'epidemiologi', 'skk')
          AND NOT (permissions ? 'manual_crawler')
          AND NOT (permissions ? '*');
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

        CREATE TABLE IF NOT EXISTS kpi_snapshots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            filter_key TEXT NOT NULL UNIQUE,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            country TEXT NOT NULL DEFAULT 'ASEAN',
            disease TEXT NOT NULL DEFAULT 'all',
            source TEXT NOT NULL DEFAULT 'all',
            cases BIGINT NOT NULL DEFAULT 0,
            deaths BIGINT NOT NULL DEFAULT 0,
            events BIGINT NOT NULL DEFAULT 0,
            active_locations BIGINT NOT NULL DEFAULT 0,
            alerts BIGINT NOT NULL DEFAULT 0,
            location_master_count BIGINT NOT NULL DEFAULT 0,
            computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            is_stale BOOLEAN NOT NULL DEFAULT FALSE
        );
        CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_window
            ON kpi_snapshots (start_date, end_date, country, disease);
        ALTER TABLE disease_events ALTER COLUMN case_count DROP DEFAULT;
        ALTER TABLE disease_events ALTER COLUMN case_count SET DEFAULT NULL;

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

async fn require_user_token(
    state: &Arc<AppState>,
    token: &str,
) -> Result<(Uuid, String, String), (StatusCode, Json<Value>)> {
    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"success": false, "error": "Authentication required"})),
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
        Some(r) => Ok((r.get(0), r.get(1), r.get(2))),
        None => Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"success": false, "error": "Invalid or expired session"})),
        )),
    }
}

async fn require_admin_token(
    state: &Arc<AppState>,
    token: &str,
) -> Result<(Uuid, String), (StatusCode, Json<Value>)> {
    let (id, username, role) = require_user_token(state, token).await?;
    if role != "admin" && role != "superadmin" && role != "webmaster" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"success": false, "error": "Admin access required"})),
        ));
    }
    Ok((id, username))
}

async fn require_admin(
    state: &Arc<AppState>,
    headers: &axum::http::HeaderMap,
) -> Result<(Uuid, String), (StatusCode, axum::Json<serde_json::Value>)> {
    require_admin_token(state, &security::bearer_token(headers)).await
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
