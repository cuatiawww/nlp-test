//! Per-country environmental context for `/nlp/detail-region`.
//! Proxies allow-listed free APIs (Open-Meteo, NASA POWER, GDACS, USGS)
//! so the browser stays on same-origin `/api/v1/region-context`.

use chrono::{Duration as ChronoDuration, Utc};
use reqwest::Client;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

const UA: &str = "ASEAN-PHE-Surveillance/1.0 (detail-region; non-commercial research)";
const FETCH_TIMEOUT: Duration = Duration::from_secs(8);
const CACHE_TTL: Duration = Duration::from_secs(600);

struct CacheEntry {
    expires_at: Instant,
    payload: Value,
}

static CACHE: Mutex<Option<HashMap<String, CacheEntry>>> = Mutex::new(None);

#[derive(Clone, Copy)]
pub struct CountryMeta {
    pub storage: &'static str,
    pub display: &'static str,
    pub iso2: &'static str,
    pub iso3: &'static str,
    pub capital: &'static str,
    pub lat: f64,
    pub lon: f64,
    pub timezone: &'static str,
    /// min_lon, min_lat, max_lon, max_lat
    pub bbox: [f64; 4],
}

/// ASEAN 10 + Timor-Leste envelope used by dashboard map overlays.
pub const ASEAN_MAP_BBOX: [f64; 4] = [92.1, -11.2, 141.1, 28.6];

const COUNTRIES: &[CountryMeta] = &[
    CountryMeta {
        storage: "Brunei",
        display: "Brunei",
        iso2: "BN",
        iso3: "BRN",
        capital: "Bandar Seri Begawan",
        lat: 4.9031,
        lon: 114.9398,
        timezone: "Asia/Brunei",
        bbox: [114.0, 4.0, 115.4, 5.1],
    },
    CountryMeta {
        storage: "Cambodia",
        display: "Cambodia",
        iso2: "KH",
        iso3: "KHM",
        capital: "Phnom Penh",
        lat: 11.5564,
        lon: 104.9282,
        timezone: "Asia/Phnom_Penh",
        bbox: [102.3, 10.3, 107.7, 14.7],
    },
    CountryMeta {
        storage: "Indonesia",
        display: "Indonesia",
        iso2: "ID",
        iso3: "IDN",
        capital: "Jakarta",
        lat: -6.2088,
        lon: 106.8456,
        timezone: "Asia/Jakarta",
        bbox: [95.0, -11.2, 141.1, 6.2],
    },
    CountryMeta {
        storage: "Laos",
        display: "Lao PDR",
        iso2: "LA",
        iso3: "LAO",
        capital: "Vientiane",
        lat: 17.9757,
        lon: 102.6331,
        timezone: "Asia/Vientiane",
        bbox: [100.0, 13.9, 107.8, 22.6],
    },
    CountryMeta {
        storage: "Malaysia",
        display: "Malaysia",
        iso2: "MY",
        iso3: "MYS",
        capital: "Kuala Lumpur",
        lat: 3.1390,
        lon: 101.6869,
        timezone: "Asia/Kuala_Lumpur",
        bbox: [99.6, 0.8, 119.4, 7.5],
    },
    CountryMeta {
        storage: "Myanmar",
        display: "Myanmar",
        iso2: "MM",
        iso3: "MMR",
        capital: "Naypyidaw",
        lat: 19.7633,
        lon: 96.0785,
        timezone: "Asia/Yangon",
        bbox: [92.1, 9.5, 101.2, 28.6],
    },
    CountryMeta {
        storage: "Philippines",
        display: "Philippines",
        iso2: "PH",
        iso3: "PHL",
        capital: "Manila",
        lat: 14.5995,
        lon: 120.9842,
        timezone: "Asia/Manila",
        bbox: [116.9, 4.6, 126.7, 21.2],
    },
    CountryMeta {
        storage: "Singapore",
        display: "Singapore",
        iso2: "SG",
        iso3: "SGP",
        capital: "Singapore",
        lat: 1.3521,
        lon: 103.8198,
        timezone: "Asia/Singapore",
        bbox: [103.6, 1.15, 104.1, 1.48],
    },
    CountryMeta {
        storage: "Thailand",
        display: "Thailand",
        iso2: "TH",
        iso3: "THA",
        capital: "Bangkok",
        lat: 13.7563,
        lon: 100.5018,
        timezone: "Asia/Bangkok",
        bbox: [97.3, 5.6, 105.7, 20.5],
    },
    CountryMeta {
        storage: "Timor-Leste",
        display: "Timor-Leste",
        iso2: "TL",
        iso3: "TLS",
        capital: "Dili",
        lat: -8.5569,
        lon: 125.5603,
        timezone: "Asia/Dili",
        bbox: [124.0, -9.5, 127.4, -8.1],
    },
    CountryMeta {
        storage: "Vietnam",
        display: "Viet Nam",
        iso2: "VN",
        iso3: "VNM",
        capital: "Ha Noi",
        lat: 21.0278,
        lon: 105.8342,
        timezone: "Asia/Ho_Chi_Minh",
        bbox: [102.1, 8.4, 109.5, 23.4],
    },
];

pub fn asean_countries() -> &'static [CountryMeta] {
    COUNTRIES
}

pub fn resolve_country(raw: &str) -> Option<CountryMeta> {
    let key = raw.trim().to_lowercase().replace('_', " ");
    let key = key.replace('-', " ");
    COUNTRIES.iter().copied().find(|item| {
        let storage = item.storage.to_lowercase().replace('-', " ");
        let display = item.display.to_lowercase().replace('-', " ");
        key == storage
            || key == display
            || key == item.iso2.to_lowercase()
            || key == item.iso3.to_lowercase()
            || (key == "lao pdr" && item.storage == "Laos")
            || (key == "laos" && item.storage == "Laos")
            || (key == "viet nam" && item.storage == "Vietnam")
            || (key == "vietnam" && item.storage == "Vietnam")
            || (key == "east timor" && item.storage == "Timor-Leste")
            || (key == "timor leste" && item.storage == "Timor-Leste")
            || (key == "brunei darussalam" && item.storage == "Brunei")
    })
}

pub fn european_aqi_label(value: f64) -> &'static str {
    if value <= 20.0 {
        "Good"
    } else if value <= 40.0 {
        "Fair"
    } else if value <= 60.0 {
        "Moderate"
    } else if value <= 80.0 {
        "Poor"
    } else if value <= 100.0 {
        "Very poor"
    } else {
        "Extremely poor"
    }
}

pub fn in_bbox(lon: f64, lat: f64, bbox: [f64; 4]) -> bool {
    lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]
}

fn inarisk_layers(iso3: &str) -> Value {
    if iso3 != "IDN" {
        return json!([]);
    }
    json!([
        {
            "key": "flood",
            "label": "Flood hazard",
            "provider": "BNPB InaRISK",
            "url": "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir/ImageServer",
            "kind": "arcgis-image"
        },
        {
            "key": "earthquake",
            "label": "Earthquake hazard",
            "provider": "BNPB InaRISK",
            "url": "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_gempabumi/ImageServer",
            "kind": "arcgis-image"
        },
        {
            "key": "landslide",
            "label": "Landslide hazard",
            "provider": "BNPB InaRISK",
            "url": "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_tanah_longsor/ImageServer",
            "kind": "arcgis-image"
        },
        {
            "key": "forestFire",
            "label": "Forest and land fire hazard",
            "provider": "BNPB InaRISK",
            "url": "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_kebakaran_hutan_dan_lahan/ImageServer",
            "kind": "arcgis-image"
        },
        {
            "key": "hillshade",
            "label": "Hillshade basemap",
            "provider": "BNPB",
            "url": "https://gis.bnpb.go.id/server/rest/services/Basemap/Indo_Hillshade/MapServer",
            "kind": "arcgis-map"
        },
        {
            "key": "population",
            "label": "Population density 2020",
            "provider": "BNPB",
            "url": "https://gis.bnpb.go.id/server/rest/services/Basemap/Kepadatan_penduduk_2020/MapServer",
            "kind": "arcgis-map"
        }
    ])
}

fn source_catalog(country: CountryMeta) -> Value {
    let mut rows = vec![
        json!({
            "name": "Open-Meteo Forecast API",
            "provider": "Open-Meteo",
            "category": "Weather / temperature / humidity",
            "endpoint": "/api/v1/region-context",
            "source_url": "https://api.open-meteo.com",
            "status": "ACTIVE",
            "integrated_in": ["Detail Region"]
        }),
        json!({
            "name": "Open-Meteo Forecast (precipitation)",
            "provider": "Open-Meteo",
            "category": "Rainfall / precipitation",
            "endpoint": "/api/v1/region-context",
            "source_url": "https://api.open-meteo.com",
            "status": "ACTIVE",
            "integrated_in": ["Detail Region"]
        }),
        json!({
            "name": "Open-Meteo Air Quality API",
            "provider": "Open-Meteo (CAMS)",
            "category": "AQI / air quality / PM2.5",
            "endpoint": "/api/v1/region-context",
            "source_url": "https://air-quality-api.open-meteo.com",
            "status": "ACTIVE",
            "integrated_in": ["Detail Region", "Regional Map"]
        }),
        json!({
            "name": "NASA POWER Daily API",
            "provider": "NASA Langley (POWER)",
            "category": "Weather / temperature / humidity",
            "endpoint": "/api/v1/region-context",
            "source_url": "https://power.larc.nasa.gov/api",
            "status": "ACTIVE",
            "integrated_in": ["Detail Region"]
        }),
        json!({
            "name": "USGS Earthquake FDSN Event API",
            "provider": "USGS",
            "category": "Natural disasters / earthquake",
            "endpoint": "/api/v1/region-context",
            "source_url": "https://earthquake.usgs.gov/fdsnws/event/1",
            "status": "ACTIVE",
            "integrated_in": ["Detail Region", "Regional Map"]
        }),
        json!({
            "name": "GDACS Multi-hazard API",
            "provider": "UN OCHA / EC JRC GDACS",
            "category": "Natural disasters / earthquake / flood / cyclone",
            "endpoint": "/api/v1/region-context",
            "source_url": "https://www.gdacs.org/gdacsapi",
            "status": "ACTIVE",
            "integrated_in": ["Detail Region", "Regional Map"]
        }),
    ];
    if country.iso3 == "IDN" {
        rows.push(json!({
            "name": "BNPB InaRISK ArcGIS REST",
            "provider": "BNPB",
            "category": "Natural disasters / earthquake / flood / cyclone",
            "endpoint": "ArcGIS ImageServer layers on the regional map",
            "source_url": "https://gis.bnpb.go.id/server/rest/services",
            "status": "ACTIVE",
            "integrated_in": ["Detail Region", "Regional Map"]
        }));
    }
    Value::Array(rows)
}

async fn fetch_json(http: &Client, url: &str) -> Result<Value, String> {
    let response = http
        .get(url)
        .header("User-Agent", UA)
        .header("Accept", "application/json")
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    response.json::<Value>().await.map_err(|err| err.to_string())
}

fn mean_of_object(map: &Value) -> Option<f64> {
    let obj = map.as_object()?;
    let mut sum = 0.0;
    let mut count = 0.0;
    for (key, value) in obj {
        if key.eq_ignore_ascii_case("units") || key.eq_ignore_ascii_case("fill_value") {
            continue;
        }
        if let Some(number) = value.as_f64() {
            if number.is_finite() && number > -900.0 {
                sum += number;
                count += 1.0;
            }
        }
    }
    if count == 0.0 {
        None
    } else {
        Some(sum / count)
    }
}

async fn open_meteo_weather(http: &Client, country: CountryMeta) -> Value {
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone={}&forecast_days=7",
        country.lat,
        country.lon,
        urlencoding(country.timezone)
    );
    match fetch_json(http, &url).await {
        Ok(payload) => {
            let current = payload.get("current").cloned().unwrap_or(json!({}));
            let daily = payload.get("daily").cloned().unwrap_or(json!({}));
            let precip_today = daily
                .get("precipitation_sum")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_f64());
            json!({
                "status": "ok",
                "source": "Open-Meteo Forecast API",
                "attribution": "Weather data by Open-Meteo.com (CC-BY 4.0)",
                "location": { "name": country.capital, "latitude": country.lat, "longitude": country.lon },
                "current": {
                    "temperature_c": current.get("temperature_2m"),
                    "relative_humidity_pct": current.get("relative_humidity_2m"),
                    "precipitation_mm": current.get("precipitation"),
                    "weather_code": current.get("weather_code"),
                    "wind_speed_kmh": current.get("wind_speed_10m"),
                    "observed_at": current.get("time")
                },
                "precip_today_mm": precip_today,
                "daily": daily
            })
        }
        Err(error) => json!({
            "status": "error",
            "source": "Open-Meteo Forecast API",
            "error": error
        }),
    }
}

fn urlencoding(value: &str) -> String {
    value.replace('/', "%2F")
}

async fn open_meteo_air(http: &Client, country: CountryMeta) -> Value {
    let url = format!(
        "https://air-quality-api.open-meteo.com/v1/air-quality?latitude={}&longitude={}&current=pm2_5,pm10,european_aqi,us_aqi,sulphur_dioxide,aerosol_optical_depth&hourly=pm2_5,pm10,european_aqi&domains=cams_global&timezone={}&forecast_days=1",
        country.lat,
        country.lon,
        urlencoding(country.timezone)
    );
    match fetch_json(http, &url).await {
        Ok(payload) => {
            let current = payload.get("current").cloned().unwrap_or(json!({}));
            let aqi = current
                .get("european_aqi")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            json!({
                "status": "ok",
                "source": "Open-Meteo Air Quality API",
                "attribution": "CAMS / Open-Meteo air quality (cams_global)",
                "location": { "name": country.capital, "latitude": country.lat, "longitude": country.lon },
                "current": {
                    "european_aqi": current.get("european_aqi"),
                    "us_aqi": current.get("us_aqi"),
                    "aqi_label": european_aqi_label(aqi),
                    "pm2_5": current.get("pm2_5"),
                    "pm10": current.get("pm10"),
                    "so2": current.get("sulphur_dioxide"),
                    "aerosol_optical_depth": current.get("aerosol_optical_depth"),
                    "observed_at": current.get("time")
                }
            })
        }
        Err(error) => json!({
            "status": "error",
            "source": "Open-Meteo Air Quality API",
            "error": error
        }),
    }
}

async fn nasa_power(http: &Client, country: CountryMeta) -> Value {
    let end = Utc::now().date_naive();
    let start = end - ChronoDuration::days(6);
    let url = format!(
        "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,RH2M,PRECTOTCORR&community=AG&longitude={}&latitude={}&start={}&end={}&format=JSON",
        country.lon,
        country.lat,
        start.format("%Y%m%d"),
        end.format("%Y%m%d")
    );
    match fetch_json(http, &url).await {
        Ok(payload) => {
            let params = payload
                .pointer("/properties/parameter")
                .cloned()
                .unwrap_or(json!({}));
            json!({
                "status": "ok",
                "source": "NASA POWER Daily API",
                "attribution": "NASA Langley Research Center POWER Project",
                "window": { "start": start.to_string(), "end": end.to_string() },
                "location": { "name": country.capital, "latitude": country.lat, "longitude": country.lon },
                "averages": {
                    "t2m_c": mean_of_object(params.get("T2M").unwrap_or(&json!({}))),
                    "rh2m_pct": mean_of_object(params.get("RH2M").unwrap_or(&json!({}))),
                    "precip_mm": mean_of_object(params.get("PRECTOTCORR").unwrap_or(&json!({})))
                }
            })
        }
        Err(error) => json!({
            "status": "error",
            "source": "NASA POWER Daily API",
            "error": error
        }),
    }
}

fn parse_usgs(payload: &Value, bbox: [f64; 4]) -> Vec<Value> {
    payload
        .get("features")
        .and_then(|v| v.as_array())
        .map(|features| {
            features
                .iter()
                .filter_map(|feature| {
                    let coords = feature.pointer("/geometry/coordinates")?.as_array()?;
                    let lon = coords.first()?.as_f64()?;
                    let lat = coords.get(1)?.as_f64()?;
                    if !in_bbox(lon, lat, bbox) {
                        return None;
                    }
                    let props = feature.get("properties")?;
                    Some(json!({
                        "id": props.get("code").or_else(|| feature.get("id")),
                        "source": "usgs",
                        "kind": "earthquake",
                        "title": props.get("place"),
                        "magnitude": props.get("mag"),
                        "when": props.get("time"),
                        "url": props.get("url"),
                        "latitude": lat,
                        "longitude": lon
                    }))
                })
                .take(40)
                .collect()
        })
        .unwrap_or_default()
}

fn gdacs_coords(feature: &Value) -> Option<(f64, f64)> {
    if let Some(coords) = feature.pointer("/geometry/coordinates").and_then(|v| v.as_array()) {
        if coords.len() >= 2 {
            if let (Some(lon), Some(lat)) = (coords[0].as_f64(), coords[1].as_f64()) {
                return Some((lon, lat));
            }
        }
    }
    let lon = feature
        .pointer("/properties/longitude")
        .or_else(|| feature.get("longitude"))
        .and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok()));
    let lat = feature
        .pointer("/properties/latitude")
        .or_else(|| feature.get("latitude"))
        .and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok()));
    match (lon, lat) {
        (Some(lon), Some(lat)) => Some((lon, lat)),
        _ => None,
    }
}

fn parse_gdacs(payload: &Value, bbox: [f64; 4]) -> Vec<Value> {
    let features = payload
        .get("features")
        .and_then(|v| v.as_array())
        .cloned()
        .or_else(|| payload.as_array().cloned())
        .unwrap_or_default();
    features
        .iter()
        .filter_map(|feature| {
            let (lon, lat) = gdacs_coords(feature)?;
            if !in_bbox(lon, lat, bbox) {
                return None;
            }
            let props = feature.get("properties").cloned().unwrap_or_else(|| feature.clone());
            Some(json!({
                "id": props.get("eventid").or_else(|| feature.get("id")),
                "source": "gdacs",
                "kind": props.get("eventtype").or_else(|| props.get("hazard")),
                "title": props.get("eventname").or_else(|| props.get("name")).or_else(|| props.get("htmldescription")),
                "alert_level": props.get("alertlevel"),
                "when": props.get("fromdate").or_else(|| props.get("date")),
                "url": props.get("url").or_else(|| props.get("link")),
                "latitude": lat,
                "longitude": lon
            }))
        })
        .take(40)
        .collect()
}

async fn usgs_quakes(http: &Client, country: CountryMeta) -> Value {
    let start = (Utc::now() - ChronoDuration::days(90))
        .format("%Y-%m-%d")
        .to_string();
    let url = format!(
        "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&minlatitude={}&maxlatitude={}&minlongitude={}&maxlongitude={}&starttime={}&limit=50&orderby=time",
        country.bbox[1],
        country.bbox[3],
        country.bbox[0],
        country.bbox[2],
        start
    );
    match fetch_json(http, &url).await {
        Ok(payload) => json!({
            "status": "ok",
            "source": "USGS Earthquake FDSN Event API",
            "events": parse_usgs(&payload, country.bbox)
        }),
        Err(error) => json!({
            "status": "error",
            "source": "USGS Earthquake FDSN Event API",
            "error": error,
            "events": []
        }),
    }
}

async fn gdacs_events(http: &Client, country: CountryMeta) -> Value {
    let from = (Utc::now() - ChronoDuration::days(180))
        .format("%Y-%m-%d")
        .to_string();
    let to = Utc::now().format("%Y-%m-%d").to_string();
    let url = format!(
        "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;FL;TC;VO&fromdate={}&todate={}",
        from, to
    );
    match fetch_json(http, &url).await {
        Ok(payload) => json!({
            "status": "ok",
            "source": "GDACS Multi-hazard API",
            "events": parse_gdacs(&payload, country.bbox)
        }),
        Err(error) => json!({
            "status": "error",
            "source": "GDACS Multi-hazard API",
            "error": error,
            "events": []
        }),
    }
}

fn cache_get(key: &str) -> Option<Value> {
    let guard = CACHE.lock().ok()?;
    let map = guard.as_ref()?;
    let entry = map.get(key)?;
    if Instant::now() < entry.expires_at {
        Some(entry.payload.clone())
    } else {
        None
    }
}

fn cache_put_ttl(key: String, payload: Value, ttl: Duration) {
    if let Ok(mut guard) = CACHE.lock() {
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

fn cache_put(key: String, payload: Value) {
    cache_put_ttl(key, payload, CACHE_TTL);
}

pub async fn build_region_context(http: &Client, country_raw: &str) -> Result<Value, String> {
    let country = resolve_country(country_raw)
        .ok_or_else(|| "Country is outside the ASEAN + Timor-Leste set.".to_string())?;
    let cache_key = country.storage.to_string();
    if let Some(cached) = cache_get(&cache_key) {
        return Ok(cached);
    }

    let (weather, air_quality, climate, usgs, gdacs) = tokio::join!(
        open_meteo_weather(http, country),
        open_meteo_air(http, country),
        nasa_power(http, country),
        usgs_quakes(http, country),
        gdacs_events(http, country),
    );

    let usgs_events = usgs.get("events").cloned().unwrap_or(json!([]));
    let gdacs_list = gdacs.get("events").cloned().unwrap_or(json!([]));
    let mut hazards = Vec::new();
    if let Some(items) = usgs_events.as_array() {
        hazards.extend(items.iter().cloned());
    }
    if let Some(items) = gdacs_list.as_array() {
        hazards.extend(items.iter().cloned());
    }

    let payload = json!({
        "country": country.storage,
        "display_name": country.display,
        "iso2": country.iso2,
        "iso3": country.iso3,
        "capital": {
            "name": country.capital,
            "latitude": country.lat,
            "longitude": country.lon
        },
        "bbox": country.bbox,
        "timezone": country.timezone,
        "scope": "asean11_member",
        "updated_at": Utc::now().to_rfc3339(),
        "weather": weather,
        "air_quality": air_quality,
        "climate": climate,
        "usgs": usgs,
        "gdacs": gdacs,
        "hazards": hazards,
        "layers": {
            "inarisk": inarisk_layers(country.iso3),
            "note": if country.iso3 == "IDN" {
                "InaRISK hazard rasters are toggled on the regional OpenLayers map."
            } else {
                "InaRISK rasters are Indonesia-only; other members use Open-Meteo / GDACS / USGS overlays."
            }
        },
        "sources": source_catalog(country)
    });
    cache_put(cache_key, payload.clone());
    Ok(payload)
}

pub async fn fetch_asean_hazards(http: &Client) -> Value {
    let cache_key = "asean_map_hazards";
    if let Some(cached) = cache_get(cache_key) {
        return cached;
    }

    let start = (Utc::now() - ChronoDuration::days(90))
        .format("%Y-%m-%d")
        .to_string();
    let usgs_url = format!(
        "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&minlatitude={}&maxlatitude={}&minlongitude={}&maxlongitude={}&starttime={}&limit=80&orderby=time",
        ASEAN_MAP_BBOX[1],
        ASEAN_MAP_BBOX[3],
        ASEAN_MAP_BBOX[0],
        ASEAN_MAP_BBOX[2],
        start
    );
    let from = (Utc::now() - ChronoDuration::days(180))
        .format("%Y-%m-%d")
        .to_string();
    let to = Utc::now().format("%Y-%m-%d").to_string();
    let gdacs_url = format!(
        "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;FL;TC;VO&fromdate={}&todate={}",
        from, to
    );

    let (usgs_res, gdacs_res) = tokio::join!(fetch_json(http, &usgs_url), fetch_json(http, &gdacs_url));
    let mut events = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    match usgs_res {
        Ok(payload) => events.extend(parse_usgs(&payload, ASEAN_MAP_BBOX)),
        Err(error) => errors.push(format!("USGS: {error}")),
    }
    match gdacs_res {
        Ok(payload) => events.extend(parse_gdacs(&payload, ASEAN_MAP_BBOX)),
        Err(error) => errors.push(format!("GDACS: {error}")),
    }

    let status = if events.is_empty() && !errors.is_empty() {
        "error"
    } else {
        "ok"
    };
    let result = json!({
        "status": status,
        "source": "USGS Earthquake FDSN + GDACS Multi-hazard",
        "total": events.len(),
        "events": events,
        "error": if errors.is_empty() { Value::Null } else { json!(errors.join("; ")) }
    });
    if status == "ok" {
        cache_put_ttl(cache_key.to_string(), result.clone(), Duration::from_secs(180));
    }
    result
}

fn environment_marker(country: CountryMeta, weather: Value, air: Value) -> Value {
    let weather_ok = weather.get("status").and_then(|v| v.as_str()) == Some("ok");
    let air_ok = air.get("status").and_then(|v| v.as_str()) == Some("ok");
    json!({
        "country": country.storage,
        "display_name": country.display,
        "capital": country.capital,
        "latitude": country.lat,
        "longitude": country.lon,
        "temperature_c": weather.pointer("/current/temperature_c"),
        "relative_humidity_pct": weather.pointer("/current/relative_humidity_pct"),
        "precipitation_mm": weather.pointer("/current/precipitation_mm"),
        "wind_speed_kmh": weather.pointer("/current/wind_speed_kmh"),
        "weather_observed_at": weather.pointer("/current/observed_at"),
        "european_aqi": air.pointer("/current/european_aqi"),
        "us_aqi": air.pointer("/current/us_aqi"),
        "aqi_label": air.pointer("/current/aqi_label"),
        "pm2_5": air.pointer("/current/pm2_5"),
        "pm10": air.pointer("/current/pm10"),
        "so2": air.pointer("/current/so2"),
        "air_observed_at": air.pointer("/current/observed_at"),
        "weather_status": weather.get("status"),
        "air_status": air.get("status"),
        "weather_error": weather.get("error"),
        "air_error": air.get("error"),
        "partial": !(weather_ok && air_ok)
    })
}

pub async fn fetch_asean_environment(http: &Client) -> Value {
    let cache_key = "asean_map_environment";
    if let Some(cached) = cache_get(cache_key) {
        return cached;
    }

    let mut handles = Vec::new();
    for country in COUNTRIES.iter().copied() {
        let http = http.clone();
        handles.push(tokio::spawn(async move {
            let (weather, air) = tokio::join!(
                open_meteo_weather(&http, country),
                open_meteo_air(&http, country)
            );
            environment_marker(country, weather, air)
        }));
    }

    let mut markers = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(marker) => {
                let weather_ok = marker.get("weather_status").and_then(|v| v.as_str()) == Some("ok");
                let air_ok = marker.get("air_status").and_then(|v| v.as_str()) == Some("ok");
                if weather_ok || air_ok {
                    markers.push(marker);
                } else {
                    errors.push(format!(
                        "{}: weather {} / air {}",
                        marker.get("display_name").and_then(|v| v.as_str()).unwrap_or("country"),
                        marker.get("weather_error").and_then(|v| v.as_str()).unwrap_or("error"),
                        marker.get("air_error").and_then(|v| v.as_str()).unwrap_or("error")
                    ));
                }
            }
            Err(error) => errors.push(error.to_string()),
        }
    }

    let status = if markers.is_empty() { "error" } else { "ok" };
    let result = json!({
        "status": status,
        "source": "Open-Meteo Forecast + Air Quality (CAMS)",
        "total": markers.len(),
        "markers": markers,
        "error": if errors.is_empty() { Value::Null } else { json!(errors.join("; ")) }
    });
    if status == "ok" {
        cache_put_ttl(cache_key.to_string(), result.clone(), Duration::from_secs(180));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_asean_aliases() {
        assert_eq!(resolve_country("Indonesia").unwrap().iso3, "IDN");
        assert_eq!(resolve_country("viet nam").unwrap().storage, "Vietnam");
        assert_eq!(resolve_country("Lao PDR").unwrap().display, "Lao PDR");
        assert_eq!(resolve_country("TLS").unwrap().storage, "Timor-Leste");
        assert!(resolve_country("Brazil").is_none());
        assert!(resolve_country("United States").is_none());
    }

    #[test]
    fn aqi_bands_match_cams_european_scale() {
        assert_eq!(european_aqi_label(12.0), "Good");
        assert_eq!(european_aqi_label(55.0), "Moderate");
        assert_eq!(european_aqi_label(140.0), "Extremely poor");
    }

    #[test]
    fn bbox_contains_capital_and_rejects_outsiders() {
        let indonesia = resolve_country("Indonesia").unwrap();
        assert!(in_bbox(indonesia.lon, indonesia.lat, indonesia.bbox));
        assert!(!in_bbox(-111.89, 40.76, indonesia.bbox));
    }

    #[test]
    fn usgs_parser_keeps_in_country_quakes_only() {
        let indonesia = resolve_country("ID").unwrap();
        let payload = json!({
            "features": [
                {
                    "id": "us1",
                    "geometry": { "coordinates": [110.0, -7.5, 10.0] },
                    "properties": { "place": "Java", "mag": 5.1, "time": 1, "url": "https://example.org/us1" }
                },
                {
                    "id": "us2",
                    "geometry": { "coordinates": [-70.0, -30.0, 10.0] },
                    "properties": { "place": "Chile", "mag": 6.2, "time": 2 }
                }
            ]
        });
        let events = parse_usgs(&payload, indonesia.bbox);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["title"], "Java");
    }

    #[test]
    fn asean_envelope_contains_every_capital() {
        for country in asean_countries() {
            assert!(
                in_bbox(country.lon, country.lat, ASEAN_MAP_BBOX),
                "{} capital is outside ASEAN map envelope",
                country.storage
            );
        }
    }

    #[test]
    fn gdacs_keeps_volcano_inside_asean_envelope() {
        let payload = json!({
            "features": [
                {
                    "id": "vo1",
                    "geometry": { "coordinates": [110.44, -7.54] },
                    "properties": {
                        "eventid": "vo1",
                        "eventtype": "VO",
                        "eventname": "Merapi",
                        "alertlevel": "Orange",
                        "fromdate": "2026-09-01"
                    }
                },
                {
                    "id": "vo2",
                    "geometry": { "coordinates": [-155.0, 19.4] },
                    "properties": { "eventtype": "VO", "eventname": "Kilauea" }
                }
            ]
        });
        let events = parse_gdacs(&payload, ASEAN_MAP_BBOX);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["title"], "Merapi");
        assert_eq!(events[0]["kind"], "VO");
    }
}
