//! Proxy fetchers for external map layer APIs.
//!
//! Cache TTLs (also documented in the PR):
//! - flights (OpenSky): 45s
//! - fires / news / vectors default: 3 min
//! - facilities / population: 5 min
//! Successful payloads are cached; errors are not. A last-good copy is kept
//! so a timeout can still return structured data instead of hanging until a
//! reverse-proxy 503.

use reqwest::Client;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    future::Future,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::Mutex as TokioMutex;

use crate::region_context::{self, CountryMeta};

const UA: &str = "ASEAN-PHE-Surveillance/1.0 (map-layers; non-commercial research)";
const FETCH_TIMEOUT: Duration = Duration::from_secs(8);
const LAYER_HANDLER_BUDGET: Duration = Duration::from_secs(12);
const DEFAULT_CACHE_TTL: Duration = Duration::from_secs(180);
const FLIGHTS_CACHE_TTL: Duration = Duration::from_secs(45);
const SLOW_LAYER_CACHE_TTL: Duration = Duration::from_secs(300);
const LAST_GOOD_TTL: Duration = Duration::from_secs(1_800);
const OVERPASS_HTTP_TIMEOUT: Duration = Duration::from_secs(10);
const OVERPASS_QUERY_TIMEOUT_SECS: u64 = 8;
const FACILITIES_LIMIT: usize = 120;
const FIRMS_PUBLIC_SEA_CSV: &str =
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_SouthEast_Asia_24h.csv";
const OVERPASS_ENDPOINTS: &[&str] = &[
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
];

struct CacheEntry {
    expires_at: Instant,
    payload: Value,
}

static LAYER_CACHE: Mutex<Option<HashMap<String, CacheEntry>>> = Mutex::new(None);
static LAST_GOOD: Mutex<Option<HashMap<String, CacheEntry>>> = Mutex::new(None);
static LAYER_LOCKS: Mutex<Option<HashMap<String, Arc<TokioMutex<()>>>>> = Mutex::new(None);

fn ttl_for(key: &str) -> Duration {
    if key.starts_with("opensky") {
        FLIGHTS_CACHE_TTL
    } else if key.starts_with("healthsites") || key.starts_with("worldpop") {
        SLOW_LAYER_CACHE_TTL
    } else {
        DEFAULT_CACHE_TTL
    }
}

fn cache_store(
    store: &Mutex<Option<HashMap<String, CacheEntry>>>,
    key: String,
    payload: Value,
    ttl: Duration,
) {
    if let Ok(mut guard) = store.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(
            key,
            CacheEntry {
                expires_at: Instant::now() + ttl,
                payload,
            },
        );
    }
}

fn cache_read(store: &Mutex<Option<HashMap<String, CacheEntry>>>, key: &str) -> Option<Value> {
    let guard = store.lock().ok()?;
    let map = guard.as_ref()?;
    let entry = map.get(key)?;
    if entry.expires_at > Instant::now() {
        Some(entry.payload.clone())
    } else {
        None
    }
}

fn get_cached(key: &str) -> Option<Value> {
    cache_read(&LAYER_CACHE, key)
}

fn get_last_good(key: &str) -> Option<Value> {
    cache_read(&LAST_GOOD, key)
}

fn set_cached(key: String, payload: Value) {
    let ttl = ttl_for(&key);
    cache_store(&LAYER_CACHE, key, payload, ttl);
}

fn set_last_good(key: String, payload: Value) {
    cache_store(&LAST_GOOD, key, payload, LAST_GOOD_TTL);
}

fn mark_cached(mut payload: Value, stale: bool) -> Value {
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("cached".to_string(), json!(true));
        obj.insert("stale".to_string(), json!(stale));
    }
    payload
}

fn is_ok_status(payload: &Value) -> bool {
    matches!(payload.get("status").and_then(|v| v.as_str()), Some("ok"))
}

fn finish_layer(key: String, result: Value) -> Value {
    if is_ok_status(&result) {
        set_cached(key.clone(), result.clone());
        set_last_good(key, result.clone());
        return result;
    }
    if let Some(stale) = get_last_good(&key) {
        let mut marked = mark_cached(stale, true);
        if let Some(obj) = marked.as_object_mut() {
            if let Some(err) = result.get("error").cloned() {
                obj.insert("refresh_error".to_string(), err);
            }
        }
        return marked;
    }
    result
}

fn layer_lock(key: &str) -> Arc<TokioMutex<()>> {
    let mut guard = LAYER_LOCKS.lock().unwrap_or_else(|e| e.into_inner());
    let map = guard.get_or_insert_with(HashMap::new);
    map.entry(key.to_string())
        .or_insert_with(|| Arc::new(TokioMutex::new(())))
        .clone()
}

fn classify_status(err: &str) -> &'static str {
    let lower = err.to_ascii_lowercase();
    if lower.contains("timed out") || lower.contains("timeout") {
        "timeout"
    } else if lower.contains("401") || lower.contains("403") || lower.contains("not configured") {
        "auth"
    } else if lower.contains("503") || lower.contains("unavailable") {
        "unavailable"
    } else {
        "error"
    }
}

async fn guarded_fetch<F, Fut>(key: &str, timeout_payload: Value, fut: F) -> Value
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = Value>,
{
    if let Some(cached) = get_cached(key) {
        return mark_cached(cached, false);
    }
    let lock = layer_lock(key);
    let _guard = lock.lock().await;
    if let Some(cached) = get_cached(key) {
        return mark_cached(cached, false);
    }
    let result = match tokio::time::timeout(LAYER_HANDLER_BUDGET, fut()).await {
        Ok(value) => value,
        Err(_) => timeout_payload,
    };
    finish_layer(key.to_string(), result)
}

fn pct_encode(input: &str) -> String {
    url::form_urlencoded::byte_serialize(input.as_bytes()).collect()
}

async fn fetch_response_text_timed(
    http: &Client,
    url: &str,
    timeout: Duration,
) -> Result<(u16, String), String> {
    let response = http
        .get(url)
        .header("User-Agent", UA)
        .header("Accept", "application/json, text/csv, text/plain, */*")
        .timeout(timeout)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|e| e.to_string())?;
    Ok((status, text))
}

async fn fetch_response_text(http: &Client, url: &str) -> Result<(u16, String), String> {
    fetch_response_text_timed(http, url, FETCH_TIMEOUT).await
}

async fn fetch_json(http: &Client, url: &str) -> Result<Value, String> {
    let (status, text) = fetch_response_text(http, url).await?;
    if !(200..300).contains(&status) {
        return Err(format!("HTTP {status}"));
    }
    parse_json_body(&text)
}

fn parse_json_body(text: &str) -> Result<Value, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("empty response".to_string());
    }
    if !trimmed.starts_with('{') && !trimmed.starts_with('[') {
        let snippet: String = trimmed.chars().take(120).collect();
        return Err(format!("non-JSON response: {snippet}"));
    }
    serde_json::from_str(trimmed).map_err(|e| e.to_string())
}

fn observation_coords(obs: &Value) -> Option<(f64, f64)> {
    let lon = obs.pointer("/geojson/coordinates/0").and_then(|v| v.as_f64());
    let lat = obs.pointer("/geojson/coordinates/1").and_then(|v| v.as_f64());
    if let (Some(lon), Some(lat)) = (lon, lat) {
        return Some((lon, lat));
    }
    let loc = obs.get("location").and_then(|v| v.as_str())?;
    let mut parts = loc.split(',');
    let lat: f64 = parts.next()?.trim().parse().ok()?;
    let lon: f64 = parts.next()?.trim().parse().ok()?;
    Some((lon, lat))
}

fn parse_opensky_state(state: &Value) -> Option<Value> {
    let arr = state.as_array()?;
    let icao24 = arr.get(0)?.as_str().unwrap_or("").trim().to_string();
    let callsign = arr.get(1)?.as_str().unwrap_or("").trim().to_string();
    if icao24.is_empty() && callsign.is_empty() {
        return None;
    }
    let lon = arr.get(5)?.as_f64()?;
    let lat = arr.get(6)?.as_f64()?;
    if !lon.is_finite() || !lat.is_finite() {
        return None;
    }
    let origin = arr.get(2).and_then(|v| v.as_str()).unwrap_or("").trim();
    let last_contact = arr.get(4).and_then(|v| v.as_f64()).or_else(|| arr.get(4).and_then(|v| v.as_i64().map(|n| n as f64)));
    let baro_alt = arr.get(7).and_then(|v| v.as_f64());
    let geo_alt = arr.get(13).and_then(|v| v.as_f64());
    let altitude = baro_alt.or(geo_alt);
    Some(json!({
        "icao24": if icao24.is_empty() { Value::Null } else { json!(icao24) },
        "callsign": if callsign.is_empty() { Value::Null } else { json!(callsign) },
        "origin_country": if origin.is_empty() { Value::Null } else { json!(origin) },
        "latitude": lat,
        "longitude": lon,
        "altitude_m": altitude,
        "on_ground": arr.get(8).and_then(|v| v.as_bool()),
        "velocity_ms": arr.get(9).and_then(|v| v.as_f64()),
        "heading": arr.get(10).and_then(|v| v.as_f64()),
        "vertical_rate_ms": arr.get(11).and_then(|v| v.as_f64()),
        "squawk": arr.get(14).and_then(|v| v.as_str()).map(|s| s.trim()).filter(|s| !s.is_empty()),
        "last_contact": last_contact.map(|ts| ts as i64)
    }))
}

fn csv_header_index(headers: &[&str], name: &str, fallback: usize) -> usize {
    headers
        .iter()
        .position(|h| h.trim().eq_ignore_ascii_case(name))
        .unwrap_or(fallback)
}

fn parse_firms_csv(csv_text: &str) -> Result<Vec<Value>, String> {
    let lines: Vec<&str> = csv_text.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.is_empty() {
        return Err("empty FIRMS CSV".to_string());
    }
    let first = lines[0].to_ascii_lowercase();
    if first.contains("invalid") || first.contains("<html") || first.contains("error") && !first.contains("latitude") {
        return Err(lines[0].chars().take(160).collect());
    }
    if lines.len() < 2 {
        return Ok(Vec::new());
    }
    let headers: Vec<&str> = lines[0].split(',').collect();
    if !headers.iter().any(|h| h.trim().eq_ignore_ascii_case("latitude")) {
        return Err(format!("unexpected FIRMS CSV header: {}", lines[0].chars().take(120).collect::<String>()));
    }
    let lat_i = csv_header_index(&headers, "latitude", 0);
    let lon_i = csv_header_index(&headers, "longitude", 1);
    let bright_i = headers
        .iter()
        .position(|h| {
            let name = h.trim().to_ascii_lowercase();
            name == "bright_ti4" || name == "brightness"
        })
        .unwrap_or(2);
    let conf_i = csv_header_index(&headers, "confidence", 8);
    let date_i = csv_header_index(&headers, "acq_date", 5);
    let time_i = headers.iter().position(|h| h.trim().eq_ignore_ascii_case("acq_time"));
    let satellite_i = headers.iter().position(|h| h.trim().eq_ignore_ascii_case("satellite"));
    let frp_i = headers.iter().position(|h| h.trim().eq_ignore_ascii_case("frp"));

    Ok(lines[1..]
        .iter()
        .filter_map(|line| {
            let cols: Vec<&str> = line.split(',').collect();
            let lat = cols.get(lat_i)?.parse::<f64>().ok()?;
            let lon = cols.get(lon_i)?.parse::<f64>().ok()?;
            if !region_context::in_bbox(lon, lat, region_context::ASEAN_MAP_BBOX) {
                return None;
            }
            Some(json!({
                "latitude": lat,
                "longitude": lon,
                "brightness": cols.get(bright_i).and_then(|v| v.parse::<f64>().ok()),
                "confidence": cols.get(conf_i).map(|v| v.trim().to_string()).filter(|s| !s.is_empty()),
                "acq_date": cols.get(date_i).map(|v| v.trim().to_string()).filter(|s| !s.is_empty()),
                "acq_time": time_i.and_then(|i| cols.get(i)).map(|v| v.trim().to_string()).filter(|s| !s.is_empty()),
                "satellite": satellite_i.and_then(|i| cols.get(i)).map(|v| v.trim().to_string()).filter(|s| !s.is_empty()),
                "frp": frp_i.and_then(|i| cols.get(i)).and_then(|v| v.parse::<f64>().ok())
            }))
        })
        .take(500)
        .collect())
}

fn parse_overpass_elements(payload: &Value) -> Vec<Value> {
    payload
        .get("elements")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|el| {
            let lat = el
                .get("lat")
                .and_then(|v| v.as_f64())
                .or_else(|| el.pointer("/center/lat").and_then(|v| v.as_f64()))?;
            let lon = el
                .get("lon")
                .and_then(|v| v.as_f64())
                .or_else(|| el.pointer("/center/lon").and_then(|v| v.as_f64()))?;
            let tags = el.get("tags").cloned().unwrap_or(json!({}));
            let name = tags
                .get("name")
                .or_else(|| tags.get("name:en"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unnamed facility");
            let amenity = tags
                .get("amenity")
                .or_else(|| tags.get("healthcare"))
                .and_then(|v| v.as_str())
                .unwrap_or("health");
            Some(json!({
                "name": name,
                "latitude": lat,
                "longitude": lon,
                "amenity_type": amenity,
                "osm_id": el.get("id")
            }))
        })
        .take(FACILITIES_LIMIT)
        .collect()
}

fn parse_rss_items(xml: &str, domain: &str) -> Vec<Value> {
    let mut articles = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<item>") {
        let after = &rest[start + 6..];
        let Some(end) = after.find("</item>") else { break };
        let item = &after[..end];
        let title = rss_tag(item, "title");
        let url = rss_tag(item, "link");
        let date = rss_tag(item, "pubDate");
        if !title.is_empty() {
            articles.push(json!({
                "title": html_unescape(&title),
                "url": url,
                "domain": domain,
                "source_country": "",
                "language": "English",
                "seen_date": date
            }));
        }
        rest = &after[end + 7..];
        if articles.len() >= 25 {
            break;
        }
    }
    articles
}

fn rss_tag(item: &str, tag: &str) -> String {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let Some(start) = item.find(&open) else { return String::new() };
    let after = &item[start + open.len()..];
    let Some(end) = after.find(&close) else { return String::new() };
    after[..end].trim().to_string()
}

fn html_unescape(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn parse_gdelt_articles(payload: &Value) -> Vec<Value> {
    payload
        .get("articles")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|a| {
            json!({
                "title": a.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                "url": a.get("url").and_then(|v| v.as_str()).unwrap_or(""),
                "domain": a.get("domain").and_then(|v| v.as_str()).unwrap_or(""),
                "source_country": a.get("sourcecountry").and_then(|v| v.as_str()).unwrap_or(""),
                "language": a.get("language").and_then(|v| v.as_str()).unwrap_or(""),
                "seen_date": a.get("seendate").and_then(|v| v.as_str()).unwrap_or("")
            })
        })
        .filter(|a| a.get("title").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false))
        .collect()
}

// ── iNaturalist: Aedes vector sightings ──────────────────────────────

pub async fn fetch_inaturalist_vectors(http: &Client) -> Value {
    let cache_key = "inaturalist_aedes_asean";
    guarded_fetch(
        cache_key,
        json!({
            "status": "timeout",
            "source": "iNaturalist",
            "error": "iNaturalist request exceeded 12s budget",
            "sightings": []
        }),
        || async move {
            let url = "https://api.inaturalist.org/v1/observations?taxon_name=Aedes&nelat=28&nelng=141&swlat=-11&swlng=95&per_page=200&order=desc&order_by=observed_on&quality_grade=research";
            match fetch_json(http, url).await {
                Ok(payload) => {
                    let observations = payload
                        .get("results")
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let markers: Vec<Value> = observations
                        .iter()
                        .filter_map(|obs| {
                            let (lon, lat) = observation_coords(obs)?;
                            let species = obs
                                .get("species_guess")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Aedes sp.");
                            let observed = obs.get("observed_on").and_then(|v| v.as_str()).unwrap_or("");
                            let photo = obs
                                .pointer("/photos/0/url")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let place = obs.get("place_guess").and_then(|v| v.as_str()).unwrap_or("");
                            Some(json!({
                                "latitude": lat,
                                "longitude": lon,
                                "species": species,
                                "observed_on": observed,
                                "photo_url": photo.replace("/square.", "/small."),
                                "place": place
                            }))
                        })
                        .collect();
                    json!({
                        "status": "ok",
                        "source": "iNaturalist",
                        "total": markers.len(),
                        "sightings": markers
                    })
                }
                Err(error) => json!({
                    "status": classify_status(&error),
                    "source": "iNaturalist",
                    "error": error,
                    "sightings": []
                }),
            }
        },
    )
    .await
}

// ── OpenSky Network: live flights ────────────────────────────────────

pub async fn fetch_opensky_flights(http: &Client) -> Value {
    let cache_key = "opensky_asean";
    guarded_fetch(
        cache_key,
        json!({
            "status": "timeout",
            "source": "OpenSky Network",
            "error": "OpenSky request exceeded 12s budget",
            "flights": []
        }),
        || async move {
            let url = "https://opensky-network.org/api/states/all?lamin=-11&lomin=95&lamax=28&lomax=141";
            match fetch_json(http, url).await {
                Ok(payload) => {
                    let states = payload
                        .get("states")
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let flights: Vec<Value> = states.iter().filter_map(parse_opensky_state).take(250).collect();
                    json!({
                        "status": "ok",
                        "source": "OpenSky Network",
                        "total": flights.len(),
                        "flights": flights
                    })
                }
                Err(error) => json!({
                    "status": classify_status(&error),
                    "source": "OpenSky Network",
                    "error": error,
                    "flights": []
                }),
            }
        },
    )
    .await
}

async fn fetch_firms_csv(http: &Client, url: &str) -> Result<Vec<Value>, String> {
    let (status, text) = fetch_response_text(http, url).await?;
    if !(200..300).contains(&status) {
        return Err(format!("HTTP {status}"));
    }
    parse_firms_csv(&text)
}

// ── NASA FIRMS: active fire hotspots ─────────────────────────────────

pub async fn fetch_firms_hotspots(http: &Client, map_key: Option<&str>) -> Value {
    let cache_key = "firms_asean";
    guarded_fetch(
        cache_key,
        json!({
            "status": "timeout",
            "source": "NASA FIRMS",
            "error": "FIRMS request exceeded 12s budget",
            "hotspots": []
        }),
        || async move {
            let mut source = "NASA FIRMS (VIIRS SNPP NRT)".to_string();
            let mut error: Option<String> = None;
            let mut hotspots = Vec::new();

            if let Some(key) = map_key.map(str::trim).filter(|k| !k.is_empty()) {
                let url = format!(
                    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{}/VIIRS_SNPP_NRT/95,-11,141,28/2",
                    key
                );
                match fetch_firms_csv(http, &url).await {
                    Ok(points) => hotspots = points,
                    Err(e) => error = Some(format!("MAP_KEY API: {e}")),
                }
            }

            if hotspots.is_empty() {
                source = "NASA FIRMS public SE Asia 24h CSV".to_string();
                match fetch_firms_csv(http, FIRMS_PUBLIC_SEA_CSV).await {
                    Ok(points) => {
                        hotspots = points;
                        if error.is_some() && !hotspots.is_empty() {
                            error = None;
                        }
                    }
                    Err(e) => {
                        let public_err = format!("public CSV: {e}");
                        error = Some(match error {
                            Some(prev) => format!("{prev}; {public_err}"),
                            None => public_err,
                        });
                    }
                }
            }

            if hotspots.is_empty() && error.is_some() {
                let err = error.unwrap_or_else(|| "FIRMS unavailable".to_string());
                json!({
                    "status": classify_status(&err),
                    "source": source,
                    "error": err,
                    "hotspots": []
                })
            } else {
                json!({
                    "status": "ok",
                    "source": source,
                    "total": hotspots.len(),
                    "hotspots": hotspots
                })
            }
        },
    )
    .await
}

fn remaining(deadline: Instant) -> Duration {
    deadline.saturating_duration_since(Instant::now())
}

fn overpass_query_around_capital(country: CountryMeta) -> String {
    format!(
        "[out:json][timeout:{OVERPASS_QUERY_TIMEOUT_SECS}];(\
         node[\"amenity\"=\"hospital\"](around:80000,{lat},{lon});\
         node[\"amenity\"=\"clinic\"](around:80000,{lat},{lon});\
         );out center {FACILITIES_LIMIT};",
        lat = country.lat,
        lon = country.lon
    )
}

fn overpass_query_asean_hospitals() -> String {
    let [min_lon, min_lat, max_lon, max_lat] = region_context::ASEAN_MAP_BBOX;
    format!(
        "[out:json][timeout:{OVERPASS_QUERY_TIMEOUT_SECS}];\
         node[\"amenity\"=\"hospital\"]({min_lat},{min_lon},{max_lat},{max_lon});\
         out center {FACILITIES_LIMIT};"
    )
}

async fn fetch_overpass(http: &Client, query: &str, deadline: Instant) -> Result<Value, String> {
    let mut last_error = "no Overpass endpoint tried".to_string();
    for endpoint in OVERPASS_ENDPOINTS {
        let budget = remaining(deadline);
        if budget < Duration::from_millis(250) {
            return Err("timeout".to_string());
        }
        let timeout = budget.min(OVERPASS_HTTP_TIMEOUT);
        let response = http
            .post(*endpoint)
            .header("User-Agent", UA)
            .header("Accept", "application/json")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .timeout(timeout)
            .body(format!("data={}", pct_encode(query)))
            .send()
            .await;
        match response {
            Ok(resp) if resp.status().is_success() => {
                let text = resp.text().await.map_err(|e| e.to_string())?;
                return parse_json_body(&text);
            }
            Ok(resp) => last_error = format!("{endpoint} HTTP {}", resp.status().as_u16()),
            Err(e) => last_error = format!("{endpoint}: {e}"),
        }
    }
    Err(last_error)
}

async fn fetch_overpass_facilities(http: &Client, country: CountryMeta) -> Result<Vec<Value>, String> {
    let deadline = Instant::now() + LAYER_HANDLER_BUDGET;
    match fetch_overpass(http, &overpass_query_around_capital(country), deadline).await {
        Ok(payload) => {
            let facilities = parse_overpass_elements(&payload);
            if !facilities.is_empty() {
                return Ok(facilities);
            }
            if remaining(deadline) < Duration::from_millis(400) {
                return Ok(facilities);
            }
            let fallback = fetch_overpass(http, &overpass_query_asean_hospitals(), deadline).await?;
            Ok(parse_overpass_elements(&fallback))
        }
        Err(err) => {
            if remaining(deadline) < Duration::from_millis(400) {
                return Err(err);
            }
            let fallback = fetch_overpass(http, &overpass_query_asean_hospitals(), deadline).await?;
            Ok(parse_overpass_elements(&fallback))
        }
    }
}

fn parse_healthsites_features(payload: &Value) -> Vec<Value> {
    payload
        .get("features")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|f| {
            let coords = f.pointer("/geometry/coordinates")?.as_array()?;
            let lon = coords.first()?.as_f64()?;
            let lat = coords.get(1)?.as_f64()?;
            let props = f.get("properties")?;
            let name = props
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown facility");
            let amenity = props
                .get("amenity")
                .and_then(|v| v.as_str())
                .unwrap_or("health");
            Some(json!({
                "name": name,
                "latitude": lat,
                "longitude": lon,
                "amenity_type": amenity,
                "osm_id": props.get("osm_id")
            }))
        })
        .collect()
}

// ── Healthsites.io / OSM Overpass health facilities ──────────────────

pub async fn fetch_healthsites(http: &Client, api_key: Option<&str>, country: &str) -> Value {
    let meta = region_context::resolve_country(country).unwrap_or_else(|| {
        region_context::resolve_country("Indonesia").expect("Indonesia is in the ASEAN set")
    });
    let cache_key = format!("healthsites_{}", meta.iso2.to_lowercase());
    guarded_fetch(
        &cache_key,
        json!({
            "status": "timeout",
            "source": "OpenStreetMap Overpass",
            "error": "Facilities request exceeded 12s budget",
            "facilities": []
        }),
        || async move {
            let mut source = "Healthsites.io".to_string();
            let mut error: Option<String> = None;
            let mut facilities = Vec::new();

            if let Some(key) = api_key.map(str::trim).filter(|k| !k.is_empty()) {
                let url = format!(
                    "https://healthsites.io/api/v3/facilities/?api-key={}&page=1&country={}&page_size=200",
                    key,
                    pct_encode(meta.display)
                );
                match fetch_json(http, &url).await {
                    Ok(payload) => facilities = parse_healthsites_features(&payload),
                    Err(e) => error = Some(format!("Healthsites.io: {e}")),
                }
            }

            if facilities.is_empty() {
                source = format!("OpenStreetMap Overpass ({})", meta.display);
                match fetch_overpass_facilities(http, meta).await {
                    Ok(points) => {
                        facilities = points;
                        if !facilities.is_empty() {
                            error = None;
                        }
                    }
                    Err(e) => {
                        let overpass_err = format!("Overpass: {e}");
                        error = Some(match error {
                            Some(prev) => format!("{prev}; {overpass_err}"),
                            None => overpass_err,
                        });
                    }
                }
            }

            if facilities.is_empty() && error.is_some() {
                let err = error.unwrap_or_else(|| "Facilities unavailable".to_string());
                json!({
                    "status": classify_status(&err),
                    "source": source,
                    "error": err,
                    "facilities": []
                })
            } else {
                json!({
                    "status": "ok",
                    "source": source,
                    "total": facilities.len(),
                    "facilities": facilities
                })
            }
        },
    )
    .await
}

async fn fetch_who_news(http: &Client) -> Result<Vec<Value>, String> {
    let url = "https://www.who.int/rss-feeds/news-english.xml";
    let (status, text) = fetch_response_text_timed(http, url, Duration::from_secs(6)).await?;
    if !(200..300).contains(&status) {
        return Err(format!("HTTP {status}"));
    }
    let articles = parse_rss_items(&text, "who.int");
    if articles.is_empty() {
        return Err("WHO RSS contained no items".to_string());
    }
    Ok(articles)
}

// ── GDELT Doc 2.0 / WHO News RSS ─────────────────────────────────────

pub async fn fetch_gdelt_news(http: &Client, disease: Option<&str>) -> Value {
    let query = disease.unwrap_or("dengue OR cholera OR influenza");
    let cache_key = format!("gdelt_{}", query.replace(' ', "_").to_lowercase());
    guarded_fetch(
        &cache_key,
        json!({
            "status": "timeout",
            "source": "GDELT Doc 2.0",
            "error": "Disease media request exceeded 12s budget",
            "articles": []
        }),
        || async move {
            let url = format!(
                "https://api.gdeltproject.org/api/v2/doc/doc?query={}&mode=ArtList&maxrecords=30&format=json&timespan=7d",
                pct_encode(query)
            );

            let mut source = "GDELT Doc 2.0".to_string();
            let mut error: Option<String> = None;
            let mut articles = Vec::new();

            match fetch_json(http, &url).await {
                Ok(payload) => articles = parse_gdelt_articles(&payload),
                Err(e) => error = Some(format!("GDELT: {e}")),
            }

            if articles.is_empty() {
                source = "WHO News RSS".to_string();
                match fetch_who_news(http).await {
                    Ok(items) => {
                        articles = items;
                        if !articles.is_empty() {
                            error = None;
                        }
                    }
                    Err(e) => {
                        let who_err = format!("WHO RSS: {e}");
                        error = Some(match error {
                            Some(prev) => format!("{prev}; {who_err}"),
                            None => who_err,
                        });
                    }
                }
            }

            if articles.is_empty() && error.is_some() {
                let err = error.unwrap_or_else(|| "Disease media unavailable".to_string());
                json!({
                    "status": classify_status(&err),
                    "source": source,
                    "error": err,
                    "articles": []
                })
            } else {
                json!({
                    "status": "ok",
                    "source": source,
                    "total": articles.len(),
                    "articles": articles
                })
            }
        },
    )
    .await
}

// ── WorldPop: population metadata ────────────────────────────────────

pub async fn fetch_worldpop_meta(http: &Client, iso3: &str) -> Value {
    let iso = iso3.to_uppercase();
    let cache_key = format!("worldpop_{iso}");
    guarded_fetch(
        &cache_key,
        json!({
            "status": "timeout",
            "source": "WorldPop",
            "error": "WorldPop request exceeded 12s budget",
            "iso3": iso
        }),
        || async move {
            let url = format!(
                "https://hub.worldpop.org/rest/data/pop/wpgp?iso3={iso}"
            );
            match fetch_json(http, &url).await {
                Ok(payload) => {
                    let data = payload
                        .get("data")
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let latest = data.iter().max_by_key(|d| {
                        d.get("popyear")
                            .and_then(|v| v.as_str().map(|s| s.to_string()).or_else(|| v.as_i64().map(|n| n.to_string())))
                            .unwrap_or_else(|| "0".to_string())
                    });
                    match latest {
                        Some(entry) => json!({
                            "status": "ok",
                            "source": "WorldPop",
                            "iso3": iso,
                            "country": entry.get("country").and_then(|v| v.as_str()).unwrap_or(""),
                            "year": entry.get("popyear").and_then(|v| v.as_str().map(|s| s.to_string()).or_else(|| v.as_i64().map(|n| n.to_string()))).unwrap_or_default(),
                            "title": entry.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                            "tif_url": entry.get("files").and_then(|v| v.as_array()).and_then(|a| a.first()).and_then(|v| v.as_str()).unwrap_or(""),
                            "summary_url": entry.get("url_summary").and_then(|v| v.as_str()).unwrap_or("")
                        }),
                        None => json!({
                            "status": "empty",
                            "source": "WorldPop",
                            "error": "No WorldPop row for this ISO3",
                            "iso3": iso
                        }),
                    }
                }
                Err(error) => json!({
                    "status": classify_status(&error),
                    "source": "WorldPop",
                    "error": error,
                    "iso3": iso
                }),
            }
        },
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opensky_maps_hex_when_callsign_blank() {
        let state = json!([
            "abc123",
            "   ",
            "Indonesia",
            1,
            1_700_000_000,
            106.8,
            -6.2,
            10500.0,
            false,
            220.0,
            90.0,
            1.5,
            null,
            10600.0,
            "6543"
        ]);
        let flight = parse_opensky_state(&state).unwrap();
        assert_eq!(flight["icao24"], "abc123");
        assert!(flight["callsign"].is_null());
        assert_eq!(flight["origin_country"], "Indonesia");
        assert_eq!(flight["altitude_m"], 10500.0);
        assert_eq!(flight["last_contact"], 1_700_000_000);
        assert_eq!(flight["squawk"], "6543");
    }

    #[test]
    fn opensky_skips_states_without_position() {
        let state = json!(["abc123", "GIA123", "Indonesia", 1, 1, null, null]);
        assert!(parse_opensky_state(&state).is_none());
    }

    #[test]
    fn firms_csv_keeps_asean_rows_only() {
        let csv = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight\n\
                   -2.1,112.4,330.1,0.4,0.4,2026-09-16,0330,N,nominal,2.0NRT,290.0,12.2,D\n\
                   40.7,-74.0,340.0,0.4,0.4,2026-09-16,0331,N,high,2.0NRT,300.0,20.0,D\n";
        let rows = parse_firms_csv(csv).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["latitude"], -2.1);
        assert_eq!(rows[0]["confidence"], "nominal");
        assert_eq!(rows[0]["acq_date"], "2026-09-16");
    }

    #[test]
    fn firms_csv_rejects_html_error() {
        let err = parse_firms_csv("<html>Invalid MAP_KEY</html>").unwrap_err();
        assert!(err.to_lowercase().contains("invalid") || err.to_lowercase().contains("html"));
    }

    #[test]
    fn overpass_reads_node_and_center_coords() {
        let payload = json!({
            "elements": [
                {"id": 1, "lat": -6.2, "lon": 106.8, "tags": {"name": "RS A", "amenity": "hospital"}},
                {"id": 2, "center": {"lat": 1.3, "lon": 103.8}, "tags": {"name:en": "Clinic B", "healthcare": "clinic"}}
            ]
        });
        let facilities = parse_overpass_elements(&payload);
        assert_eq!(facilities.len(), 2);
        assert_eq!(facilities[0]["name"], "RS A");
        assert_eq!(facilities[1]["name"], "Clinic B");
        assert_eq!(facilities[1]["amenity_type"], "clinic");
    }

    #[test]
    fn inaturalist_uses_location_string_fallback() {
        let obs = json!({"location": "-6.2,106.8", "species_guess": "Aedes aegypti"});
        assert_eq!(observation_coords(&obs), Some((106.8, -6.2)));
    }

    #[test]
    fn who_rss_maps_item_fields() {
        let xml = r#"<rss><channel>
            <item><title>Dengue outbreak &amp; response</title><link>https://www.who.int/news/dengue</link><pubDate>Wed, 16 Sep 2026 00:00:00 GMT</pubDate></item>
            <item><title></title><link>https://www.who.int/empty</link></item>
        </channel></rss>"#;
        let articles = parse_rss_items(xml, "who.int");
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0]["title"], "Dengue outbreak & response");
        assert_eq!(articles[0]["domain"], "who.int");
        assert_eq!(articles[0]["url"], "https://www.who.int/news/dengue");
    }

    #[test]
    fn json_parser_rejects_gdelt_throttle_text() {
        let err = parse_json_body("Your request was too frequent. Please try again later.").unwrap_err();
        assert!(err.contains("non-JSON"));
    }

    #[test]
    fn overpass_queries_are_bounded() {
        let indonesia = region_context::resolve_country("Indonesia").unwrap();
        let capital = overpass_query_around_capital(indonesia);
        assert!(capital.contains("[timeout:8]"));
        assert!(capital.contains("out center 120"));
        assert!(!capital.contains("[timeout:20]"));
        let asean = overpass_query_asean_hospitals();
        assert!(asean.contains("[timeout:8]"));
        assert!(asean.contains("out center 120"));
        assert!(asean.contains("-11.2"));
        assert!(asean.contains("amenity"));
        assert!(!asean.contains("doctors"));
    }

    #[test]
    fn cache_ttl_is_shorter_for_flights() {
        assert_eq!(ttl_for("opensky_asean"), Duration::from_secs(45));
        assert_eq!(ttl_for("healthsites_id"), Duration::from_secs(300));
        assert_eq!(ttl_for("worldpop_IDN"), Duration::from_secs(300));
        assert_eq!(ttl_for("firms_asean"), Duration::from_secs(180));
        assert_eq!(ttl_for("gdelt_dengue"), Duration::from_secs(180));
    }

    #[test]
    fn last_good_is_served_when_fresh_cache_misses() {
        let key = "test_last_good_facilities";
        set_last_good(
            key.to_string(),
            json!({"status":"ok","facilities":[{"name":"RS A"}],"source":"Overpass"}),
        );
        let stale = finish_layer(
            key.to_string(),
            json!({"status":"timeout","error":"Overpass: timeout","facilities":[]}),
        );
        assert_eq!(stale["cached"], true);
        assert_eq!(stale["stale"], true);
        assert_eq!(stale["facilities"][0]["name"], "RS A");
        assert_eq!(stale["refresh_error"], "Overpass: timeout");
    }

    #[test]
    fn classify_status_maps_timeout_auth_and_unavailable() {
        assert_eq!(classify_status("error sending request: timed out"), "timeout");
        assert_eq!(classify_status("HTTP 401"), "auth");
        assert_eq!(classify_status("NASA_FIRMS_MAP_KEY not configured"), "auth");
        assert_eq!(classify_status("HTTP 503"), "unavailable");
        assert_eq!(classify_status("connection reset"), "error");
    }
}
