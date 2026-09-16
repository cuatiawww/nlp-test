//! Token-safe DeepSeek drafts for report narrative.
//! Charts/tables stay code-bound to the KPI pull. LLM output is draft-only.

use chrono::NaiveDate;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;

pub const MAX_PROMPT_CHARS: usize = 4500;
pub const MAX_OUTPUT_TOKENS: u32 = 700;
pub const HTTP_TIMEOUT_SECS: u64 = 20;

const FORBIDDEN_KEYS: &[&str] = &[
    "original_text",
    "content",
    "body",
    "html",
    "raw_text",
    "article",
    "full_text",
];

#[derive(Debug, Clone)]
pub struct NarrativeDraft {
    pub highlights: Vec<String>,
    pub narrative: Value,
    pub section_notes: Vec<Value>,
    pub llm_used: bool,
    pub cached: bool,
    pub model: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Option<Vec<ChatChoice>>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: Option<ChatMessage>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

pub fn strip_forbidden_fields(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, v) in map {
                if FORBIDDEN_KEYS.iter().any(|f| k.eq_ignore_ascii_case(f)) {
                    continue;
                }
                out.insert(k.clone(), strip_forbidden_fields(v));
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(strip_forbidden_fields).collect()),
        other => other.clone(),
    }
}

fn compact_ams(rows: Option<&Vec<Value>>) -> Vec<Value> {
    rows.cloned()
        .unwrap_or_default()
        .into_iter()
        .take(11)
        .map(|row| {
            json!({
                "iso3": row.get("iso3"),
                "display_name": row.get("display_name"),
                "events": row.get("events"),
                "cases": row.get("cases"),
                "deaths": row.get("deaths"),
                "has_data": row.get("has_data"),
            })
        })
        .collect()
}

fn compact_diseases(rows: Option<&Vec<Value>>) -> Vec<Value> {
    rows.cloned()
        .unwrap_or_default()
        .into_iter()
        .take(24)
        .map(|row| {
            json!({
                "disease_code": row.get("disease_code"),
                "name": row.get("name"),
                "events": row.get("events"),
                "cases": row.get("cases"),
                "deaths": row.get("deaths"),
                "cfr": row.get("cfr"),
            })
        })
        .collect()
}

/// Structured stats only — never crawl dumps — sized for a small chat prompt.
pub fn truncated_stats_payload(package: &Value) -> Value {
    let clean = strip_forbidden_fields(package);
    let by_ams = clean.get("by_ams").and_then(Value::as_array);
    let by_disease = clean.get("by_disease").and_then(Value::as_array);
    let sources = clean
        .get("sources")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(8)
        .map(|row| {
            json!({
                "name": row.get("name"),
                "source_type": row.get("source_type"),
                "events": row.get("events"),
            })
        })
        .collect::<Vec<_>>();
    let alerts = clean
        .get("alerts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(8)
        .map(|row| {
            json!({
                "disease": row.get("disease"),
                "country": row.get("display_name").cloned().or_else(|| row.get("country").cloned()),
                "events": row.get("events"),
                "cases": row.get("cases"),
            })
        })
        .collect::<Vec<_>>();
    let matrix = clean
        .get("matrix")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .take(88)
        .map(|row| {
            json!({
                "disease": row.get("disease"),
                "iso3": row.get("iso3"),
                "events": row.get("events"),
                "has_data": row.get("has_data"),
            })
        })
        .collect::<Vec<_>>();
    let mut payload = json!({
        "scope": clean.get("scope"),
        "scope_label": clean.get("scope_label"),
        "epi_year": clean.get("epi_year"),
        "epi_week": clean.get("epi_week"),
        "epi_week_end": clean.get("epi_week_end"),
        "week_start": clean.get("week_start"),
        "week_end": clean.get("week_end"),
        "kpis": {
            "week": clean.pointer("/kpis/week"),
            "ytd": clean.pointer("/kpis/ytd"),
            "cfr_week": clean.pointer("/kpis/cfr_week"),
            "cfr_ytd": clean.pointer("/kpis/cfr_ytd"),
        },
        "by_ams": compact_ams(by_ams),
        "by_disease": compact_diseases(by_disease),
        "selected_diseases": clean.get("selected_diseases"),
        "matrix": matrix,
        "sources": sources,
        "alerts": alerts,
        "missing_policy": "No data / Not reported is not zero",
    });
    let mut encoded = serde_json::to_string(&payload).unwrap_or_default();
    if encoded.len() > MAX_PROMPT_CHARS {
        if let Some(obj) = payload.as_object_mut() {
            obj.remove("matrix");
            obj.remove("alerts");
            obj.remove("sources");
        }
        encoded = serde_json::to_string(&payload).unwrap_or_default();
        if encoded.len() > MAX_PROMPT_CHARS {
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("by_disease".into(), json!(obj.get("by_disease").and_then(Value::as_array).map(|a| a.iter().take(4).cloned().collect::<Vec<_>>()).unwrap_or_default()));
            }
        }
    }
    payload
}

pub fn payload_hash(payload: &Value) -> String {
    let encoded = serde_json::to_string(payload).unwrap_or_default();
    hex::encode(Sha256::digest(encoded.as_bytes()))
}

pub fn cache_key(template_id: &str, scope: &str, start: NaiveDate, end: NaiveDate, data_hash: &str) -> String {
    payload_hash(&json!({
        "template_id": template_id,
        "scope": scope,
        "start": start.to_string(),
        "end": end.to_string(),
        "data_hash": data_hash,
    }))
}

fn cap_highlights(raw: &[Value]) -> Vec<String> {
    raw.iter()
        .filter_map(Value::as_str)
        .map(|s| {
            let t = s.trim();
            if t.chars().count() > 400 {
                t.chars().take(400).collect()
            } else {
                t.to_string()
            }
        })
        .filter(|s| !s.is_empty())
        .take(crate::report_package::MAX_HIGHLIGHTS)
        .collect()
}

fn parse_model_json(text: &str) -> Option<Value> {
    let trimmed = text.trim();
    let slice = if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        &trimmed[start..=end]
    } else {
        trimmed
    };
    serde_json::from_str::<Value>(slice).ok()
}

pub fn draft_from_model_json(parsed: &Value, template_id: &str) -> NarrativeDraft {
    let highlights = parsed
        .get("highlights")
        .and_then(Value::as_array)
        .map(|a| cap_highlights(a))
        .unwrap_or_default();
    let exec = parsed
        .get("executive_summary")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .chars()
        .take(4000)
        .collect::<String>();
    let mut narrative = serde_json::Map::new();
    if !exec.is_empty() {
        if template_id.contains("situation") {
            narrative.insert("country_updates".into(), json!(exec));
        } else if template_id.contains("focus") {
            narrative.insert("abstract".into(), json!(exec));
        } else {
            narrative.insert("editorial".into(), json!(exec));
        }
    }
    if let Some(extra) = parsed.get("narrative").and_then(Value::as_object) {
        for (k, v) in extra {
            if k.starts_with('_') {
                continue;
            }
            if let Some(s) = v.as_str() {
                narrative.insert(k.clone(), json!(s.chars().take(4000).collect::<String>()));
            }
        }
    }
    let section_notes = parsed
        .get("section_notes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|row| {
            let code = row.get("disease_code").and_then(Value::as_str)?;
            let note = row.get("note").and_then(Value::as_str).unwrap_or("").trim();
            if note.is_empty() {
                return None;
            }
            Some(json!({
                "disease_code": code,
                "note": note.chars().take(8000).collect::<String>(),
            }))
        })
        .take(24)
        .collect();
    NarrativeDraft {
        highlights,
        narrative: Value::Object(narrative),
        section_notes,
        llm_used: true,
        cached: false,
        model: String::new(),
    }
}

pub async fn request_deepseek_draft(
    http: &Client,
    template_id: &str,
    payload: &Value,
) -> Result<NarrativeDraft, String> {
    let api_key = std::env::var("DEEPSEEK_API_KEY").unwrap_or_default();
    if api_key.trim().is_empty() {
        return Err("DEEPSEEK_API_KEY is not set".into());
    }
    let base = std::env::var("DEEPSEEK_BASE_URL").unwrap_or_else(|_| "https://api.deepseek.com/v1".into());
    let model = std::env::var("DEEPSEEK_MODEL").unwrap_or_else(|_| "deepseek-chat".into());
    let url = format!("{}/chat/completions", base.trim_end_matches('/'));
    let stats = serde_json::to_string(payload).unwrap_or_else(|_| "{}".into());
    let body = json!({
        "model": model,
        "temperature": 0.2,
        "max_tokens": MAX_OUTPUT_TOKENS,
        "messages": [
            {
                "role": "system",
                "content": "You draft short epidemiological bulletin notes for human review. Use ONLY the provided JSON stats. Do not invent case/death/event counts. Do not write the full bulletin body. Missing AMS are No data / Not reported, never zero. Reply with JSON only: {\"highlights\":[\"...\"],\"executive_summary\":\"...\",\"section_notes\":[{\"disease_code\":\"...\",\"note\":\"...\"}],\"narrative\":{}}"
            },
            {
                "role": "user",
                "content": format!("Template {template_id}. Draft ≤5 highlight bullets, a short executive summary, and optional 1-sentence notes for listed diseases.\nSTATS:\n{stats}")
            }
        ]
    });
    let resp = http
        .post(url)
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .header("Content-Type", "application/json")
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("DeepSeek HTTP {}", resp.status()));
    }
    let parsed: ChatResponse = resp.json().await.map_err(|e| e.to_string())?;
    let text = parsed
        .choices
        .unwrap_or_default()
        .into_iter()
        .find_map(|c| c.message.and_then(|m| m.content))
        .ok_or_else(|| "empty DeepSeek response".to_string())?;
    let value = parse_model_json(&text).ok_or_else(|| "DeepSeek did not return JSON".to_string())?;
    let mut draft = draft_from_model_json(&value, template_id);
    draft.model = model;
    Ok(draft)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncated_payload_drops_original_text() {
        let package = json!({
            "scope": "asean11",
            "kpis": { "week": { "events": 3, "cases": 10, "deaths": 1 } },
            "by_ams": [{ "iso3": "IDN", "display_name": "Indonesia", "events": 3, "has_data": true, "original_text": "secret crawl" }],
            "alerts": [{ "disease": "Dengue", "country": "Indonesia", "content": "full article", "events": 2 }],
            "original_text": "should never ship",
        });
        let truncated = truncated_stats_payload(&package);
        let encoded = serde_json::to_string(&truncated).unwrap();
        assert!(!encoded.contains("secret crawl"));
        assert!(!encoded.contains("full article"));
        assert!(!encoded.contains("should never ship"));
        assert!(!encoded.contains("original_text"));
        assert!(encoded.len() <= MAX_PROMPT_CHARS);
    }

    #[test]
    fn model_json_is_capped_and_mapped() {
        let parsed = json!({
            "highlights": ["a", "b", "c", "d", "e", "f"],
            "executive_summary": "Week summary.",
            "section_notes": [{ "disease_code": "dengue", "note": "Rising events." }]
        });
        let draft = draft_from_model_json(&parsed, "mmwr_bulletin_v1");
        assert_eq!(draft.highlights.len(), 6);
        assert_eq!(draft.narrative["editorial"], json!("Week summary."));
        assert_eq!(draft.section_notes.len(), 1);
    }

    #[test]
    fn cache_key_is_stable() {
        let start = NaiveDate::from_ymd_opt(2026, 2, 9).unwrap();
        let end = NaiveDate::from_ymd_opt(2026, 2, 15).unwrap();
        let a = cache_key("mmwr_bulletin_v1", "asean11", start, end, "abc");
        let b = cache_key("mmwr_bulletin_v1", "asean11", start, end, "abc");
        let c = cache_key("mmwr_bulletin_v1", "asean11", start, end, "abd");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 64);
    }
}
