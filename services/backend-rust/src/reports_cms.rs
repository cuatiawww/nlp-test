//! Editorial sitrep CMS. Report bodies are code templates bound to the
//! ASEAN-11 KPI snapshot — never LLM-generated essays.

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

use crate::{
    dashboard_valid_cte, internal_error, iso_code_for_country, kpi_snapshot_json,
    kpis_json_with_snapshot, load_or_refresh_kpi_snapshot, query_shared_by_disease,
    require_user_token, resolve_dashboard_dates, security, sql_country_param,
    sql_disease_param, AppState, ASEAN11_MEMBERS,
};

pub const TEMPLATE_ID: &str = "weekly_sitrep_v1";
pub const TEMPLATE_VERSION: &str = "1.0.0";
const DEFAULT_LIMITATIONS: &str = "Figures are aggregated from publicly available sources processed by the ABVC NLP pipeline (per-event caps applied). An ASEAN Member State (AMS) with no matching events in the reporting window is shown as No data / Not reported — never as zero. Case fatality is omitted when the case denominator is missing or zero. Official national counts may differ.";

const ALLOWED: &[(&str, &str)] = &[
    ("draft", "in_review"),
    ("in_review", "changes_requested"),
    ("in_review", "approved"),
    ("changes_requested", "draft"),
    ("changes_requested", "in_review"),
    ("approved", "in_review"),
    ("approved", "published"),
    ("published", "superseded"),
    ("published", "archived"),
    ("superseded", "archived"),
];

pub fn allowed_transition(from: &str, to: &str) -> bool {
    ALLOWED.iter().any(|(a, b)| *a == from && *b == to)
}

pub fn iso3_for_country(name: &str) -> Option<&'static str> {
    match name.trim().to_ascii_lowercase().as_str() {
        "brunei" | "brunei darussalam" => Some("BRN"),
        "cambodia" | "kampuchea" | "kamboja" => Some("KHM"),
        "indonesia" => Some("IDN"),
        "laos" | "lao pdr" | "lao people's democratic republic" => Some("LAO"),
        "malaysia" => Some("MYS"),
        "myanmar" | "burma" => Some("MMR"),
        "philippines" | "the philippines" | "philippine" => Some("PHL"),
        "singapore" | "singapura" => Some("SGP"),
        "thailand" => Some("THA"),
        "vietnam" | "viet nam" => Some("VNM"),
        "timor-leste" | "timor leste" | "east timor" => Some("TLS"),
        _ => None,
    }
}

pub fn display_ams_name(name: &str) -> &'static str {
    match name {
        "Laos" => "Lao PDR",
        "Vietnam" => "Viet Nam",
        other => {
            // Keep canonical English labels for the remaining nine AMS.
            match other {
                "Brunei" => "Brunei",
                "Cambodia" => "Cambodia",
                "Indonesia" => "Indonesia",
                "Malaysia" => "Malaysia",
                "Myanmar" => "Myanmar",
                "Philippines" => "Philippines",
                "Singapore" => "Singapore",
                "Thailand" => "Thailand",
                "Timor-Leste" => "Timor-Leste",
                _ => "Unknown",
            }
        }
    }
}

fn disease_code(name: &str) -> String {
    let mut out = String::new();
    for ch in name.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "unspecified".into()
    } else {
        trimmed
    }
}

fn cfr_json(cases: i64, deaths: i64) -> Value {
    if cases <= 0 {
        Value::Null
    } else {
        json!(((deaths as f64) * 1000.0 / (cases as f64)).round() / 10.0)
    }
}

fn slug_for(year: i32, week: i32, extra: Option<i32>) -> String {
    match extra {
        Some(n) if n > 1 => format!("sitrep-{year}-w{week:02}-{n}"),
        _ => format!("sitrep-{year}-w{week:02}"),
    }
}

fn map_meta() -> Value {
    json!({
        "indicator": "events",
        "classification": "quantile",
        "geojson_ref": "asean11_admin0_iso3",
        "missing_policy": "no_data_not_zero",
        "classes": 6,
        "palette": "ColorBrewer Blues (color-blind safe sequential)",
    })
}

async fn actor_username(state: &Arc<AppState>, headers: &HeaderMap) -> String {
    let token = security::bearer_token(headers);
    require_user_token(state, &token)
        .await
        .map(|(_, username, _)| username)
        .unwrap_or_else(|_| "unknown".into())
}

fn issue_from_row(row: &tokio_postgres::Row) -> Value {
    json!({
        "id": row.get::<_, i32>("id"),
        "slug": row.get::<_, String>("slug"),
        "title": row.get::<_, String>("title"),
        "epi_year": row.get::<_, i32>("epi_year"),
        "epi_week": row.get::<_, i32>("epi_week"),
        "period_start": row.get::<_, NaiveDate>("period_start").to_string(),
        "period_end": row.get::<_, NaiveDate>("period_end").to_string(),
        "status": row.get::<_, String>("status"),
        "template_id": row.get::<_, String>("template_id"),
        "template_version": row.get::<_, String>("template_version"),
        "cover_url": row.get::<_, Option<String>>("cover_url"),
        "highlights": row.get::<_, Value>("highlights"),
        "sections": row.get::<_, Value>("sections"),
        "kpi_snapshot": row.get::<_, Option<Value>>("kpi_snapshot"),
        "published_snapshot": row.get::<_, Option<Value>>("published_snapshot"),
        "map": row.get::<_, Value>("map_meta"),
        "sources": row.get::<_, Value>("sources"),
        "limitations": row.get::<_, Option<String>>("limitations"),
        "visibility": row.get::<_, String>("visibility"),
        "created_by": row.get::<_, Option<String>>("created_by"),
        "updated_by": row.get::<_, Option<String>>("updated_by"),
        "published_at": row.get::<_, Option<String>>("published_at"),
        "created_at": row.get::<_, Option<String>>("created_at"),
        "updated_at": row.get::<_, Option<String>>("updated_at"),
        "llm_policy": "optional_draft_notes_only_human_review_required",
    })
}

const ISSUE_SELECT: &str = r#"
    SELECT id, slug, title, epi_year, epi_week, period_start, period_end, status,
           template_id, template_version, cover_url, highlights, sections,
           kpi_snapshot, published_snapshot, map_meta, sources, limitations, visibility,
           created_by, updated_by, published_at::text, created_at::text, updated_at::text
    FROM report_issues
"#;

async fn fetch_issue(
    client: &deadpool_postgres::Object,
    id: i32,
) -> Result<tokio_postgres::Row, (StatusCode, Json<Value>)> {
    client
        .query_opt(&format!("{ISSUE_SELECT} WHERE id = $1"), &[&id])
        .await
        .map_err(internal_error)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"success": false, "error": "Report issue not found"})),
            )
        })
}

async fn record_event(
    client: &deadpool_postgres::Object,
    issue_id: i32,
    from: Option<&str>,
    to: &str,
    actor: &str,
    comment: Option<&str>,
) -> Result<(), (StatusCode, Json<Value>)> {
    client
        .execute(
            "INSERT INTO report_issue_events (issue_id, from_status, to_status, actor, comment)
             VALUES ($1, $2, $3, $4, $5)",
            &[&issue_id, &from, &to, &actor, &comment],
        )
        .await
        .map_err(internal_error)?;
    Ok(())
}

fn pad_ams_rows(rows: Vec<Value>) -> Vec<Value> {
    let mut by_name = std::collections::HashMap::<String, Value>::new();
    for row in rows {
        if let Some(name) = row.get("name").and_then(Value::as_str) {
            by_name.insert(name.to_string(), row);
        }
    }
    ASEAN11_MEMBERS
        .iter()
        .map(|name| {
            if let Some(existing) = by_name.remove(*name) {
                let cases = existing.get("cases").and_then(Value::as_i64).unwrap_or(0);
                let deaths = existing.get("deaths").and_then(Value::as_i64).unwrap_or(0);
                let events = existing.get("events").and_then(Value::as_i64).unwrap_or(0);
                json!({
                    "iso3": iso3_for_country(name),
                    "iso2": iso_code_for_country(name),
                    "country": name,
                    "display_name": display_ams_name(name),
                    "cases": cases,
                    "deaths": deaths,
                    "events": events,
                    "cfr": cfr_json(cases, deaths),
                    "has_data": true,
                })
            } else {
                json!({
                    "iso3": iso3_for_country(name),
                    "iso2": iso_code_for_country(name),
                    "country": name,
                    "display_name": display_ams_name(name),
                    "cases": Value::Null,
                    "deaths": Value::Null,
                    "events": Value::Null,
                    "cfr": Value::Null,
                    "has_data": false,
                })
            }
        })
        .collect()
}

async fn query_ams_with_events(
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
            COALESCE(SUM({deaths}), 0)::bigint AS deaths,
            COUNT(*)::bigint AS events
         FROM valid
         WHERE {}
         GROUP BY resolved_country
         ORDER BY events DESC",
        dashboard_valid_cte(),
        crate::country_scope_sql(),
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

async fn query_weekly_series(
    client: &deadpool_postgres::Object,
    start_date: NaiveDate,
    end_date: NaiveDate,
    selected_country: &Option<String>,
    selected_disease: &Option<String>,
    selected_source: &Option<String>,
) -> Result<Vec<Value>, (StatusCode, Json<Value>)> {
    let sql = format!(
        "{} SELECT TO_CHAR(published_at, 'IYYY-\"W\"IW') AS period,
            EXTRACT(ISOYEAR FROM published_at)::int AS year,
            EXTRACT(WEEK FROM published_at)::int AS week,
            COALESCE(SUM({cases}), 0)::bigint AS cases,
            COALESCE(SUM({deaths}), 0)::bigint AS deaths,
            COUNT(*)::bigint AS events
         FROM valid
         WHERE {}
         GROUP BY 1, 2, 3
         ORDER BY MIN(published_at)",
        dashboard_valid_cte(),
        crate::country_scope_sql(),
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
                "period": r.get::<_, String>("period"),
                "year": r.get::<_, i32>("year"),
                "week": r.get::<_, i32>("week"),
                "cases": r.get::<_, i64>("cases"),
                "deaths": r.get::<_, i64>("deaths"),
                "events": r.get::<_, i64>("events"),
            })
        })
        .collect())
}

async fn query_sources(
    client: &deadpool_postgres::Object,
    start_date: NaiveDate,
    end_date: NaiveDate,
    selected_country: &Option<String>,
    selected_disease: &Option<String>,
    selected_source: &Option<String>,
) -> Result<Vec<Value>, (StatusCode, Json<Value>)> {
    let sql = format!(
        "{} SELECT COALESCE(NULLIF(TRIM(source_name), ''), 'Unknown') AS name,
            COALESCE(NULLIF(TRIM(source_type), ''), 'unknown') AS source_type,
            COUNT(*)::bigint AS events
         FROM valid
         WHERE {}
         GROUP BY 1, 2
         ORDER BY events DESC
         LIMIT 20",
        dashboard_valid_cte(),
        crate::country_scope_sql(),
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
                "source_type": r.get::<_, String>("source_type"),
                "events": r.get::<_, i64>("events"),
            })
        })
        .collect())
}

async fn query_alerts(
    client: &deadpool_postgres::Object,
    start_date: NaiveDate,
    end_date: NaiveDate,
    selected_country: &Option<String>,
    selected_source: &Option<String>,
) -> Result<Vec<Value>, (StatusCode, Json<Value>)> {
    let selected_disease: Option<String> = None;
    let sql = format!(
        "{} SELECT COALESCE(NULLIF(TRIM(disease_classification), ''), 'UNKNOWN') AS disease,
            resolved_country AS country,
            COALESCE(NULLIF(TRIM(location_name), ''), resolved_country) AS location_name,
            COUNT(*)::bigint AS events,
            COALESCE(SUM({cases}), 0)::bigint AS cases
         FROM valid
         WHERE {} AND outbreak_alert = TRUE
         GROUP BY 1, 2, 3
         ORDER BY events DESC, cases DESC
         LIMIT 12",
        dashboard_valid_cte(),
        crate::country_scope_sql(),
        cases = security::SANE_CASES_SQL,
    );
    let rows = client
        .query(
            &sql,
            &[
                &start_date,
                &end_date,
                selected_country,
                &selected_disease,
                selected_source,
            ],
        )
        .await
        .map_err(internal_error)?;
    Ok(rows
        .iter()
        .map(|r| {
            let country: String = r.get("country");
            json!({
                "disease": r.get::<_, String>("disease"),
                "country": country,
                "display_name": display_ams_name(&country),
                "iso3": iso3_for_country(&country),
                "location_name": r.get::<_, String>("location_name"),
                "events": r.get::<_, i64>("events"),
                "cases": r.get::<_, i64>("cases"),
                "status": "Active",
            })
        })
        .collect())
}

pub async fn build_kpi_package(
    client: &deadpool_postgres::Object,
    epi_year: i32,
    epi_week: u32,
) -> Result<Value, (StatusCode, Json<Value>)> {
    let (week_start, week_end) = resolve_dashboard_dates(
        epi_year,
        Some(epi_year),
        Some(epi_week),
        Some(epi_year),
        Some(epi_week),
    );
    let (ytd_start, ytd_end) = resolve_dashboard_dates(
        epi_year,
        Some(epi_year),
        Some(1),
        Some(epi_year),
        Some(epi_week),
    );
    let country_key = "asean11".to_string();
    let disease_key = "all".to_string();
    let source_key = "all".to_string();
    let sql_country = sql_country_param(&country_key);
    let sql_disease = sql_disease_param(&disease_key);
    let sql_source: Option<String> = None;

    let ytd_snapshot = load_or_refresh_kpi_snapshot(
        client,
        ytd_start,
        ytd_end,
        &country_key,
        &disease_key,
        &source_key,
    )
    .await?;
    let week_snapshot = load_or_refresh_kpi_snapshot(
        client,
        week_start,
        week_end,
        &country_key,
        &disease_key,
        &source_key,
    )
    .await?;

    let ams_raw = query_ams_with_events(
        client,
        ytd_start,
        ytd_end,
        &sql_country,
        &sql_disease,
        &sql_source,
    )
    .await?;
    let by_ams = pad_ams_rows(ams_raw);

    let disease_raw = query_shared_by_disease(
        client,
        ytd_start,
        ytd_end,
        &sql_country,
        &sql_disease,
        &sql_source,
    )
    .await?;
    let mut by_disease: Vec<Value> = disease_raw
        .into_iter()
        .filter(|item| {
            let name = item.get("name").and_then(Value::as_str).unwrap_or("");
            !name.is_empty() && !name.eq_ignore_ascii_case("UNKNOWN")
        })
        .map(|item| {
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("UNKNOWN")
                .to_string();
            let cases = item.get("cases").and_then(Value::as_i64).unwrap_or(0);
            let deaths = item.get("deaths").and_then(Value::as_i64).unwrap_or(0);
            let events = item.get("events").and_then(Value::as_i64).unwrap_or(0);
            json!({
                "disease_code": disease_code(&name),
                "name": name,
                "cases": cases,
                "deaths": deaths,
                "events": events,
                "cfr": cfr_json(cases, deaths),
            })
        })
        .collect();
    by_disease.sort_by(|a, b| b["events"].as_i64().cmp(&a["events"].as_i64()));

    let series_weekly =
        query_weekly_series(client, ytd_start, ytd_end, &sql_country, &sql_disease, &sql_source)
            .await?;
    let sources = query_sources(
        client,
        ytd_start,
        ytd_end,
        &sql_country,
        &sql_disease,
        &sql_source,
    )
    .await?;
    let alerts = query_alerts(client, ytd_start, ytd_end, &sql_country, &sql_source).await?;

    let ytd = &ytd_snapshot.kpis;
    let week = &week_snapshot.kpis;

    Ok(json!({
        "kpi_source": "materialized_kpi_snapshot",
        "scope": "asean11",
        "scope_label": "ASEAN 11 jurisdictions",
        "epi_year": epi_year,
        "epi_week": epi_week,
        "week_start": week_start.to_string(),
        "week_end": week_end.to_string(),
        "ytd_start": ytd_start.to_string(),
        "ytd_end": ytd_end.to_string(),
        "pulled_at": Utc::now().to_rfc3339(),
        "snapshot": kpi_snapshot_json(&ytd_snapshot),
        "week_snapshot": kpi_snapshot_json(&week_snapshot),
        "kpis": {
            "ytd": kpis_json_with_snapshot(&ytd_snapshot),
            "week": kpis_json_with_snapshot(&week_snapshot),
            "cfr_ytd": cfr_json(ytd.cases, ytd.deaths),
            "cfr_week": cfr_json(week.cases, week.deaths),
        },
        "by_ams": by_ams,
        "by_disease": by_disease,
        "series_weekly": series_weekly,
        "sources": sources,
        "alerts": alerts,
        "map": map_meta(),
        "missing_policy": "AMS absent from the event extract render as No data / Not reported. Zero is only shown when the AMS had matching events and extracted counts summed to 0.",
    }))
}

fn merge_sections(package: &Value, previous: Option<&Value>) -> Value {
    let diseases = package
        .get("by_disease")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut notes = std::collections::HashMap::<String, String>::new();
    if let Some(Value::Array(prev)) = previous {
        for section in prev {
            if let (Some(code), Some(note)) = (
                section.get("disease_code").and_then(Value::as_str),
                section.get("analyst_note").and_then(Value::as_str),
            ) {
                if !note.trim().is_empty() {
                    notes.insert(code.to_string(), note.to_string());
                }
            }
        }
    }
    let series = package
        .get("series_weekly")
        .cloned()
        .unwrap_or(json!([]));
    let by_ams = package.get("by_ams").cloned().unwrap_or(json!([]));
    let sections: Vec<Value> = diseases
        .into_iter()
        .take(8)
        .map(|d| {
            let code = d
                .get("disease_code")
                .and_then(Value::as_str)
                .unwrap_or("unspecified")
                .to_string();
            let note = notes.remove(&code).unwrap_or_default();
            json!({
                "disease_code": code,
                "name": d.get("name"),
                "kpis": {
                    "cases": d.get("cases"),
                    "deaths": d.get("deaths"),
                    "events": d.get("events"),
                    "cfr": d.get("cfr"),
                },
                "series_weekly": series,
                "by_ams": by_ams,
                "analyst_note": note,
                "analyst_note_status": if note.is_empty() { "empty" } else { "human" },
            })
        })
        .collect();
    json!(sections)
}

fn data_highlights(package: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(week) = package.pointer("/kpis/week") {
        let events = week.get("events").and_then(Value::as_i64).unwrap_or(0);
        let cases = week.get("cases").and_then(Value::as_i64).unwrap_or(0);
        let deaths = week.get("deaths").and_then(Value::as_i64).unwrap_or(0);
        let epi_week = package.get("epi_week").and_then(Value::as_i64).unwrap_or(0);
        let epi_year = package.get("epi_year").and_then(Value::as_i64).unwrap_or(0);
        out.push(format!(
            "Epi week {epi_week}/{epi_year}: {events} ASEAN-11 health events, {cases} extracted cases, {deaths} extracted deaths (NLP snapshot, not an official national total)."
        ));
    }
    if let Some(diseases) = package.get("by_disease").and_then(Value::as_array) {
        if let Some(top) = diseases.first() {
            out.push(format!(
                "Leading disease by event count: {} ({} events, {} cases).",
                top.get("name").and_then(Value::as_str).unwrap_or("n/a"),
                top.get("events").and_then(Value::as_i64).unwrap_or(0),
                top.get("cases").and_then(Value::as_i64).unwrap_or(0)
            ));
        }
    }
    if let Some(ams) = package.get("by_ams").and_then(Value::as_array) {
        let reported = ams.iter().filter(|r| r.get("has_data").and_then(Value::as_bool).unwrap_or(false)).count();
        let missing = 11usize.saturating_sub(reported);
        out.push(format!(
            "{reported} of 11 AMS have matching events in this window; {missing} render as No data / Not reported."
        ));
    }
    out.truncate(5);
    out
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
    pub epi_year: Option<i32>,
    pub epi_week: Option<i32>,
    pub disease: Option<String>,
    pub country: Option<String>,
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateIssueRequest {
    pub epi_year: i32,
    pub epi_week: i32,
    pub title: Option<String>,
    pub template_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchIssueRequest {
    pub title: Option<String>,
    pub slug: Option<String>,
    pub highlights: Option<Value>,
    pub sections: Option<Value>,
    pub cover_url: Option<String>,
    pub limitations: Option<String>,
    pub map_indicator: Option<String>,
    pub visibility: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TransitionRequest {
    pub to_status: String,
    pub comment: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PublishRequest {
    pub slug: Option<String>,
    pub visibility: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SuggestNotesRequest {
    #[allow(dead_code)]
    pub kind: Option<String>,
}

fn public_card(row: &tokio_postgres::Row) -> Value {
    let snapshot = row
        .get::<_, Option<Value>>("published_snapshot")
        .or_else(|| row.get::<_, Option<Value>>("kpi_snapshot"));
    let kpis = snapshot
        .as_ref()
        .and_then(|s| s.pointer("/kpis/ytd").cloned())
        .unwrap_or(json!({}));
    let diseases = snapshot
        .as_ref()
        .and_then(|s| s.get("by_disease").and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .into_iter()
        .take(4)
        .filter_map(|d| d.get("name").and_then(Value::as_str).map(|s| json!(s)))
        .collect::<Vec<_>>();
    json!({
        "id": row.get::<_, i32>("id"),
        "slug": row.get::<_, String>("slug"),
        "title": row.get::<_, String>("title"),
        "epi_year": row.get::<_, i32>("epi_year"),
        "epi_week": row.get::<_, i32>("epi_week"),
        "period_start": row.get::<_, NaiveDate>("period_start").to_string(),
        "period_end": row.get::<_, NaiveDate>("period_end").to_string(),
        "status": row.get::<_, String>("status"),
        "cover_url": row.get::<_, Option<String>>("cover_url"),
        "published_at": row.get::<_, Option<String>>("published_at"),
        "template_version": row.get::<_, String>("template_version"),
        "diseases": diseases,
        "kpis": {
            "cases": kpis.get("cases"),
            "deaths": kpis.get("deaths"),
            "events": kpis.get("events"),
        }
    })
}

pub async fn list_public_issues(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let rows = client
        .query(
            &format!(
                "{ISSUE_SELECT}
                 WHERE status = 'published' AND visibility = 'public'
                 ORDER BY epi_year DESC, epi_week DESC, published_at DESC NULLS LAST"
            ),
            &[],
        )
        .await
        .map_err(internal_error)?;
    let disease_q = query.disease.as_deref().unwrap_or("").to_ascii_lowercase();
    let country_q = query.country.as_deref().unwrap_or("").to_ascii_uppercase();
    let text_q = query.q.as_deref().unwrap_or("").to_ascii_lowercase();
    let cards: Vec<Value> = rows
        .iter()
        .filter(|row| {
            query.epi_year.map(|y| row.get::<_, i32>("epi_year") == y).unwrap_or(true)
                && query.epi_week.map(|w| row.get::<_, i32>("epi_week") == w).unwrap_or(true)
        })
        .filter(|row| {
            if disease_q.is_empty() {
                return true;
            }
            let snap = row
                .get::<_, Option<Value>>("published_snapshot")
                .or_else(|| row.get("kpi_snapshot"));
            snap.and_then(|s| s.get("by_disease").cloned())
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default()
                .iter()
                .any(|d| {
                    d.get("disease_code")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .eq_ignore_ascii_case(&disease_q)
                        || d.get("name")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_ascii_lowercase()
                            .contains(&disease_q)
                })
        })
        .filter(|row| {
            if country_q.is_empty() {
                return true;
            }
            let snap = row
                .get::<_, Option<Value>>("published_snapshot")
                .or_else(|| row.get("kpi_snapshot"));
            snap.and_then(|s| s.get("by_ams").cloned())
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default()
                .iter()
                .any(|a| {
                    a.get("iso3")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .eq_ignore_ascii_case(&country_q)
                })
        })
        .filter(|row| {
            if text_q.is_empty() {
                return true;
            }
            row.get::<_, String>("title")
                .to_ascii_lowercase()
                .contains(&text_q)
                || row.get::<_, String>("slug").to_ascii_lowercase().contains(&text_q)
        })
        .map(public_card)
        .collect();
    Ok(Json(json!({"success": true, "data": cards})))
}

pub async fn get_public_issue(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_opt(
            &format!(
                "{ISSUE_SELECT}
                 WHERE slug = $1 AND status IN ('published', 'superseded') AND visibility = 'public'"
            ),
            &[&slug],
        )
        .await
        .map_err(internal_error)?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"success": false, "error": "Published issue not found"})),
            )
        })?;
    let mut issue = issue_from_row(&row);
    if let Some(obj) = issue.as_object_mut() {
        obj.insert(
            "view".into(),
            json!("public_published_snapshot"),
        );
    }
    Ok(Json(json!({"success": true, "data": issue})))
}

pub async fn get_public_latest(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = client
        .query_opt(
            &format!(
                "{ISSUE_SELECT}
                 WHERE status = 'published' AND visibility = 'public'
                 ORDER BY epi_year DESC, epi_week DESC, published_at DESC NULLS LAST
                 LIMIT 1"
            ),
            &[],
        )
        .await
        .map_err(internal_error)?;
    match row {
        Some(row) => Ok(Json(json!({"success": true, "data": public_card(&row)}))),
        None => Ok(Json(json!({"success": true, "data": Value::Null}))),
    }
}

pub async fn list_cms_issues(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let rows = client
        .query(
            &format!("{ISSUE_SELECT} ORDER BY updated_at DESC"),
            &[],
        )
        .await
        .map_err(internal_error)?;
    let wanted = query.status.as_deref().unwrap_or("").to_ascii_lowercase();
    let items: Vec<Value> = rows
        .iter()
        .filter(|row| {
            wanted.is_empty()
                || wanted == "all"
                || row.get::<_, String>("status").eq_ignore_ascii_case(&wanted)
        })
        .filter(|row| {
            query.epi_year.map(|y| row.get::<_, i32>("epi_year") == y).unwrap_or(true)
                && query.epi_week.map(|w| row.get::<_, i32>("epi_week") == w).unwrap_or(true)
        })
        .map(issue_from_row)
        .collect();
    Ok(Json(json!({"success": true, "data": items})))
}

pub async fn get_cms_issue(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = fetch_issue(&client, id).await?;
    let events = client
        .query(
            "SELECT from_status, to_status, actor, comment, created_at::text
             FROM report_issue_events WHERE issue_id = $1
             ORDER BY created_at DESC LIMIT 50",
            &[&id],
        )
        .await
        .map_err(internal_error)?;
    let changelog: Vec<Value> = events
        .iter()
        .map(|e| {
            json!({
                "from_status": e.get::<_, Option<String>>("from_status"),
                "to_status": e.get::<_, String>("to_status"),
                "actor": e.get::<_, Option<String>>("actor"),
                "comment": e.get::<_, Option<String>>("comment"),
                "created_at": e.get::<_, Option<String>>("created_at"),
            })
        })
        .collect();
    let mut issue = issue_from_row(&row);
    if let Some(obj) = issue.as_object_mut() {
        obj.insert("changelog".into(), json!(changelog));
    }
    Ok(Json(json!({"success": true, "data": issue})))
}

pub async fn create_issue(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateIssueRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    if !(1..=53).contains(&body.epi_week) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "epi_week must be 1–53"})),
        ));
    }
    let actor = actor_username(&state, &headers).await;
    let client = state.db.get().await.map_err(internal_error)?;
    let (period_start, period_end) = resolve_dashboard_dates(
        body.epi_year,
        Some(body.epi_year),
        Some(body.epi_week as u32),
        Some(body.epi_year),
        Some(body.epi_week as u32),
    );
    let package = build_kpi_package(&client, body.epi_year, body.epi_week as u32).await?;
    let sections = merge_sections(&package, None);
    let sources = package.get("sources").cloned().unwrap_or(json!([]));
    let title = body.title.unwrap_or_else(|| {
        format!(
            "ASEAN Epidemiological Situation Report — Epi Week {:02}, {}",
            body.epi_week, body.epi_year
        )
    });
    let mut n = 1;
    let slug = loop {
        let candidate = slug_for(body.epi_year, body.epi_week, Some(n));
        let exists = client
            .query_opt("SELECT 1 FROM report_issues WHERE slug = $1", &[&candidate])
            .await
            .map_err(internal_error)?;
        if exists.is_none() {
            break candidate;
        }
        n += 1;
        if n > 20 {
            return Err((
                StatusCode::CONFLICT,
                Json(json!({"success": false, "error": "Could not allocate a unique slug"})),
            ));
        }
    };
    let template_id = body
        .template_id
        .unwrap_or_else(|| TEMPLATE_ID.to_string());
    if template_id != TEMPLATE_ID {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "Unknown template_id; only weekly_sitrep_v1 is enabled"})),
        ));
    }
    let map = map_meta();
    let highlights = json!([]);
    let limitations = DEFAULT_LIMITATIONS.to_string();
    let row = client
        .query_one(
            &format!(
                "INSERT INTO report_issues (
                    slug, title, epi_year, epi_week, period_start, period_end, status,
                    template_id, template_version, highlights, sections, kpi_snapshot,
                    map_meta, sources, limitations, created_by, updated_by
                 ) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
                 RETURNING id"
            ),
            &[
                &slug,
                &title,
                &body.epi_year,
                &body.epi_week,
                &period_start,
                &period_end,
                &template_id,
                &TEMPLATE_VERSION,
                &highlights,
                &sections,
                &package,
                &map,
                &sources,
                &limitations,
                &actor,
            ],
        )
        .await
        .map_err(internal_error)?;
    let id: i32 = row.get(0);
    record_event(&client, id, None, "draft", &actor, Some("Created from weekly_sitrep_v1 + KPI pull")).await?;
    let created = fetch_issue(&client, id).await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"success": true, "data": issue_from_row(&created)})),
    ))
}

pub async fn patch_issue(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<PatchIssueRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let actor = actor_username(&state, &headers).await;
    let client = state.db.get().await.map_err(internal_error)?;
    let row = fetch_issue(&client, id).await?;
    let status: String = row.get("status");
    if matches!(status.as_str(), "published" | "superseded" | "archived") {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({"success": false, "error": "Published issues are frozen. Issue a correction as a new week or supersede."})),
        ));
    }
    let mut title: String = row.get("title");
    let mut slug: String = row.get("slug");
    let mut highlights: Value = row.get("highlights");
    let mut sections: Value = row.get("sections");
    let mut cover_url: Option<String> = row.get("cover_url");
    let mut limitations: Option<String> = row.get("limitations");
    let mut map_meta_val: Value = row.get("map_meta");
    let mut visibility: String = row.get("visibility");

    if let Some(v) = body.title {
        title = v;
    }
    if let Some(v) = body.slug {
        if v.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') && v.len() >= 4 {
            slug = v;
        } else {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"success": false, "error": "slug must be lowercase kebab-case"})),
            ));
        }
    }
    if let Some(v) = body.highlights {
        if let Some(arr) = v.as_array() {
            if arr.len() > 5 {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({"success": false, "error": "Highlights are capped at 5 bullets"})),
                ));
            }
        }
        highlights = v;
    }
    if let Some(v) = body.sections {
        if let Some(arr) = v.as_array() {
            for section in arr {
                if let Some(note) = section.get("analyst_note").and_then(Value::as_str) {
                    if note.chars().count() > 1200 {
                        return Err((
                            StatusCode::BAD_REQUEST,
                            Json(json!({"success": false, "error": "Analyst notes are capped at 1200 characters"})),
                        ));
                    }
                }
            }
        }
        sections = v;
    }
    if let Some(v) = body.cover_url {
        cover_url = if v.trim().is_empty() { None } else { Some(v) };
    }
    if let Some(v) = body.limitations {
        limitations = Some(v);
    }
    if let Some(indicator) = body.map_indicator {
        if !matches!(indicator.as_str(), "events" | "cases" | "deaths") {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"success": false, "error": "map indicator must be events, cases, or deaths"})),
            ));
        }
        if let Some(obj) = map_meta_val.as_object_mut() {
            obj.insert("indicator".into(), json!(indicator));
        }
    }
    if let Some(v) = body.visibility {
        if v != "public" && v != "internal" {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"success": false, "error": "visibility must be public or internal"})),
            ));
        }
        visibility = v;
    }

    client
        .execute(
            "UPDATE report_issues SET
                title = $2, slug = $3, highlights = $4, sections = $5, cover_url = $6,
                limitations = $7, map_meta = $8, visibility = $9, updated_by = $10, updated_at = NOW()
             WHERE id = $1",
            &[
                &id,
                &title,
                &slug,
                &highlights,
                &sections,
                &cover_url,
                &limitations,
                &map_meta_val,
                &visibility,
                &actor,
            ],
        )
        .await
        .map_err(internal_error)?;
    let updated = fetch_issue(&client, id).await?;
    Ok(Json(json!({"success": true, "data": issue_from_row(&updated)})))
}

pub async fn pull_kpi(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let actor = actor_username(&state, &headers).await;
    let client = state.db.get().await.map_err(internal_error)?;
    let row = fetch_issue(&client, id).await?;
    let status: String = row.get("status");
    if matches!(status.as_str(), "published" | "superseded" | "archived") {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({"success": false, "error": "Cannot refresh KPIs on a frozen published issue"})),
        ));
    }
    let epi_year: i32 = row.get("epi_year");
    let epi_week: i32 = row.get("epi_week");
    let previous_sections: Value = row.get("sections");
    let previous_package: Option<Value> = row.get("kpi_snapshot");
    let package = build_kpi_package(&client, epi_year, epi_week as u32).await?;
    let sections = merge_sections(&package, Some(&previous_sections));
    let sources = package.get("sources").cloned().unwrap_or(json!([]));
    client
        .execute(
            "UPDATE report_issues SET kpi_snapshot = $2, sections = $3, sources = $4,
                    updated_by = $5, updated_at = NOW()
             WHERE id = $1",
            &[&id, &package, &sections, &sources, &actor],
        )
        .await
        .map_err(internal_error)?;
    record_event(
        &client,
        id,
        Some(&status),
        &status,
        &actor,
        Some("Pulled KPI snapshot for epi week"),
    )
    .await?;
    let updated = fetch_issue(&client, id).await?;
    Ok(Json(json!({
        "success": true,
        "data": issue_from_row(&updated),
        "previous_pulled_at": previous_package.and_then(|p| p.get("pulled_at").cloned()),
    })))
}

pub async fn transition_issue(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<TransitionRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let to = body.to_status.trim().to_ascii_lowercase();
    if to == "published" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "Use POST /publish to freeze and publish"})),
        ));
    }
    let actor = actor_username(&state, &headers).await;
    let client = state.db.get().await.map_err(internal_error)?;
    let row = fetch_issue(&client, id).await?;
    let from: String = row.get("status");
    if !allowed_transition(&from, &to) {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({
                "success": false,
                "error": format!("Cannot move from {from} to {to}")
            })),
        ));
    }
    client
        .execute(
            "UPDATE report_issues SET status = $2, updated_by = $3, updated_at = NOW() WHERE id = $1",
            &[&id, &to, &actor],
        )
        .await
        .map_err(internal_error)?;
    record_event(&client, id, Some(&from), &to, &actor, body.comment.as_deref()).await?;
    let updated = fetch_issue(&client, id).await?;
    Ok(Json(json!({"success": true, "data": issue_from_row(&updated)})))
}

pub async fn publish_issue(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<PublishRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let actor = actor_username(&state, &headers).await;
    let client = state.db.get().await.map_err(internal_error)?;
    let row = fetch_issue(&client, id).await?;
    let from: String = row.get("status");
    if from != "approved" {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({"success": false, "error": "Only approved issues can be published"})),
        ));
    }
    let snapshot: Option<Value> = row.get("kpi_snapshot");
    let Some(snapshot) = snapshot else {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({"success": false, "error": "Pull KPIs before publishing"})),
        ));
    };
    let mut slug: String = row.get("slug");
    if let Some(custom) = body.slug {
        if custom.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
            slug = custom;
        }
    }
    let visibility = body.visibility.unwrap_or_else(|| "public".into());
    let epi_year: i32 = row.get("epi_year");
    let epi_week: i32 = row.get("epi_week");
    client
        .execute(
            "UPDATE report_issues SET status = 'superseded', updated_by = $3, updated_at = NOW()
             WHERE epi_year = $1 AND epi_week = $2 AND status = 'published' AND id <> $4",
            &[&epi_year, &epi_week, &actor, &id],
        )
        .await
        .map_err(internal_error)?;
    client
        .execute(
            "UPDATE report_issues SET
                status = 'published', slug = $2, visibility = $3,
                published_snapshot = $4, published_at = NOW(),
                updated_by = $5, updated_at = NOW()
             WHERE id = $1",
            &[&id, &slug, &visibility, &snapshot, &actor],
        )
        .await
        .map_err(internal_error)?;
    record_event(
        &client,
        id,
        Some("approved"),
        "published",
        &actor,
        body.comment.as_deref().or(Some("Published; KPI snapshot frozen")),
    )
    .await?;
    let updated = fetch_issue(&client, id).await?;
    Ok(Json(json!({"success": true, "data": issue_from_row(&updated)})))
}

pub async fn suggest_notes(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Json(_body): Json<SuggestNotesRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let client = state.db.get().await.map_err(internal_error)?;
    let row = fetch_issue(&client, id).await?;
    let package: Option<Value> = row.get("kpi_snapshot");
    let Some(package) = package else {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({"success": false, "error": "Pull KPIs before requesting draft notes"})),
        ));
    };
    let bullets = data_highlights(&package);
    Ok(Json(json!({
        "success": true,
        "data": {
            "kind": "template_from_kpis",
            "llm_used": false,
            "requires_human_review": true,
            "highlights": bullets,
            "disclaimer": "These bullets are filled from the KPI snapshot by a code template. They are not an AI essay and must be edited by an analyst before review.",
        }
    })))
}

pub async fn list_templates() -> Json<Value> {
    Json(json!({
        "success": true,
        "data": [{
            "id": TEMPLATE_ID,
            "version": TEMPLATE_VERSION,
            "title": "Weekly ASEAN epidemiological situation report",
            "outline": [
                "Title + issue meta (epi week, cutoff)",
                "Highlights (human, ≤5)",
                "Regional KPI strip + AMS table",
                "Choropleth (ISO3 Admin-0, No data ≠ zero)",
                "Epi curve(s)",
                "Disease blocks (templated KPIs + short analyst note)",
                "Other alerts / events",
                "Limitations & sources"
            ],
            "llm_role": "optional draft notes only; never the sitrep body"
        }]
    }))
}

pub async fn list_taxonomies() -> Json<Value> {
    let ams: Vec<Value> = ASEAN11_MEMBERS
        .iter()
        .map(|name| {
            json!({
                "country": name,
                "display_name": display_ams_name(name),
                "iso3": iso3_for_country(name),
                "iso2": iso_code_for_country(name),
            })
        })
        .collect();
    Json(json!({
        "success": true,
        "data": {
            "ams": ams,
            "map_indicators": ["events", "cases", "deaths"],
            "statuses": ["draft","in_review","changes_requested","approved","published","superseded","archived"],
            "missing_policy": "no_data_not_zero"
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workflow_happy_path() {
        assert!(allowed_transition("draft", "in_review"));
        assert!(allowed_transition("in_review", "approved"));
        assert!(allowed_transition("approved", "published"));
        assert!(!allowed_transition("draft", "published"));
        assert!(!allowed_transition("published", "draft"));
        assert!(allowed_transition("in_review", "changes_requested"));
        assert!(allowed_transition("changes_requested", "in_review"));
    }

    #[test]
    fn iso3_covers_asean11() {
        for name in ASEAN11_MEMBERS {
            assert!(iso3_for_country(name).is_some(), "{name}");
        }
        assert_eq!(iso3_for_country("Viet Nam"), Some("VNM"));
        assert_eq!(iso3_for_country("Lao PDR"), Some("LAO"));
        assert_eq!(iso3_for_country("Utah"), None);
    }

    #[test]
    fn cfr_null_when_no_denominator() {
        assert!(cfr_json(0, 3).is_null());
        assert_eq!(cfr_json(100, 5), json!(5.0));
    }

    #[test]
    fn disease_code_is_stable() {
        assert_eq!(disease_code("Dengue Fever"), "dengue-fever");
        assert_eq!(disease_code("COVID-19"), "covid-19");
    }

    #[test]
    fn pad_missing_ams_is_not_zero() {
        let padded = pad_ams_rows(vec![json!({"name":"Indonesia","cases":10,"deaths":1,"events":4})]);
        assert_eq!(padded.len(), 11);
        let idn = padded.iter().find(|r| r["country"] == "Indonesia").unwrap();
        assert_eq!(idn["has_data"], json!(true));
        assert_eq!(idn["cases"], json!(10));
        let sgp = padded.iter().find(|r| r["country"] == "Singapore").unwrap();
        assert_eq!(sgp["has_data"], json!(false));
        assert!(sgp["cases"].is_null());
        assert!(sgp["events"].is_null());
    }
}
