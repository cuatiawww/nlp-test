//! Proxy fetchers for external map layer APIs.
//! Follows the same cache-and-proxy pattern as `region_context.rs`.

use reqwest::Client;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

const UA: &str = "ASEAN-PHE-Surveillance/1.0 (map-layers; non-commercial research)";
const FETCH_TIMEOUT: Duration = Duration::from_secs(12);
const CACHE_TTL: Duration = Duration::from_secs(600);

struct CacheEntry {
    expires_at: Instant,
    payload: Value,
}

static LAYER_CACHE: Mutex<Option<HashMap<String, CacheEntry>>> = Mutex::new(None);

fn get_cached(key: &str) -> Option<Value> {
    let guard = LAYER_CACHE.lock().ok()?;
    let map = guard.as_ref()?;
    let entry = map.get(key)?;
    if entry.expires_at > Instant::now() {
        Some(entry.payload.clone())
    } else {
        None
    }
}

fn set_cached(key: String, payload: Value) {
    if let Ok(mut guard) = LAYER_CACHE.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(key, CacheEntry {
            expires_at: Instant::now() + CACHE_TTL,
            payload,
        });
    }
}

fn pct_encode(input: &str) -> String {
    url::form_urlencoded::byte_serialize(input.as_bytes()).collect()
}

async fn fetch_json(http: &Client, url: &str) -> Result<Value, String> {
    let response = http
        .get(url)
        .header("User-Agent", UA)
        .header("Accept", "application/json")
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    response.json::<Value>().await.map_err(|e| e.to_string())
}

// ── iNaturalist: Aedes vector sightings ──────────────────────────────

pub async fn fetch_inaturalist_vectors(http: &Client) -> Value {
    let cache_key = "inaturalist_aedes_asean".to_string();
    if let Some(cached) = get_cached(&cache_key) {
        return cached;
    }

    let url = "https://api.inaturalist.org/v1/observations?taxon_name=Aedes&nelat=28&nelng=141&swlat=-11&swlng=95&per_page=200&order=desc&order_by=observed_on&quality_grade=research";

    let result = match fetch_json(http, url).await {
        Ok(payload) => {
            let observations = payload.get("results").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let markers: Vec<Value> = observations.iter().filter_map(|obs| {
                let lat = obs.pointer("/geojson/coordinates/1")?.as_f64()?;
                let lon = obs.pointer("/geojson/coordinates/0")?.as_f64()?;
                let species = obs.get("species_guess").and_then(|v| v.as_str()).unwrap_or("Aedes sp.");
                let observed = obs.get("observed_on").and_then(|v| v.as_str()).unwrap_or("");
                let photo = obs.pointer("/photos/0/url").and_then(|v| v.as_str()).unwrap_or("");
                let place = obs.get("place_guess").and_then(|v| v.as_str()).unwrap_or("");
                Some(json!({
                    "latitude": lat,
                    "longitude": lon,
                    "species": species,
                    "observed_on": observed,
                    "photo_url": photo.replace("/square.", "/small."),
                    "place": place
                }))
            }).collect();
            json!({
                "status": "ok",
                "source": "iNaturalist",
                "total": payload.get("total_results"),
                "sightings": markers
            })
        }
        Err(error) => json!({ "status": "error", "source": "iNaturalist", "error": error, "sightings": [] }),
    };
    set_cached(cache_key, result.clone());
    result
}

// ── OpenSky Network: live flights ────────────────────────────────────

pub async fn fetch_opensky_flights(http: &Client) -> Value {
    let cache_key = "opensky_asean".to_string();
    if let Some(cached) = get_cached(&cache_key) {
        return cached;
    }

    let url = "https://opensky-network.org/api/states/all?lamin=-11&lomin=95&lamax=28&lomax=141";

    let result = match fetch_json(http, url).await {
        Ok(payload) => {
            let states = payload.get("states").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let flights: Vec<Value> = states.iter().filter_map(|s| {
                let arr = s.as_array()?;
                let lon = arr.get(5)?.as_f64()?;
                let lat = arr.get(6)?.as_f64()?;
                let callsign = arr.get(1)?.as_str().unwrap_or("").trim();
                let origin = arr.get(2)?.as_str().unwrap_or("");
                let altitude = arr.get(7).and_then(|v| v.as_f64());
                let velocity = arr.get(9).and_then(|v| v.as_f64());
                let heading = arr.get(10).and_then(|v| v.as_f64());
                if callsign.is_empty() { return None; }
                Some(json!({
                    "callsign": callsign,
                    "origin_country": origin,
                    "latitude": lat,
                    "longitude": lon,
                    "altitude_m": altitude,
                    "velocity_ms": velocity,
                    "heading": heading
                }))
            }).take(250).collect();
            json!({
                "status": "ok",
                "source": "OpenSky Network",
                "total": flights.len(),
                "flights": flights
            })
        }
        Err(error) => json!({ "status": "error", "source": "OpenSky Network", "error": error, "flights": [] }),
    };
    set_cached(cache_key, result.clone());
    result
}

// ── NASA FIRMS: active fire hotspots ─────────────────────────────────

pub async fn fetch_firms_hotspots(http: &Client, map_key: Option<&str>) -> Value {
    let key = match map_key {
        Some(k) if !k.trim().is_empty() => k.trim(),
        _ => return json!({
            "status": "unavailable",
            "source": "NASA FIRMS",
            "error": "NASA_FIRMS_MAP_KEY not configured",
            "hotspots": []
        }),
    };

    let cache_key = "firms_asean".to_string();
    if let Some(cached) = get_cached(&cache_key) {
        return cached;
    }

    let url = format!(
        "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{}/VIIRS_SNPP_NRT/95,-11,141,28/2",
        key
    );

    let response = http
        .get(&url)
        .header("User-Agent", UA)
        .timeout(Duration::from_secs(15))
        .send()
        .await;

    let result = match response {
        Ok(resp) if resp.status().is_success() => {
            let csv_text = resp.text().await.unwrap_or_default();
            let lines: Vec<&str> = csv_text.lines().collect();
            if lines.len() < 2 {
                json!({ "status": "ok", "source": "NASA FIRMS", "hotspots": [] })
            } else {
                let headers: Vec<&str> = lines[0].split(',').collect();
                let lat_i = headers.iter().position(|h| *h == "latitude").unwrap_or(0);
                let lon_i = headers.iter().position(|h| *h == "longitude").unwrap_or(1);
                let bright_i = headers.iter().position(|h| *h == "bright_ti4").unwrap_or(2);
                let conf_i = headers.iter().position(|h| *h == "confidence").unwrap_or(9);
                let date_i = headers.iter().position(|h| *h == "acq_date").unwrap_or(5);

                let hotspots: Vec<Value> = lines[1..].iter().filter_map(|line| {
                    let cols: Vec<&str> = line.split(',').collect();
                    let lat = cols.get(lat_i)?.parse::<f64>().ok()?;
                    let lon = cols.get(lon_i)?.parse::<f64>().ok()?;
                    let brightness = cols.get(bright_i).and_then(|v| v.parse::<f64>().ok());
                    let confidence = cols.get(conf_i).map(|v| v.to_string());
                    let acq_date = cols.get(date_i).map(|v| v.to_string());
                    Some(json!({
                        "latitude": lat,
                        "longitude": lon,
                        "brightness": brightness,
                        "confidence": confidence,
                        "acq_date": acq_date
                    }))
                }).take(500).collect();
                json!({
                    "status": "ok",
                    "source": "NASA FIRMS (VIIRS SNPP NRT)",
                    "total": hotspots.len(),
                    "hotspots": hotspots
                })
            }
        }
        Ok(resp) => json!({
            "status": "error",
            "source": "NASA FIRMS",
            "error": format!("HTTP {}", resp.status().as_u16()),
            "hotspots": []
        }),
        Err(e) => json!({ "status": "error", "source": "NASA FIRMS", "error": e.to_string(), "hotspots": [] }),
    };
    set_cached(cache_key, result.clone());
    result
}

// ── Healthsites.io: health facilities ────────────────────────────────

pub async fn fetch_healthsites(http: &Client, api_key: Option<&str>, country: &str) -> Value {
    let key = match api_key {
        Some(k) if !k.trim().is_empty() => k.trim(),
        _ => return json!({
            "status": "unavailable",
            "source": "Healthsites.io",
            "error": "HEALTHSITES_API_KEY not configured",
            "facilities": []
        }),
    };

    let cache_key = format!("healthsites_{}", country.to_lowercase());
    if let Some(cached) = get_cached(&cache_key) {
        return cached;
    }

    let url = format!(
        "https://healthsites.io/api/v3/facilities/?api-key={}&page=1&country={}&page_size=200",
        key, pct_encode(country)
    );

    let result = match fetch_json(http, &url).await {
        Ok(payload) => {
            let features = payload.get("features").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let facilities: Vec<Value> = features.iter().filter_map(|f| {
                let coords = f.pointer("/geometry/coordinates")?.as_array()?;
                let lon = coords.first()?.as_f64()?;
                let lat = coords.get(1)?.as_f64()?;
                let props = f.get("properties")?;
                let name = props.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown facility");
                let amenity = props.get("amenity").and_then(|v| v.as_str()).unwrap_or("health");
                Some(json!({
                    "name": name,
                    "latitude": lat,
                    "longitude": lon,
                    "amenity_type": amenity,
                    "osm_id": props.get("osm_id")
                }))
            }).collect();
            json!({
                "status": "ok",
                "source": "Healthsites.io",
                "total": facilities.len(),
                "facilities": facilities
            })
        }
        Err(error) => json!({ "status": "error", "source": "Healthsites.io", "error": error, "facilities": [] }),
    };
    set_cached(cache_key, result.clone());
    result
}

// ── GDELT Doc 2.0: disease news ──────────────────────────────────────

pub async fn fetch_gdelt_news(http: &Client, disease: Option<&str>) -> Value {
    let query = disease.unwrap_or("dengue OR cholera OR influenza");
    let cache_key = format!("gdelt_{}", query.replace(' ', "_").to_lowercase());
    if let Some(cached) = get_cached(&cache_key) {
        return cached;
    }

    let url = format!(
        "https://api.gdeltproject.org/api/v2/doc/doc?query={}&mode=ArtList&maxrecords=30&format=json&timespan=7d",
        pct_encode(query)
    );

    let result = match fetch_json(http, &url).await {
        Ok(payload) => {
            let articles = payload.get("articles").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let news: Vec<Value> = articles.iter().map(|a| {
                json!({
                    "title": a.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                    "url": a.get("url").and_then(|v| v.as_str()).unwrap_or(""),
                    "domain": a.get("domain").and_then(|v| v.as_str()).unwrap_or(""),
                    "source_country": a.get("sourcecountry").and_then(|v| v.as_str()).unwrap_or(""),
                    "language": a.get("language").and_then(|v| v.as_str()).unwrap_or(""),
                    "seen_date": a.get("seendate").and_then(|v| v.as_str()).unwrap_or("")
                })
            }).collect();
            json!({
                "status": "ok",
                "source": "GDELT Doc 2.0",
                "total": news.len(),
                "articles": news
            })
        }
        Err(error) => json!({ "status": "error", "source": "GDELT Doc 2.0", "error": error, "articles": [] }),
    };
    set_cached(cache_key, result.clone());
    result
}

// ── WorldPop: population metadata ────────────────────────────────────

pub async fn fetch_worldpop_meta(http: &Client, iso3: &str) -> Value {
    let cache_key = format!("worldpop_{}", iso3.to_uppercase());
    if let Some(cached) = get_cached(&cache_key) {
        return cached;
    }

    let url = format!("https://hub.worldpop.org/rest/data/pop/wpgp?iso3={}", iso3.to_uppercase());

    let result = match fetch_json(http, &url).await {
        Ok(payload) => {
            let data = payload.get("data").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let latest = data.iter().max_by_key(|d| {
                d.get("popyear").and_then(|v| v.as_str()).unwrap_or("0").to_string()
            });
            match latest {
                Some(entry) => json!({
                    "status": "ok",
                    "source": "WorldPop",
                    "iso3": iso3.to_uppercase(),
                    "country": entry.get("country").and_then(|v| v.as_str()).unwrap_or(""),
                    "year": entry.get("popyear").and_then(|v| v.as_str()).unwrap_or(""),
                    "title": entry.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                    "tif_url": entry.get("files").and_then(|v| v.as_array()).and_then(|a| a.first()).and_then(|v| v.as_str()).unwrap_or(""),
                    "summary_url": entry.get("url_summary").and_then(|v| v.as_str()).unwrap_or("")
                }),
                None => json!({ "status": "error", "source": "WorldPop", "error": "No data found", "iso3": iso3 }),
            }
        }
        Err(error) => json!({ "status": "error", "source": "WorldPop", "error": error }),
    };
    set_cached(cache_key, result.clone());
    result
}
