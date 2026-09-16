//! Pure helpers for multi-disease report packages (no DB).
//! Charts/tables bind to KPI/event aggregates — never crawler volume.

use serde_json::{json, Value};

use crate::reports_cms::{disease_code, display_ams_name, iso3_for_country};

pub const MAX_SELECTED_DISEASES: usize = 24;
pub const MAX_FALLBACK_DISEASES: usize = 8;
pub const MAX_HIGHLIGHTS: usize = 12;
pub const BURDEN_INDICATORS: &[&str] = &["cases", "deaths"];

pub fn is_burden_indicator(indicator: &str) -> bool {
    matches!(indicator, "cases" | "deaths" | "cfr")
}

pub fn default_map_indicator() -> &'static str {
    "cases"
}

pub fn normalize_selected_diseases(raw: Option<&Value>, ids: &[String]) -> Vec<Value> {
    let mut out = Vec::new();
    let mut push = |name: &str, code: &str| {
        let name = name.trim();
        if name.is_empty() && code.trim().is_empty() {
            return;
        }
        let label = if name.is_empty() { code.trim() } else { name };
        let disease_code = if code.trim().is_empty() {
            disease_code(label)
        } else {
            disease_code(code)
        };
        if out.iter().any(|row: &Value| {
            row.get("disease_code").and_then(Value::as_str) == Some(disease_code.as_str())
        }) {
            return;
        }
        out.push(json!({
            "disease_code": disease_code,
            "name": label,
        }));
    };

    if let Some(value) = raw {
        match value {
            Value::Array(items) => {
                for item in items {
                    match item {
                        Value::String(s) => push(s, ""),
                        Value::Object(map) => {
                            let name = map
                                .get("name")
                                .and_then(Value::as_str)
                                .or_else(|| map.get("label").and_then(Value::as_str))
                                .unwrap_or("");
                            let code = map
                                .get("disease_code")
                                .and_then(Value::as_str)
                                .or_else(|| map.get("id").and_then(Value::as_str))
                                .unwrap_or("");
                            push(name, code);
                        }
                        _ => {}
                    }
                }
            }
            Value::String(s) => {
                for part in s.split(',') {
                    push(part, "");
                }
            }
            _ => {}
        }
    }
    for id in ids {
        push(id, id);
    }
    out.truncate(MAX_SELECTED_DISEASES);
    out
}

pub fn disease_matches(selected: &[Value], name: &str, code: &str) -> bool {
    if selected.is_empty() {
        return true;
    }
    let name_code = disease_code(name);
    let row_code = if code.is_empty() {
        name_code.clone()
    } else {
        disease_code(code)
    };
    selected.iter().any(|sel| {
        let sel_name = sel.get("name").and_then(Value::as_str).unwrap_or("");
        let sel_code_raw = sel.get("disease_code").and_then(Value::as_str).unwrap_or("");
        let sel_code = if sel_code_raw.is_empty() {
            disease_code(sel_name)
        } else {
            disease_code(sel_code_raw)
        };
        if sel_code.is_empty() && sel_name.is_empty() {
            return false;
        }
        row_code == sel_code
            || name_code == sel_code
            || (!sel_name.is_empty() && name.eq_ignore_ascii_case(sel_name))
            || fuzzy_disease(name, sel_name, &sel_code, &name_code)
    })
}

fn fuzzy_disease(name: &str, sel_name: &str, sel_code: &str, name_code: &str) -> bool {
    let n = name.to_ascii_lowercase();
    let s = sel_name.to_ascii_lowercase();
    if s.len() >= 4 && (n.contains(&s) || s.contains(&n)) {
        return true;
    }
    if sel_code.len() >= 4
        && (name_code.starts_with(sel_code) || sel_code.starts_with(name_code))
    {
        return true;
    }
    // COVID-19 vs covid, mpox vs monkeypox
    if (sel_code.contains("covid") && name_code.contains("covid"))
        || (sel_code.contains("mpox") && (name_code.contains("mpox") || name_code.contains("monkeypox")))
        || (sel_code.contains("monkeypox") && name_code.contains("mpox"))
    {
        return true;
    }
    false
}

/// Keep user-selected chapter order. Diseases with no matching events stay as
/// empty chapters (`has_data: false`) — never dummy counts.
pub fn resolve_selected_against_rows(selected: &[Value], by_disease: &[Value]) -> Vec<Value> {
    if selected.is_empty() {
        let mut ranked = by_disease.to_vec();
        ranked.sort_by(|a, b| {
            b.get("cases")
                .and_then(Value::as_i64)
                .cmp(&a.get("cases").and_then(Value::as_i64))
        });
        ranked.truncate(MAX_FALLBACK_DISEASES);
        return ranked;
    }
    selected
        .iter()
        .map(|sel| {
            let sel_name = sel.get("name").and_then(Value::as_str).unwrap_or("Disease");
            let sel_code = sel
                .get("disease_code")
                .and_then(Value::as_str)
                .map(disease_code)
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| disease_code(sel_name));
            if let Some(hit) = by_disease.iter().find(|row| {
                let name = row.get("name").and_then(Value::as_str).unwrap_or("");
                let code = row.get("disease_code").and_then(Value::as_str).unwrap_or("");
                disease_matches(std::slice::from_ref(sel), name, code)
            }) {
                let mut obj = hit.clone();
                if let Some(map) = obj.as_object_mut() {
                    map.entry("has_data").or_insert(json!(true));
                }
                obj
            } else {
                json!({
                    "disease_code": sel_code,
                    "name": sel_name,
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

pub fn filter_rows_by_diseases(rows: &[Value], selected: &[Value], name_key: &str, code_key: &str) -> Vec<Value> {
    if selected.is_empty() {
        return rows.to_vec();
    }
    rows.iter()
        .filter(|row| {
            let name = row.get(name_key).and_then(Value::as_str).unwrap_or("");
            let code = row.get(code_key).and_then(Value::as_str).unwrap_or("");
            disease_matches(selected, name, code)
        })
        .cloned()
        .collect()
}

pub fn sum_i64(rows: &[Value], key: &str) -> Option<i64> {
    let mut any = false;
    let mut total = 0i64;
    for row in rows {
        if row.get("has_data").and_then(Value::as_bool) == Some(false) {
            continue;
        }
        if let Some(v) = row.get(key).and_then(Value::as_i64) {
            any = true;
            total += v;
        }
    }
    if any {
        Some(total)
    } else {
        None
    }
}

pub fn cfr_from_option(cases: Option<i64>, deaths: Option<i64>) -> Value {
    match (cases, deaths) {
        (Some(c), Some(d)) if c > 0 => json!(((d as f64) * 1000.0 / (c as f64)).round() / 10.0),
        _ => Value::Null,
    }
}

pub fn sum_weekly_series(series_by_disease: &[Value]) -> Vec<Value> {
    let mut by_week = std::collections::BTreeMap::<(i64, i64), (i64, i64, i64, String)>::new();
    for item in series_by_disease {
        let Some(points) = item.get("series").and_then(Value::as_array) else {
            continue;
        };
        for p in points {
            let year = p.get("year").and_then(Value::as_i64).unwrap_or(0);
            let week = p.get("week").and_then(Value::as_i64).unwrap_or(0);
            let entry = by_week.entry((year, week)).or_insert((0, 0, 0, format!("{year}-W{week:02}")));
            entry.0 += p.get("cases").and_then(Value::as_i64).unwrap_or(0);
            entry.1 += p.get("deaths").and_then(Value::as_i64).unwrap_or(0);
            entry.2 += p.get("events").and_then(Value::as_i64).unwrap_or(0);
            if let Some(period) = p.get("period").and_then(Value::as_str) {
                entry.3 = period.to_string();
            }
        }
    }
    by_week
        .into_iter()
        .map(|((year, week), (cases, deaths, events, period))| {
            json!({
                "period": period,
                "year": year,
                "week": week,
                "cases": cases,
                "deaths": deaths,
                "events": events,
            })
        })
        .collect()
}

/// Pad a Disease×Country matrix so every selected disease has 11 AMS rows.
/// Missing AMS are No data / Not reported (nulls), never zero-filled.
pub fn matrix_with_deaths(rows: Vec<Value>, diseases: &[Value]) -> Vec<Value> {
    let mut lookup = std::collections::HashMap::<String, Value>::new();
    for row in rows {
        let disease = row.get("disease").and_then(Value::as_str).unwrap_or("");
        let country = row.get("country").and_then(Value::as_str).unwrap_or("");
        lookup.insert(format!("{}|{}", disease_code(disease), country), row);
    }
    let mut out = Vec::new();
    for disease in diseases {
        let name = disease.get("name").and_then(Value::as_str).unwrap_or("Disease");
        let code = disease
            .get("disease_code")
            .and_then(Value::as_str)
            .unwrap_or("");
        for ams in crate::ASEAN11_MEMBERS {
            let key = format!("{code}|{ams}");
            if let Some(existing) = lookup.get(&key) {
                let cases = existing.get("cases").and_then(Value::as_i64).unwrap_or(0);
                let deaths = existing.get("deaths").and_then(Value::as_i64).unwrap_or(0);
                out.push(json!({
                    "disease": name,
                    "disease_code": code,
                    "country": ams,
                    "display_name": display_ams_name(ams),
                    "iso3": iso3_for_country(ams),
                    "cases": cases,
                    "deaths": deaths,
                    "events": existing.get("events").and_then(Value::as_i64).unwrap_or(0),
                    "cfr": cfr_from_option(Some(cases), Some(deaths)),
                    "has_data": true,
                }));
            } else {
                out.push(json!({
                    "disease": name,
                    "disease_code": code,
                    "country": ams,
                    "display_name": display_ams_name(ams),
                    "iso3": iso3_for_country(ams),
                    "cases": Value::Null,
                    "deaths": Value::Null,
                    "events": Value::Null,
                    "cfr": Value::Null,
                    "has_data": false,
                }));
            }
        }
    }
    out
}

pub fn ams_rows_for_disease(matrix: &[Value], disease_code_value: &str) -> Vec<Value> {
    matrix
        .iter()
        .filter(|row| {
            row.get("disease_code").and_then(Value::as_str) == Some(disease_code_value)
        })
        .map(|row| {
            json!({
                "iso3": row.get("iso3"),
                "country": row.get("country"),
                "display_name": row.get("display_name"),
                "cases": row.get("cases"),
                "deaths": row.get("deaths"),
                "events": row.get("events"),
                "cfr": row.get("cfr"),
                "has_data": row.get("has_data"),
            })
        })
        .collect()
}

pub fn aggregate_ams_from_matrix(matrix: &[Value]) -> Vec<Value> {
    let mut by_country = std::collections::BTreeMap::<String, (i64, i64, i64, bool)>::new();
    for name in crate::ASEAN11_MEMBERS {
        by_country.insert((*name).to_string(), (0, 0, 0, false));
    }
    for row in matrix {
        let country = row.get("country").and_then(Value::as_str).unwrap_or("");
        if row.get("has_data").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        if let Some(slot) = by_country.get_mut(country) {
            slot.0 += row.get("cases").and_then(Value::as_i64).unwrap_or(0);
            slot.1 += row.get("deaths").and_then(Value::as_i64).unwrap_or(0);
            slot.2 += row.get("events").and_then(Value::as_i64).unwrap_or(0);
            slot.3 = true;
        }
    }
    by_country
        .into_iter()
        .map(|(country, (cases, deaths, events, has_data))| {
            if has_data {
                json!({
                    "iso3": iso3_for_country(&country),
                    "country": country,
                    "display_name": display_ams_name(&country),
                    "cases": cases,
                    "deaths": deaths,
                    "events": events,
                    "cfr": cfr_from_option(Some(cases), Some(deaths)),
                    "has_data": true,
                })
            } else {
                json!({
                    "iso3": iso3_for_country(&country),
                    "country": country,
                    "display_name": display_ams_name(&country),
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

pub fn default_section_order(family: &str, diseases: &[Value]) -> Vec<Value> {
    let mut order = Vec::new();
    let mut push = |id: &str, label: &str| {
        order.push(json!({ "id": id, "label": label }));
    };
    push("cover", "Cover");
    if family == "mmwr" || family == "ei" {
        push("publisher", "Publisher / editorial board");
    }
    push("toc", "Table of contents");
    if family == "mmwr" || family == "ei" {
        push("exec_summary", "Executive summary");
    } else if family == "sitrep" {
        push("exec_summary", "Key highlights");
    }
    push("glance", "Situation at a Glance");
    push("matrix", "Disease × Country matrix");
    push("map", "ASEAN choropleth");
    if family == "sitrep" {
        push("ams_table", "AMS cases / deaths / CFR");
        push("weekly_chart", "Weekly cases and deaths");
    }
    for d in diseases {
        let code = d.get("disease_code").and_then(Value::as_str).unwrap_or("unspecified");
        let name = d.get("name").and_then(Value::as_str).unwrap_or("Disease");
        push(&format!("chapter:{code}"), name);
    }
    if family == "sitrep" {
        push("country_updates", "Country updates");
        push("response", "Response");
        push("recommendations", "Recommendations");
    }
    if family == "ei" {
        push("definitions", "Definitions");
        push("two_week", "Two-week summary");
    }
    if family == "focus" {
        push("abstract", "Abstract");
        push("methods", "Methods");
        push("results", "Results");
        push("discussion", "Discussion");
    }
    push("sources", "References / sources");
    order
}

pub fn chapter_toc_children(family: &str) -> Vec<&'static str> {
    if family == "mmwr" {
        vec![
            "Highlights and Situation Overview",
            "Cases and Deaths Table",
            "Epidemic Curve",
            "Weekly New Cases and Deaths",
            "ASEAN choropleth",
        ]
    } else {
        vec![
            "Highlights",
            "ASEAN cases / deaths / CFR",
            "Epidemic curve",
            "Weekly new cases and deaths",
            "Distribution map",
        ]
    }
}

pub fn apply_section_order(previous: Option<&Value>, family: &str, diseases: &[Value]) -> Vec<Value> {
    let fresh = default_section_order(family, diseases);
    let Some(Value::Array(prev)) = previous else {
        return fresh;
    };
    if prev.is_empty() {
        return fresh;
    }
    let mut seen = std::collections::HashSet::<String>::new();
    let mut out = Vec::new();
    for item in prev {
        let id = item.get("id").and_then(Value::as_str).unwrap_or("").to_string();
        if id.is_empty() || seen.contains(&id) {
            continue;
        }
        if id.starts_with("chapter:") {
            let code = id.trim_start_matches("chapter:");
            if !diseases.iter().any(|d| d.get("disease_code").and_then(Value::as_str) == Some(code)) {
                continue;
            }
        }
        if id.starts_with("extra:") || fresh.iter().any(|f| f.get("id").and_then(Value::as_str) == Some(id.as_str())) {
            seen.insert(id);
            out.push(item.clone());
        }
    }
    for item in fresh {
        let id = item.get("id").and_then(Value::as_str).unwrap_or("");
        if seen.contains(id) {
            continue;
        }
        seen.insert(id.to_string());
        out.push(item);
    }
    out
}

pub fn empty_assets() -> Value {
    json!({ "cover_url": Value::Null, "pages": [] })
}

pub fn merge_assets(existing: &Value, cover_url: Option<&str>, pages: Option<&Value>) -> Value {
    let mut cover = existing.get("cover_url").cloned().unwrap_or(Value::Null);
    if let Some(url) = cover_url {
        cover = if url.trim().is_empty() {
            Value::Null
        } else {
            json!(url)
        };
    }
    let mut page_list = existing
        .get("pages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if let Some(Value::Array(incoming)) = pages {
        page_list = incoming.clone();
    }
    json!({ "cover_url": cover, "pages": page_list })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selected_diseases_normalize_strings_and_objects() {
        let raw = json!(["COVID-19", { "name": "Mpox", "disease_code": "mpox" }]);
        let out = normalize_selected_diseases(Some(&raw), &["dengue".into()]);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0]["disease_code"], json!("covid-19"));
        assert_eq!(out[1]["disease_code"], json!("mpox"));
        assert_eq!(out[2]["disease_code"], json!("dengue"));
    }

    #[test]
    fn missing_selected_disease_is_empty_chapter_not_zero() {
        let selected = json!([{ "name": "Mpox", "disease_code": "mpox" }]);
        let rows = vec![json!({
            "disease_code": "covid-19",
            "name": "COVID-19",
            "cases": 10,
            "deaths": 1,
            "events": 4,
            "has_data": true
        })];
        let resolved = resolve_selected_against_rows(selected.as_array().unwrap(), &rows);
        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0]["has_data"], json!(false));
        assert!(resolved[0]["cases"].is_null());
        assert!(resolved[0]["deaths"].is_null());
    }

    #[test]
    fn package_filter_keeps_only_selected_diseases() {
        let selected = normalize_selected_diseases(Some(&json!(["COVID-19", "Mpox"])), &[]);
        let rows = vec![
            json!({"name":"COVID-19","disease_code":"covid-19","cases":5}),
            json!({"name":"Dengue","disease_code":"dengue","cases":9}),
            json!({"name":"Monkeypox","disease_code":"monkeypox","cases":2}),
        ];
        let filtered = filter_rows_by_diseases(&rows, &selected, "name", "disease_code");
        let names: Vec<&str> = filtered
            .iter()
            .filter_map(|r| r.get("name").and_then(Value::as_str))
            .collect();
        assert_eq!(names, vec!["COVID-19", "Monkeypox"]);
    }

    #[test]
    fn matrix_pads_asean11_and_includes_deaths_cfr() {
        let diseases = json!([{ "disease_code": "dengue", "name": "Dengue" }]);
        let rows = vec![json!({
            "disease": "Dengue",
            "country": "Indonesia",
            "cases": 100,
            "deaths": 5,
            "events": 3
        })];
        let matrix = matrix_with_deaths(rows, diseases.as_array().unwrap());
        assert_eq!(matrix.len(), 11);
        let idn = matrix.iter().find(|r| r["country"] == "Indonesia").unwrap();
        assert_eq!(idn["has_data"], json!(true));
        assert_eq!(idn["deaths"], json!(5));
        assert_eq!(idn["cfr"], json!(5.0));
        let tls = matrix.iter().find(|r| r["country"] == "Timor-Leste").unwrap();
        assert_eq!(tls["has_data"], json!(false));
        assert!(tls["cases"].is_null());
        let ams = aggregate_ams_from_matrix(&matrix);
        assert_eq!(ams.len(), 11);
        assert_eq!(ams.iter().find(|r| r["country"] == "Indonesia").unwrap()["cases"], json!(100));
        assert!(ams.iter().find(|r| r["country"] == "Singapore").unwrap()["cases"].is_null());
    }

    #[test]
    fn section_order_has_per_disease_chapters() {
        let diseases = json!([
            { "disease_code": "covid-19", "name": "COVID-19" },
            { "disease_code": "mpox", "name": "Mpox" }
        ]);
        let order = default_section_order("mmwr", diseases.as_array().unwrap());
        let ids: Vec<&str> = order
            .iter()
            .filter_map(|r| r.get("id").and_then(Value::as_str))
            .collect();
        assert!(ids.contains(&"toc"));
        assert!(ids.contains(&"glance"));
        assert!(ids.contains(&"matrix"));
        assert!(ids.contains(&"map"));
        assert!(ids.contains(&"chapter:covid-19"));
        assert!(ids.contains(&"chapter:mpox"));
        assert!(ids.contains(&"sources"));
        assert!(!ids.iter().any(|id| id.contains("crawler") || id.contains("scrape")));
        let children = chapter_toc_children("mmwr");
        assert!(children.iter().any(|c| c.contains("Epidemic Curve")));
        assert!(!children.iter().any(|c| c.to_ascii_lowercase().contains("scrape")));
    }

    #[test]
    fn weekly_series_sums_cases_and_deaths_not_invented() {
        let series = vec![json!({
            "disease_code": "covid-19",
            "series": [
                { "year": 2026, "week": 35, "cases": 10, "deaths": 1, "events": 4 },
                { "year": 2026, "week": 36, "cases": 3, "deaths": 0, "events": 1 }
            ]
        })];
        let weekly = sum_weekly_series(&series);
        assert_eq!(weekly.len(), 2);
        assert_eq!(weekly[0]["cases"], json!(10));
        assert_eq!(weekly[0]["deaths"], json!(1));
        assert_eq!(weekly[1]["cases"], json!(3));
    }

    #[test]
    fn burden_indicators_exclude_crawler_volume() {
        assert!(is_burden_indicator("cases"));
        assert!(is_burden_indicator("deaths"));
        assert!(is_burden_indicator("cfr"));
        assert!(!is_burden_indicator("events"));
        assert!(!is_burden_indicator("scrape_volume"));
        assert_eq!(default_map_indicator(), "cases");
        assert_eq!(MAX_HIGHLIGHTS, 12);
    }

    #[test]
    fn apply_section_order_keeps_human_reorder() {
        let diseases = json!([{ "disease_code": "mpox", "name": "Mpox" }]);
        let prev = json!([
            { "id": "toc", "label": "TOC" },
            { "id": "chapter:mpox", "label": "Mpox" },
            { "id": "cover", "label": "Cover" }
        ]);
        let next = apply_section_order(Some(&prev), "mmwr", diseases.as_array().unwrap());
        assert_eq!(next[0]["id"], json!("toc"));
        assert_eq!(next[1]["id"], json!("chapter:mpox"));
        assert!(next.iter().any(|r| r["id"] == json!("glance")));
        assert!(!next.iter().any(|r| r["id"] == json!("chapter:covid-19")));
    }
}
