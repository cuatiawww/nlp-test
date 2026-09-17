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
    report_narrative, require_user_token, resolve_dashboard_dates, security, sql_country_param,
    sql_disease_param, AppState, ASEAN11_MEMBERS,
};

pub const TEMPLATE_ID: &str = "situation_report_v1";
pub const TEMPLATE_VERSION: &str = "1.0.0";
const LEGACY_SITREP_ID: &str = "weekly_sitrep_v1";

struct TemplateSpec {
    id: &'static str,
    family: &'static str,
    primary: bool,
    label: &'static str,
    slug_prefix: &'static str,
    version: &'static str,
    narrative_keys: &'static [&'static str],
    outline: &'static [&'static str],
}

const TEMPLATES: &[TemplateSpec] = &[
    TemplateSpec {
        id: "mmwr_bulletin_v1",
        family: "mmwr",
        primary: true,
        label: "Media monitoring bulletin",
        slug_prefix: "mmwr",
        version: "1.0.0",
        narrative_keys: &["publisher", "editorial"],
        outline: &[
            "Cover (uploadable)",
            "Publisher / editorial board",
            "Table of contents (per selected disease)",
            "Executive summary",
            "Situation at a Glance (cases / deaths / CFR)",
            "Disease × Country matrix",
            "ASEAN polygon choropleth",
            "Per-disease chapters (highlights, tables, epi curves, maps)",
            "Source notes",
            "Page numbers (print)",
        ],
    },
    TemplateSpec {
        id: "situation_report_v1",
        family: "sitrep",
        primary: true,
        label: "Situation report",
        slug_prefix: "sitrep",
        version: "1.0.0",
        narrative_keys: &["response", "recommendations", "country_updates"],
        outline: &[
            "Cover (uploadable)",
            "Table of contents (per selected disease)",
            "Situation at a Glance (cases / deaths / CFR)",
            "ASEAN polygon choropleth",
            "Disease × Country matrix",
            "Weekly cases and deaths",
            "Per-disease chapters (highlights, tables, epi curves, maps)",
            "Country updates",
            "Epidemiology / response / recommendations",
            "References",
        ],
    },
    TemplateSpec {
        id: "epidemic_intelligence_v1",
        family: "ei",
        primary: false,
        label: "Epidemic intelligence",
        slug_prefix: "ei",
        version: "1.0.0",
        narrative_keys: &["editorial", "definitions"],
        outline: &[
            "Cover + regional map",
            "Editorial",
            "Definitions",
            "Two-week event summary",
            "Executive summary",
            "Disease-signal visual",
            "Summary table",
            "References",
        ],
    },
    TemplateSpec {
        id: "focus_report_v1",
        family: "focus",
        primary: false,
        label: "Focus report",
        slug_prefix: "focus",
        version: "1.0.0",
        narrative_keys: &["abstract", "methods", "discussion"],
        outline: &[
            "Abstract",
            "Methods",
            "Results (small multiples + heatmap)",
            "Discussion",
            "Limitations",
            "References",
        ],
    },
];

fn canonicalize_template_id(raw: &str) -> Option<&'static str> {
    let id = raw.trim();
    if id.is_empty() || id.eq_ignore_ascii_case(LEGACY_SITREP_ID) {
        return Some(TEMPLATE_ID);
    }
    if id.eq_ignore_ascii_case("media_monitoring_v1")
        || id.eq_ignore_ascii_case("asean_bulletin")
    {
        return Some("mmwr_bulletin_v1");
    }
    TEMPLATES
        .iter()
        .find(|t| t.id.eq_ignore_ascii_case(id))
        .map(|t| t.id)
}

fn template_spec(id: &str) -> Option<&'static TemplateSpec> {
    let canon = canonicalize_template_id(id)?;
    TEMPLATES.iter().find(|t| t.id == canon)
}
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

fn country_for_iso3(iso: &str) -> Option<&'static str> {
    match iso.trim().to_ascii_uppercase().as_str() {
        "BRN" => Some("Brunei"),
        "KHM" => Some("Cambodia"),
        "IDN" => Some("Indonesia"),
        "LAO" => Some("Laos"),
        "MYS" => Some("Malaysia"),
        "MMR" => Some("Myanmar"),
        "PHL" => Some("Philippines"),
        "SGP" => Some("Singapore"),
        "THA" => Some("Thailand"),
        "VNM" => Some("Vietnam"),
        "TLS" => Some("Timor-Leste"),
        _ => None,
    }
}

fn resolve_scope_key(raw: &str) -> String {
    let t = raw.trim();
    if t.is_empty()
        || t.eq_ignore_ascii_case("all")
        || t.eq_ignore_ascii_case("asean")
        || t.eq_ignore_ascii_case("asean11")
        || t.eq_ignore_ascii_case("all asean")
    {
        return "asean11".into();
    }
    if let Some(name) = country_for_iso3(t) {
        return name.to_string();
    }
    if iso3_for_country(t).is_some() {
        if t.eq_ignore_ascii_case("lao pdr") || t.eq_ignore_ascii_case("laos") {
            return "Laos".into();
        }
        if t.eq_ignore_ascii_case("viet nam") || t.eq_ignore_ascii_case("vietnam") {
            return "Vietnam".into();
        }
        for name in ASEAN11_MEMBERS {
            if name.eq_ignore_ascii_case(t) {
                return name.to_string();
            }
        }
    }
    "asean11".into()
}

fn scope_label(key: &str) -> String {
    if key == "asean11" {
        "ASEAN 11 jurisdictions".into()
    } else {
        display_ams_name(key).to_string()
    }
}

fn apply_section_notes(sections: &mut Value, notes: &[Value]) {
    let Some(arr) = sections.as_array_mut() else {
        return;
    };
    for section in arr {
        let code = section
            .get("disease_code")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if let Some(note) = notes.iter().find_map(|n| {
            if n.get("disease_code").and_then(Value::as_str) == Some(code.as_str()) {
                n.get("note").and_then(Value::as_str)
            } else {
                None
            }
        }) {
            if let Some(obj) = section.as_object_mut() {
                let existing = obj
                    .get("analyst_note")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                if existing.is_empty() {
                    obj.insert("analyst_note".into(), json!(note));
                    obj.insert("analyst_note_status".into(), json!("llm_draft"));
                }
            }
        }
    }
}

pub fn disease_code(name: &str) -> String {
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

fn slug_for(template_id: &str, year: i32, week: i32, extra: Option<i32>) -> String {
    let prefix = template_spec(template_id)
        .map(|t| t.slug_prefix)
        .unwrap_or("sitrep");
    match extra {
        Some(n) if n > 1 => format!("{prefix}-{year}-w{week:02}-{n}"),
        _ => format!("{prefix}-{year}-w{week:02}"),
    }
}

fn default_title(template_id: &str, year: i32, week: i32) -> String {
    match template_spec(template_id).map(|t| t.family) {
        Some("mmwr") => format!("ASEAN Media Monitoring Bulletin — EW {week:02}, {year}"),
        Some("ei") => format!("ASEAN Epidemic Intelligence — EW {week:02}, {year}"),
        Some("focus") => format!("Focus report — EW {week:02}, {year}"),
        _ => format!("ASEAN Situation Report — EW {week:02}, {year}"),
    }
}

fn map_meta() -> Value {
    json!({
        "indicator": crate::report_package::default_map_indicator(),
        "classification": "quantile",
        "geojson_ref": "asean11_admin0_iso3",
        "missing_policy": "no_data_not_zero",
        "classes": 6,
        "palette": "ColorBrewer Blues (color-blind safe sequential)",
        "chart_policy": "cases_deaths_cfr_burden_only",
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
    let assets = row
        .try_get::<_, Value>("assets")
        .unwrap_or_else(|_| crate::report_package::empty_assets());
    let cover_from_assets = assets
        .get("cover_url")
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let cover_url = row
        .get::<_, Option<String>>("cover_url")
        .or(cover_from_assets);
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
        "cover_url": cover_url,
        "highlights": row.get::<_, Value>("highlights"),
        "sections": row.get::<_, Value>("sections"),
        "selected_diseases": row.try_get::<_, Value>("selected_diseases").unwrap_or_else(|_| json!([])),
        "section_order": row.try_get::<_, Value>("section_order").unwrap_or_else(|_| json!([])),
        "assets": assets,
        "kpi_snapshot": row.get::<_, Option<Value>>("kpi_snapshot"),
        "published_snapshot": row.get::<_, Option<Value>>("published_snapshot"),
        "map": row.get::<_, Value>("map_meta"),
        "sources": row.get::<_, Value>("sources"),
        "limitations": row.get::<_, Option<String>>("limitations"),
        "narrative": row.try_get::<_, Value>("narrative").unwrap_or_else(|_| json!({})),
        "visibility": row.get::<_, String>("visibility"),
        "created_by": row.get::<_, Option<String>>("created_by"),
        "updated_by": row.get::<_, Option<String>>("updated_by"),
        "published_at": row.get::<_, Option<String>>("published_at"),
        "created_at": row.get::<_, Option<String>>("created_at"),
        "updated_at": row.get::<_, Option<String>>("updated_at"),
        "llm_policy": "optional_draft_notes_only_human_review_required",
        "chart_policy": "cases_deaths_cfr_burden_only",
    })
}

const ISSUE_SELECT: &str = r#"
    SELECT id, slug, title, epi_year, epi_week, period_start, period_end, status,
           template_id, template_version, cover_url, highlights, sections,
           kpi_snapshot, published_snapshot, map_meta, sources, limitations,
           COALESCE(narrative, '{}'::jsonb) AS narrative, visibility,
           COALESCE(selected_diseases, '[]'::jsonb) AS selected_diseases,
           COALESCE(section_order, '[]'::jsonb) AS section_order,
           COALESCE(assets, '{}'::jsonb) AS assets,
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

async fn query_weekly_by_disease(
    client: &deadpool_postgres::Object,
    start_date: NaiveDate,
    end_date: NaiveDate,
    selected_country: &Option<String>,
    selected_source: &Option<String>,
) -> Result<Vec<Value>, (StatusCode, Json<Value>)> {
    let selected_disease: Option<String> = None;
    let sql = format!(
        "{} SELECT COALESCE(NULLIF(TRIM(disease_classification), ''), 'UNKNOWN') AS name,
            TO_CHAR(published_at, 'IYYY-\"W\"IW') AS period,
            EXTRACT(ISOYEAR FROM published_at)::int AS year,
            EXTRACT(WEEK FROM published_at)::int AS week,
            COALESCE(SUM({cases}), 0)::bigint AS cases,
            COALESCE(SUM({deaths}), 0)::bigint AS deaths,
            COUNT(*)::bigint AS events
         FROM valid
         WHERE {}
         GROUP BY 1, 2, 3, 4
         ORDER BY name, year, week",
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
                &selected_disease,
                selected_source,
            ],
        )
        .await
        .map_err(internal_error)?;
    let mut by_name = std::collections::BTreeMap::<String, Vec<Value>>::new();
    for r in &rows {
        let name: String = r.get("name");
        if name.eq_ignore_ascii_case("UNKNOWN") {
            continue;
        }
        by_name.entry(name.clone()).or_default().push(json!({
            "period": r.get::<_, String>("period"),
            "year": r.get::<_, i32>("year"),
            "week": r.get::<_, i32>("week"),
            "cases": r.get::<_, i64>("cases"),
            "deaths": r.get::<_, i64>("deaths"),
            "events": r.get::<_, i64>("events"),
        }));
    }
    let mut ranked: Vec<(String, i64, Vec<Value>)> = by_name
        .into_iter()
        .map(|(name, series)| {
            let events: i64 = series.iter().map(|p| p["events"].as_i64().unwrap_or(0)).sum();
            (name, events, series)
        })
        .collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(ranked
        .into_iter()
        .take(40)
        .map(|(name, _events, series)| {
            json!({
                "disease_code": disease_code(&name),
                "name": name,
                "series": series,
            })
        })
        .collect())
}

async fn query_ams_weekly(
    client: &deadpool_postgres::Object,
    start_date: NaiveDate,
    end_date: NaiveDate,
    selected_country: &Option<String>,
    selected_source: &Option<String>,
) -> Result<Vec<Value>, (StatusCode, Json<Value>)> {
    let selected_disease: Option<String> = None;
    let sql = format!(
        "{} SELECT resolved_country AS name,
            EXTRACT(ISOYEAR FROM published_at)::int AS year,
            EXTRACT(WEEK FROM published_at)::int AS week,
            COALESCE(SUM({cases}), 0)::bigint AS cases,
            COUNT(*)::bigint AS events
         FROM valid
         WHERE {}
         GROUP BY 1, 2, 3
         ORDER BY name, year, week",
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
            let name: String = r.get("name");
            json!({
                "country": name,
                "display_name": display_ams_name(&name),
                "iso3": iso3_for_country(&name),
                "year": r.get::<_, i32>("year"),
                "week": r.get::<_, i32>("week"),
                "cases": r.get::<_, i64>("cases"),
                "events": r.get::<_, i64>("events"),
                "has_data": true,
            })
        })
        .collect())
}

async fn query_disease_ams_matrix(
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
            COALESCE(SUM({cases}), 0)::bigint AS cases,
            COALESCE(SUM({deaths}), 0)::bigint AS deaths,
            COUNT(*)::bigint AS events
         FROM valid
         WHERE {}
         GROUP BY 1, 2
         ORDER BY cases DESC
         LIMIT 400",
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
                &selected_disease,
                selected_source,
            ],
        )
        .await
        .map_err(internal_error)?;
    Ok(rows
        .iter()
        .filter_map(|r| {
            let disease: String = r.get("disease");
            if disease.eq_ignore_ascii_case("UNKNOWN") {
                return None;
            }
            let country: String = r.get("country");
            let cases = r.get::<_, i64>("cases");
            let deaths = r.get::<_, i64>("deaths");
            Some(json!({
                "disease": disease,
                "disease_code": disease_code(&disease),
                "country": country,
                "display_name": display_ams_name(&country),
                "iso3": iso3_for_country(&country),
                "cases": cases,
                "deaths": deaths,
                "events": r.get::<_, i64>("events"),
                "cfr": cfr_json(cases, deaths),
                "has_data": true,
            }))
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
    epi_week_end: u32,
    scope: &str,
    selected_diseases: &[Value],
) -> Result<Value, (StatusCode, Json<Value>)> {
    let week_end_n = epi_week_end.max(epi_week);
    let (range_start, _) = resolve_dashboard_dates(
        epi_year,
        Some(epi_year),
        Some(epi_week),
        Some(epi_year),
        Some(epi_week),
    );
    let (_, range_end) = resolve_dashboard_dates(
        epi_year,
        Some(epi_year),
        Some(week_end_n),
        Some(epi_year),
        Some(week_end_n),
    );
    let (week_start, week_end) = resolve_dashboard_dates(
        epi_year,
        Some(epi_year),
        Some(week_end_n),
        Some(epi_year),
        Some(week_end_n),
    );
    let (ytd_start, ytd_end) = resolve_dashboard_dates(
        epi_year,
        Some(epi_year),
        Some(1),
        Some(epi_year),
        Some(week_end_n),
    );
    let country_key = resolve_scope_key(scope);
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
        range_start,
        range_end,
        &sql_country,
        &sql_disease,
        &sql_source,
    )
    .await?;
    let mut by_ams = pad_ams_rows(ams_raw);

    let disease_raw = query_shared_by_disease(
        client,
        range_start,
        range_end,
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
                "has_data": true,
            })
        })
        .collect();
    by_disease.sort_by(|a, b| b["cases"].as_i64().cmp(&a["cases"].as_i64()));
    by_disease = crate::report_package::resolve_selected_against_rows(selected_diseases, &by_disease);

    let ytd_disease_raw = query_shared_by_disease(
        client,
        ytd_start,
        ytd_end,
        &sql_country,
        &sql_disease,
        &sql_source,
    )
    .await?;
    let ytd_by_disease: Vec<Value> = ytd_disease_raw
        .into_iter()
        .filter(|item| {
            let name = item.get("name").and_then(Value::as_str).unwrap_or("");
            !name.is_empty() && !name.eq_ignore_ascii_case("UNKNOWN")
        })
        .map(|item| {
            let name = item.get("name").and_then(Value::as_str).unwrap_or("UNKNOWN").to_string();
            json!({
                "disease_code": disease_code(&name),
                "name": name,
                "cases": item.get("cases").and_then(Value::as_i64).unwrap_or(0),
                "deaths": item.get("deaths").and_then(Value::as_i64).unwrap_or(0),
                "events": item.get("events").and_then(Value::as_i64).unwrap_or(0),
                "has_data": true,
            })
        })
        .collect();
    let ytd_filtered = crate::report_package::filter_rows_by_diseases(
        &ytd_by_disease,
        &by_disease,
        "name",
        "disease_code",
    );

    let mut series_weekly =
        query_weekly_series(client, range_start, range_end, &sql_country, &sql_disease, &sql_source)
            .await?;
    let mut series_by_disease =
        query_weekly_by_disease(client, range_start, range_end, &sql_country, &sql_source).await?;
    series_by_disease = crate::report_package::filter_rows_by_diseases(
        &series_by_disease,
        &by_disease,
        "name",
        "disease_code",
    );
    if !selected_diseases.is_empty() {
        series_weekly = crate::report_package::sum_weekly_series(&series_by_disease);
    }
    let ams_weekly = query_ams_weekly(client, range_start, range_end, &sql_country, &sql_source).await?;
    let matrix_raw =
        query_disease_ams_matrix(client, range_start, range_end, &sql_country, &sql_source).await?;
    let matrix_raw = crate::report_package::filter_rows_by_diseases(
        &matrix_raw,
        &by_disease,
        "disease",
        "disease_code",
    );
    let matrix = crate::report_package::matrix_with_deaths(matrix_raw, &by_disease);
    if !selected_diseases.is_empty() {
        by_ams = crate::report_package::aggregate_ams_from_matrix(&matrix);
    }
    let sources = query_sources(
        client,
        range_start,
        range_end,
        &sql_country,
        &sql_disease,
        &sql_source,
    )
    .await?;
    let mut alerts = query_alerts(client, range_start, range_end, &sql_country, &sql_source).await?;
    alerts = crate::report_package::filter_rows_by_diseases(&alerts, &by_disease, "disease", "disease");

    let mut ytd_kpis = kpis_json_with_snapshot(&ytd_snapshot);
    let mut week_kpis = kpis_json_with_snapshot(&week_snapshot);
    let mut cfr_ytd = cfr_json(ytd_snapshot.kpis.cases, ytd_snapshot.kpis.deaths);
    let mut cfr_week = cfr_json(week_snapshot.kpis.cases, week_snapshot.kpis.deaths);
    if !selected_diseases.is_empty() {
        let ytd_cases = crate::report_package::sum_i64(&ytd_filtered, "cases");
        let ytd_deaths = crate::report_package::sum_i64(&ytd_filtered, "deaths");
        if let Some(obj) = ytd_kpis.as_object_mut() {
            obj.insert("cases".into(), json!(ytd_cases));
            obj.insert("deaths".into(), json!(ytd_deaths));
            obj.insert("selection".into(), json!("selected_diseases"));
        }
        cfr_ytd = crate::report_package::cfr_from_option(ytd_cases, ytd_deaths);
        let last_week = series_weekly.last();
        let week_cases = last_week.and_then(|p| p.get("cases").and_then(Value::as_i64));
        let week_deaths = last_week.and_then(|p| p.get("deaths").and_then(Value::as_i64));
        if let Some(obj) = week_kpis.as_object_mut() {
            obj.insert("cases".into(), json!(week_cases));
            obj.insert("deaths".into(), json!(week_deaths));
            obj.insert("selection".into(), json!("selected_diseases"));
        }
        cfr_week = crate::report_package::cfr_from_option(week_cases, week_deaths);
    }

    Ok(json!({
        "kpi_source": "materialized_kpi_snapshot",
        "scope": country_key,
        "scope_label": scope_label(&country_key),
        "epi_year": epi_year,
        "epi_week": epi_week,
        "epi_week_end": week_end_n,
        "week_start": range_start.to_string(),
        "week_end": range_end.to_string(),
        "ytd_start": ytd_start.to_string(),
        "ytd_end": ytd_end.to_string(),
        "pulled_at": Utc::now().to_rfc3339(),
        "snapshot": kpi_snapshot_json(&ytd_snapshot),
        "week_snapshot": kpi_snapshot_json(&week_snapshot),
        "selected_diseases": by_disease.iter().map(|d| json!({
            "disease_code": d.get("disease_code"),
            "name": d.get("name"),
        })).collect::<Vec<_>>(),
        "chart_policy": "cases_deaths_cfr_burden_only",
        "kpis": {
            "ytd": ytd_kpis,
            "week": week_kpis,
            "cfr_ytd": cfr_ytd,
            "cfr_week": cfr_week,
        },
        "by_ams": by_ams,
        "by_disease": by_disease,
        "series_weekly": series_weekly,
        "series_by_disease": series_by_disease,
        "ams_weekly": ams_weekly,
        "matrix": matrix,
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
    let fallback_ams = package.get("by_ams").cloned().unwrap_or(json!([]));
    let matrix = package
        .get("matrix")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let series_by_disease = package
        .get("series_by_disease")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let sections: Vec<Value> = diseases
        .into_iter()
        .map(|d| {
            let code = d
                .get("disease_code")
                .and_then(Value::as_str)
                .unwrap_or("unspecified")
                .to_string();
            let note = notes.remove(&code).unwrap_or_default();
            let disease_series = series_by_disease
                .iter()
                .find(|item| {
                    item.get("disease_code").and_then(Value::as_str) == Some(code.as_str())
                })
                .and_then(|item| item.get("series").cloned())
                .unwrap_or_else(|| json!([]));
            let by_ams = crate::report_package::ams_rows_for_disease(&matrix, &code);
            json!({
                "disease_code": code,
                "name": d.get("name"),
                "has_data": d.get("has_data").cloned().unwrap_or(json!(true)),
                "kpis": {
                    "cases": d.get("cases"),
                    "deaths": d.get("deaths"),
                    "events": d.get("events"),
                    "cfr": d.get("cfr"),
                },
                "series_weekly": disease_series,
                "by_ams": if by_ams.is_empty() { fallback_ams.clone() } else { json!(by_ams) },
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
        let cases = week.get("cases").and_then(Value::as_i64).unwrap_or(0);
        let deaths = week.get("deaths").and_then(Value::as_i64).unwrap_or(0);
        let epi_week = package.get("epi_week").and_then(Value::as_i64).unwrap_or(0);
        let epi_year = package.get("epi_year").and_then(Value::as_i64).unwrap_or(0);
        out.push(format!(
            "Epi week {epi_week}/{epi_year}: {cases} extracted cases and {deaths} extracted deaths across the selected disease chapters (NLP snapshot, not an official national total)."
        ));
    }
    if let Some(diseases) = package.get("by_disease").and_then(Value::as_array) {
        if let Some(top) = diseases.iter().find(|d| d.get("has_data").and_then(Value::as_bool) != Some(false)) {
            out.push(format!(
                "Leading disease by extracted cases: {} ({} cases, {} deaths).",
                top.get("name").and_then(Value::as_str).unwrap_or("n/a"),
                top.get("cases").and_then(Value::as_i64).unwrap_or(0),
                top.get("deaths").and_then(Value::as_i64).unwrap_or(0)
            ));
        }
        let names: Vec<&str> = diseases
            .iter()
            .filter_map(|d| d.get("name").and_then(Value::as_str))
            .take(6)
            .collect();
        if !names.is_empty() {
            out.push(format!("Selected disease chapters: {}.", names.join(", ")));
        }
    }
    if let Some(ams) = package.get("by_ams").and_then(Value::as_array) {
        let reported = ams.iter().filter(|r| r.get("has_data").and_then(Value::as_bool).unwrap_or(false)).count();
        let missing = 11usize.saturating_sub(reported);
        out.push(format!(
            "{reported} of 11 AMS have matching case extracts in this window; {missing} render as No data / Not reported."
        ));
    }
    out.truncate(crate::report_package::MAX_HIGHLIGHTS);
    out
}

async fn compose_narrative_draft(
    state: &Arc<AppState>,
    client: &deadpool_postgres::Object,
    template_id: &str,
    package: &Value,
) -> report_narrative::NarrativeDraft {
    let payload = report_narrative::truncated_stats_payload(package);
    let data_hash = report_narrative::payload_hash(&payload);
    let scope = package
        .get("scope")
        .and_then(Value::as_str)
        .unwrap_or("asean11")
        .to_string();
    let start = package
        .get("week_start")
        .and_then(Value::as_str)
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or_else(|| Utc::now().date_naive());
    let end = package
        .get("week_end")
        .and_then(Value::as_str)
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .unwrap_or(start);
    let key = report_narrative::cache_key(template_id, &scope, start, end, &data_hash);
    if let Ok(row) = client
        .query_opt(
            "SELECT highlights, narrative, section_notes, llm_used, COALESCE(model, '')
             FROM report_narrative_cache WHERE cache_key = $1",
            &[&key],
        )
        .await
    {
        if let Some(row) = row {
            let highlights = row
                .get::<_, Value>(0)
                .as_array()
                .cloned()
                .unwrap_or_default()
                .iter()
                .filter_map(Value::as_str)
                .map(|s| s.to_string())
                .collect();
            return report_narrative::NarrativeDraft {
                highlights,
                narrative: row.get(1),
                section_notes: row
                    .get::<_, Value>(2)
                    .as_array()
                    .cloned()
                    .unwrap_or_default(),
                llm_used: row.get(3),
                cached: true,
                model: row.get(4),
            };
        }
    }

    match report_narrative::request_deepseek_draft(&state.http, template_id, &payload).await {
        Ok(draft) => {
            let highlights_json = json!(draft.highlights);
            let _ = client
                .execute(
                    "INSERT INTO report_narrative_cache
                        (cache_key, template_id, scope, period_start, period_end, data_hash,
                         highlights, narrative, section_notes, llm_used, model)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                     ON CONFLICT (cache_key) DO NOTHING",
                    &[
                        &key,
                        &template_id,
                        &scope,
                        &start,
                        &end,
                        &data_hash,
                        &highlights_json,
                        &draft.narrative,
                        &json!(draft.section_notes),
                        &draft.llm_used,
                        &draft.model,
                    ],
                )
                .await;
            draft
        }
        Err(_) => {
            let mut fallback = report_narrative::NarrativeDraft {
                highlights: data_highlights(package),
                narrative: json!({}),
                section_notes: vec![],
                llm_used: false,
                cached: false,
                model: "template_from_kpis".into(),
            };
            if let Some(first) = fallback.highlights.first().cloned() {
                fallback.narrative = json!({ "editorial": first });
            }
            fallback
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
    pub epi_year: Option<i32>,
    pub epi_week: Option<i32>,
    pub disease: Option<String>,
    pub country: Option<String>,
    pub q: Option<String>,
    pub template: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateIssueRequest {
    pub epi_year: i32,
    pub epi_week: i32,
    pub epi_week_end: Option<i32>,
    pub title: Option<String>,
    pub template_id: Option<String>,
    pub scope: Option<String>,
    pub assist_narrative: Option<bool>,
    pub selected_diseases: Option<Value>,
    pub disease_ids: Option<Vec<String>>,
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
    pub narrative: Option<Value>,
    pub section_order: Option<Value>,
    pub assets: Option<Value>,
    pub selected_diseases: Option<Value>,
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
    pub apply: Option<bool>,
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
        "template_id": row.get::<_, String>("template_id"),
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
        .filter(|row| {
            let wanted = query.template.as_deref().unwrap_or("").trim();
            if wanted.is_empty() || wanted.eq_ignore_ascii_case("all") {
                return true;
            }
            let canon = canonicalize_template_id(wanted).unwrap_or(wanted);
            canonicalize_template_id(&row.get::<_, String>("template_id")).unwrap_or("") == canon
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
    let week_end = body.epi_week_end.unwrap_or(body.epi_week);
    if !(1..=53).contains(&week_end) || week_end < body.epi_week {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "epi_week_end must be ≥ epi_week and 1–53"})),
        ));
    }
    let scope = resolve_scope_key(body.scope.as_deref().unwrap_or("asean11"));
    let actor = actor_username(&state, &headers).await;
    let client = state.db.get().await.map_err(internal_error)?;
    let (period_start, _) = resolve_dashboard_dates(
        body.epi_year,
        Some(body.epi_year),
        Some(body.epi_week as u32),
        Some(body.epi_year),
        Some(body.epi_week as u32),
    );
    let (_, period_end) = resolve_dashboard_dates(
        body.epi_year,
        Some(body.epi_year),
        Some(week_end as u32),
        Some(body.epi_year),
        Some(week_end as u32),
    );
    let selected = crate::report_package::normalize_selected_diseases(
        body.selected_diseases.as_ref(),
        body.disease_ids.as_deref().unwrap_or(&[]),
    );
    let package = build_kpi_package(
        &client,
        body.epi_year,
        body.epi_week as u32,
        week_end as u32,
        &scope,
        &selected,
    )
    .await?;
    let sections = merge_sections(&package, None);
    let sources = package.get("sources").cloned().unwrap_or(json!([]));
    let template_id = canonicalize_template_id(body.template_id.as_deref().unwrap_or(TEMPLATE_ID))
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"success": false, "error": "Unknown template_id. Use mmwr_bulletin_v1, situation_report_v1, epidemic_intelligence_v1, or focus_report_v1."})),
            )
        })?
        .to_string();
    let spec = template_spec(&template_id).unwrap();
    let title = body
        .title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| default_title(&template_id, body.epi_year, body.epi_week));
    let mut n = 1;
    let slug = loop {
        let candidate = slug_for(&template_id, body.epi_year, body.epi_week, Some(n));
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
    let map = map_meta();
    let mut highlights = json!([]);
    let limitations = DEFAULT_LIMITATIONS.to_string();
    let mut narrative = json!({});
    let mut sections = sections;
    let assist = body.assist_narrative.unwrap_or(true);
    if assist {
        let draft = compose_narrative_draft(&state, &client, &template_id, &package).await;
        highlights = json!(draft.highlights);
        let mut narr = draft.narrative;
        if let Some(obj) = narr.as_object_mut() {
            obj.insert(
                "_draft".into(),
                json!({
                    "llm_used": draft.llm_used,
                    "cached": draft.cached,
                    "model": draft.model,
                    "requires_human_review": true,
                }),
            );
        }
        narrative = narr;
        apply_section_notes(&mut sections, &draft.section_notes);
    }
    let version = spec.version.to_string();
    let stored_diseases = package
        .get("selected_diseases")
        .cloned()
        .unwrap_or_else(|| json!(selected));
    let family = spec.family;
    let section_order = json!(crate::report_package::default_section_order(
        family,
        stored_diseases.as_array().unwrap_or(&vec![]),
    ));
    let assets = crate::report_package::empty_assets();
    let row = client
        .query_one(
            "INSERT INTO report_issues (
                    slug, title, epi_year, epi_week, period_start, period_end, status,
                    template_id, template_version, highlights, sections, kpi_snapshot,
                    map_meta, sources, limitations, narrative, created_by, updated_by,
                    selected_diseases, section_order, assets
                 ) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,$17,$18,$19)
                 RETURNING id",
            &[
                &slug,
                &title,
                &body.epi_year,
                &body.epi_week,
                &period_start,
                &period_end,
                &template_id,
                &version,
                &highlights,
                &sections,
                &package,
                &map,
                &sources,
                &limitations,
                &narrative,
                &actor,
                &stored_diseases,
                &section_order,
                &assets,
            ],
        )
        .await
        .map_err(internal_error)?;
    let id: i32 = row.get(0);
    record_event(
        &client,
        id,
        None,
        "draft",
        &actor,
        Some("Created from template + automatic KPI/matrix pull"),
    )
    .await?;
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
    let mut narrative: Value = row.try_get("narrative").unwrap_or_else(|_| json!({}));
    let mut section_order: Value = row.try_get("section_order").unwrap_or_else(|_| json!([]));
    let mut assets: Value = row
        .try_get("assets")
        .unwrap_or_else(|_| crate::report_package::empty_assets());
    let mut selected_diseases: Value = row.try_get("selected_diseases").unwrap_or_else(|_| json!([]));

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
            if arr.len() > crate::report_package::MAX_HIGHLIGHTS {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({"success": false, "error": "Highlights are capped at 12 bullets"})),
                ));
            }
        }
        highlights = v;
    }
    if let Some(v) = body.sections {
        if let Some(arr) = v.as_array() {
            for section in arr {
                if let Some(note) = section.get("analyst_note").and_then(Value::as_str) {
                    if note.chars().count() > 8000 {
                        return Err((
                            StatusCode::BAD_REQUEST,
                            Json(json!({"success": false, "error": "Analyst notes are capped at 8000 characters"})),
                        ));
                    }
                }
            }
        }
        sections = v;
    }
    if let Some(v) = body.limitations {
        limitations = Some(v);
    }
    if let Some(indicator) = body.map_indicator {
        if !matches!(indicator.as_str(), "cases" | "deaths") {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"success": false, "error": "map indicator must be cases or deaths (bulletin charts are disease-burden only)"})),
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
    if let Some(v) = body.narrative {
        if let Some(obj) = v.as_object() {
            for val in obj.values() {
                if let Some(s) = val.as_str() {
                    if s.chars().count() > 20000 {
                        return Err((
                            StatusCode::BAD_REQUEST,
                            Json(json!({"success": false, "error": "Narrative fields are capped at 20000 characters"})),
                        ));
                    }
                }
            }
        }
        narrative = v;
    }
    if let Some(v) = body.section_order {
        if let Some(arr) = v.as_array() {
            if arr.len() > 80 {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({"success": false, "error": "section_order is too long"})),
                ));
            }
        }
        section_order = v;
    }
    if let Some(v) = body.assets {
        assets = crate::report_package::merge_assets(
            &assets,
            v.get("cover_url").and_then(Value::as_str),
            v.get("pages"),
        );
        if let Some(url) = assets.get("cover_url").and_then(Value::as_str) {
            cover_url = Some(url.to_string());
        }
    }
    if let Some(v) = body.cover_url {
        cover_url = if v.trim().is_empty() { None } else { Some(v.clone()) };
        assets = crate::report_package::merge_assets(&assets, cover_url.as_deref(), None);
    }
    if let Some(v) = body.selected_diseases {
        selected_diseases = json!(crate::report_package::normalize_selected_diseases(Some(&v), &[]));
    }

    client
        .execute(
            "UPDATE report_issues SET
                title = $2, slug = $3, highlights = $4, sections = $5, cover_url = $6,
                limitations = $7, map_meta = $8, visibility = $9, narrative = $10,
                section_order = $11, assets = $12, selected_diseases = $13,
                updated_by = $14, updated_at = NOW()
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
                &narrative,
                &section_order,
                &assets,
                &selected_diseases,
                &actor,
            ],
        )
        .await
        .map_err(internal_error)?;
    let updated = fetch_issue(&client, id).await?;
    Ok(Json(json!({"success": true, "data": issue_from_row(&updated)})))
}

pub async fn delete_issue(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let actor = actor_username(&state, &headers).await;
    let client = state.db.get().await.map_err(internal_error)?;
    let row = fetch_issue(&client, id).await?;
    let title: String = row.get("title");
    let slug: String = row.get("slug");
    let status: String = row.get("status");

    // Execute deletion. Foreign key report_issue_events cascades automatically on delete.
    client
        .execute("DELETE FROM report_issues WHERE id = $1", &[&id])
        .await
        .map_err(internal_error)?;

    tracing::info!(
        issue_id = id,
        slug = %slug,
        status = %status,
        actor = ?actor,
        "Report issue deleted from CMS"
    );

    Ok(Json(json!({
        "success": true,
        "message": format!("Report issue #{} ({}) has been deleted successfully", id, title),
        "deleted_id": id,
        "slug": slug,
        "status": status,
    })))
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
    let scope = previous_package
        .as_ref()
        .and_then(|p| p.get("scope").and_then(Value::as_str))
        .unwrap_or("asean11")
        .to_string();
    let week_end = previous_package
        .as_ref()
        .and_then(|p| p.get("epi_week_end").and_then(Value::as_u64))
        .unwrap_or(epi_week as u64) as u32;
    let selected = row
        .try_get::<_, Value>("selected_diseases")
        .ok()
        .and_then(|v| v.as_array().cloned())
        .or_else(|| {
            previous_package
                .as_ref()
                .and_then(|p| p.get("selected_diseases").and_then(Value::as_array).cloned())
        })
        .unwrap_or_default();
    let previous_order: Value = row.try_get("section_order").unwrap_or_else(|_| json!([]));
    let package = build_kpi_package(
        &client,
        epi_year,
        epi_week as u32,
        week_end.max(epi_week as u32),
        &scope,
        &selected,
    )
    .await?;
    let sections = merge_sections(&package, Some(&previous_sections));
    let sources = package.get("sources").cloned().unwrap_or(json!([]));
    let family = template_spec(&row.get::<_, String>("template_id"))
        .map(|t| t.family)
        .unwrap_or("sitrep");
    let diseases = package
        .get("by_disease")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let section_order = json!(crate::report_package::apply_section_order(
        Some(&previous_order),
        family,
        &diseases,
    ));
    let stored_diseases = package
        .get("selected_diseases")
        .cloned()
        .unwrap_or_else(|| json!(selected));
    client
        .execute(
            "UPDATE report_issues SET kpi_snapshot = $2, sections = $3, sources = $4,
                    selected_diseases = $6, section_order = $7,
                    updated_by = $5, updated_at = NOW()
             WHERE id = $1",
            &[
                &id,
                &package,
                &sections,
                &sources,
                &actor,
                &stored_diseases,
                &section_order,
            ],
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
    let template_id: String = row.get("template_id");
    client
        .execute(
            "UPDATE report_issues SET status = 'superseded', updated_by = $3, updated_at = NOW()
             WHERE epi_year = $1 AND epi_week = $2 AND template_id = $5 AND status = 'published' AND id <> $4",
            &[&epi_year, &epi_week, &actor, &id, &template_id],
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
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<SuggestNotesRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let actor = actor_username(&state, &headers).await;
    let client = state.db.get().await.map_err(internal_error)?;
    let row = fetch_issue(&client, id).await?;
    let package: Option<Value> = row.get("kpi_snapshot");
    let Some(package) = package else {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({"success": false, "error": "Pull KPIs before requesting draft notes"})),
        ));
    };
    let template_id: String = row.get("template_id");
    let draft = compose_narrative_draft(&state, &client, &template_id, &package).await;
    if body.apply.unwrap_or(false) {
        let status: String = row.get("status");
        if matches!(status.as_str(), "published" | "superseded" | "archived") {
            return Err((
                StatusCode::CONFLICT,
                Json(json!({"success": false, "error": "Cannot apply drafts to a frozen issue"})),
            ));
        }
        let mut sections: Value = row.get("sections");
        apply_section_notes(&mut sections, &draft.section_notes);
        let mut narrative: Value = row.try_get("narrative").unwrap_or_else(|_| json!({}));
        if let Some(obj) = draft.narrative.as_object() {
            if let Some(dest) = narrative.as_object_mut() {
                for (k, v) in obj {
                    if !k.starts_with('_') {
                        dest.entry(k.clone()).or_insert(v.clone());
                    }
                }
                dest.insert(
                    "_draft".into(),
                    json!({
                        "llm_used": draft.llm_used,
                        "cached": draft.cached,
                        "model": draft.model,
                        "requires_human_review": true,
                    }),
                );
            }
        }
        let highlights = json!(draft.highlights);
        client
            .execute(
                "UPDATE report_issues SET highlights = $2, sections = $3, narrative = $4,
                        updated_by = $5, updated_at = NOW()
                 WHERE id = $1",
                &[&id, &highlights, &sections, &narrative, &actor],
            )
            .await
            .map_err(internal_error)?;
    }
    Ok(Json(json!({
        "success": true,
        "data": {
            "kind": if draft.llm_used { "deepseek_draft" } else { "template_from_kpis" },
            "llm_used": draft.llm_used,
            "cached": draft.cached,
            "model": draft.model,
            "requires_human_review": true,
            "highlights": draft.highlights,
            "narrative": draft.narrative,
            "section_notes": draft.section_notes,
            "disclaimer": "Draft notes only. Charts and tables stay bound to the KPI/matrix pull. Review and edit before publish. Full article text is never sent to the model.",
        }
    })))
}

pub async fn list_templates() -> Json<Value> {
    let data: Vec<Value> = TEMPLATES
        .iter()
        .map(|t| {
            json!({
                "id": t.id,
                "family": t.family,
                "primary": t.primary,
                "title": t.label,
                "version": t.version,
                "slug_prefix": t.slug_prefix,
                "narrative_keys": t.narrative_keys,
                "outline": t.outline,
                "chart_policy": "cases_deaths_cfr_burden_only",
                "map_indicators": ["cases", "deaths"],
                "llm_role": "DeepSeek may draft highlights/notes from truncated KPI stats; never the bulletin body; human review required"
            })
        })
        .collect();
    Json(json!({"success": true, "data": data}))
}

#[derive(Debug, Deserialize)]
pub struct AssetRequest {
    pub kind: Option<String>,
    pub data_url: Option<String>,
    pub caption: Option<String>,
    pub page_id: Option<String>,
}

fn valid_image_data_url(raw: &str) -> bool {
    let t = raw.trim();
    t.starts_with("data:image/") && t.contains("base64,") && t.len() <= 2_500_000
}

pub async fn upsert_asset(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<i32>,
    Json(body): Json<AssetRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let actor = actor_username(&state, &headers).await;
    let client = state.db.get().await.map_err(internal_error)?;
    let row = fetch_issue(&client, id).await?;
    let status: String = row.get("status");
    if matches!(status.as_str(), "published" | "superseded" | "archived") {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({"success": false, "error": "Published issues are frozen"})),
        ));
    }
    let data_url = body.data_url.unwrap_or_default();
    if !valid_image_data_url(&data_url) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "Asset must be a data:image/*;base64 URL under 2 MB"})),
        ));
    }
    let kind = body.kind.unwrap_or_else(|| "cover".into()).to_ascii_lowercase();
    let mut assets: Value = row
        .try_get("assets")
        .unwrap_or_else(|_| crate::report_package::empty_assets());
    let mut cover_url: Option<String> = row.get("cover_url");
    if kind == "cover" {
        assets = crate::report_package::merge_assets(&assets, Some(&data_url), None);
        cover_url = Some(data_url);
    } else if kind == "page" {
        let mut pages = assets
            .get("pages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if pages.len() >= 12 {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"success": false, "error": "At most 12 extra pages"})),
            ));
        }
        let page_id = body
            .page_id
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| format!("page-{}", pages.len() + 1));
        let caption = body.caption.unwrap_or_default();
        pages.push(json!({
            "id": page_id,
            "url": data_url,
            "caption": caption,
        }));
        assets = crate::report_package::merge_assets(&assets, None, Some(&json!(pages)));
        let mut order: Value = row.try_get("section_order").unwrap_or_else(|_| json!([]));
        if let Some(arr) = order.as_array_mut() {
            let extra_id = format!("extra:{page_id}");
            if !arr.iter().any(|item| item.get("id").and_then(Value::as_str) == Some(extra_id.as_str())) {
                let label = if caption.trim().is_empty() {
                    "Inserted page".to_string()
                } else {
                    caption.clone()
                };
                arr.push(json!({ "id": extra_id, "label": label }));
            }
        }
        client
            .execute(
                "UPDATE report_issues SET assets = $2, cover_url = $3, section_order = $4,
                        updated_by = $5, updated_at = NOW() WHERE id = $1",
                &[&id, &assets, &cover_url, &order, &actor],
            )
            .await
            .map_err(internal_error)?;
        let updated = fetch_issue(&client, id).await?;
        return Ok(Json(json!({"success": true, "data": issue_from_row(&updated)})));
    } else {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"success": false, "error": "kind must be cover or page"})),
        ));
    }
    client
        .execute(
            "UPDATE report_issues SET assets = $2, cover_url = $3, updated_by = $4, updated_at = NOW()
             WHERE id = $1",
            &[&id, &assets, &cover_url, &actor],
        )
        .await
        .map_err(internal_error)?;
    let updated = fetch_issue(&client, id).await?;
    Ok(Json(json!({"success": true, "data": issue_from_row(&updated)})))
}

pub async fn list_taxonomies(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
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
    let client = state.db.get().await.map_err(internal_error)?;
    let mut diseases: Vec<Value> = Vec::new();
    if let Ok(rows) = client
        .query(
            "SELECT canonical_name,
                    COALESCE(NULLIF(BTRIM(english_name), ''), canonical_name) AS label
             FROM disease_concepts
             WHERE is_active = TRUE AND NULLIF(BTRIM(canonical_name), '') IS NOT NULL
             ORDER BY canonical_name
             LIMIT 250",
            &[],
        )
        .await
    {
        for r in rows {
            let name: String = r.get("label");
            diseases.push(json!({
                "name": name,
                "disease_code": disease_code(&r.get::<_, String>("canonical_name")),
            }));
        }
    }
    if diseases.is_empty() {
        if let Ok(rows) = client
            .query(
                "SELECT label FROM nlp_labels
                 WHERE category = 'disease' AND is_active = TRUE
                   AND label NOT ILIKE 'NEGATIVE%'
                 ORDER BY priority NULLS LAST, label
                 LIMIT 250",
                &[],
            )
            .await
        {
            for r in rows {
                let name: String = r.get("label");
                diseases.push(json!({
                    "name": name,
                    "disease_code": disease_code(&name),
                }));
            }
        }
    }
    Ok(Json(json!({
        "success": true,
        "data": {
            "ams": ams,
            "diseases": diseases,
            "map_indicators": ["cases", "deaths"],
            "chart_policy": "cases_deaths_cfr_burden_only",
            "statuses": ["draft","in_review","changes_requested","approved","published","superseded","archived"],
            "missing_policy": "no_data_not_zero"
        }
    })))
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

    #[test]
    fn templates_prefer_mmwr_and_sitrep() {
        assert_eq!(canonicalize_template_id("weekly_sitrep_v1"), Some("situation_report_v1"));
        assert_eq!(canonicalize_template_id("media_monitoring_v1"), Some("mmwr_bulletin_v1"));
        assert_eq!(resolve_scope_key("IDN"), "Indonesia");
        assert_eq!(resolve_scope_key("All ASEAN"), "asean11");
        assert!(template_spec("mmwr_bulletin_v1").unwrap().primary);
        assert!(template_spec("situation_report_v1").unwrap().primary);
        assert!(!template_spec("focus_report_v1").unwrap().primary);
        assert_eq!(slug_for("mmwr_bulletin_v1", 2026, 7, None), "mmwr-2026-w07");
        assert_eq!(slug_for("situation_report_v1", 2026, 7, Some(2)), "sitrep-2026-w07-2");
        assert!(canonicalize_template_id("not-a-template").is_none());
    }

    #[test]
    fn map_and_outlines_are_burden_not_crawler() {
        let map = map_meta();
        assert_eq!(map["indicator"], json!("cases"));
        assert_eq!(map["chart_policy"], json!("cases_deaths_cfr_burden_only"));
        let mmwr = template_spec("mmwr_bulletin_v1").unwrap();
        assert!(mmwr.outline.iter().any(|s| s.contains("Per-disease")));
        assert!(mmwr.outline.iter().any(|s| s.contains("matrix")));
        assert!(!mmwr.outline.iter().any(|s| s.to_ascii_lowercase().contains("scrape")));
        let sitrep = template_spec("situation_report_v1").unwrap();
        assert!(sitrep.outline.iter().any(|s| s.contains("Glance")));
    }
}
