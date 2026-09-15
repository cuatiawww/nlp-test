//! Auth, CORS, password hashing, and URL safety helpers.

use axum::http::{header, HeaderMap, HeaderValue, Method};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    env,
    net::{IpAddr, ToSocketAddrs},
    sync::Mutex,
    time::{Duration, Instant},
};
use tower_http::cors::{AllowOrigin, CorsLayer};
use url::Url;

const DEFAULT_ORIGINS: &str =
    "https://abvc-surveillance.org,http://localhost:3010,http://127.0.0.1:3010";

/// Per-event caps so a mis-parsed national/population figure cannot dominate KPIs.
pub const MAX_EVENT_CASE_COUNT: i64 = 2_000_000;
pub const MAX_EVENT_DEATH_COUNT: i64 = 200_000;

pub const SANE_CASES_SQL: &str =
    "GREATEST(LEAST(COALESCE(case_count, 0), 2000000), 0)";
pub const SANE_DEATHS_SQL: &str =
    "GREATEST(LEAST(COALESCE(death_count, 0), 200000), 0)";

/// Shared validity predicate for disease-facing aggregates (alias `e`).
pub const DASHBOARD_EVENT_PREDICATE: &str = r#"(e.is_health_related = TRUE OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
                 AND e.disease_classification IS NOT NULL
                 AND UPPER(e.disease_classification) <> 'UNKNOWN'
                 AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
                 AND (COALESCE(e.confidence, 0) >= 0.15 OR LOWER(COALESCE(e.source_type, '')) IN ('skdr', 'skdr_api'))
                 AND e.published_at IS NOT NULL
                 AND LOWER(COALESCE(e.source_type, '')) <> 'test'"#;

pub fn dashboard_event_predicate(alias: &str) -> String {
    DASHBOARD_EVENT_PREDICATE.replace("e.", &format!("{alias}."))
}

pub fn sane_cases_expr(alias: &str) -> String {
    if alias.is_empty() {
        SANE_CASES_SQL.to_string()
    } else {
        format!("GREATEST(LEAST(COALESCE({alias}.case_count, 0), {MAX_EVENT_CASE_COUNT}), 0)")
    }
}

pub fn sane_deaths_expr(alias: &str) -> String {
    if alias.is_empty() {
        SANE_DEATHS_SQL.to_string()
    } else {
        format!("GREATEST(LEAST(COALESCE({alias}.death_count, 0), {MAX_EVENT_DEATH_COUNT}), 0)")
    }
}

struct LoginWindow {
    failures: u32,
    started: Instant,
}

static LOGIN_GATES: Mutex<Option<HashMap<String, LoginWindow>>> = Mutex::new(None);

pub fn build_cors_layer() -> CorsLayer {
    let raw = env::var("CORS_ALLOWED_ORIGINS").unwrap_or_else(|_| DEFAULT_ORIGINS.to_string());
    let origins: Vec<HeaderValue> = raw
        .split(',')
        .filter_map(|item| {
            let trimmed = item.trim();
            if trimmed.is_empty() {
                None
            } else {
                trimmed.parse().ok()
            }
        })
        .collect();
    let origin = if origins.is_empty() {
        AllowOrigin::exact(HeaderValue::from_static("https://abvc-surveillance.org"))
    } else {
        AllowOrigin::list(origins)
    };
    CorsLayer::new()
        .allow_origin(origin)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::ACCEPT])
        .max_age(Duration::from_secs(3600))
}

pub fn bearer_token(headers: &HeaderMap) -> String {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or("")
        .to_string()
}

pub fn is_public_route(method: &Method, path: &str) -> bool {
    if path == "/health" || path == "/api/auth/login" || path == "/api/auth/logout" {
        return true;
    }
    if *method != Method::GET {
        return false;
    }
    const PUBLIC_GET: &[&str] = &[
        "/api/v1/public-dashboard",
        "/api/v1/spatial-heatmap",
        "/api/v1/disease-trend-overview",
        "/api/v1/morbidity-mortality",
        "/api/v1/crawling-stats",
        "/api/v1/events",
        "/api/v1/events/stats",
        "/api/v1/skdr/ibs-summary",
        "/api/v1/skdr/ebs-summary",
        "/api/v1/skdr-reports",
        "/api/v1/console/settings",
        "/api/v1/pipeline-health",
        "/api/v1/nlp-labels",
        "/api/v1/nlp-keywords",
        "/api/v1/language-markers",
        "/api/v1/extraction-rules",
        "/api/v1/language-models",
        "/api/v1/outbreak-rules",
        "/api/v1/locations",
        "/api/v1/disease-concepts",
        "/api/v1/source-credibility",
        "/api/v1/summary",
        "/api/v1/sources",
        "/api/v1/sources/summary",
        "/api/v1/runs",
        "/api/v1/analysis-jobs",
        "/api/v1/interoperability-integrations",
        "/api/v1/dashboard/summary",
    ];
    PUBLIC_GET
        .iter()
        .any(|prefix| path == *prefix || path.starts_with(&format!("{prefix}/")))
}

pub fn is_admin_route(method: &Method, path: &str) -> bool {
    path.starts_with("/api/v1/users")
        || path.starts_with("/api/v1/roles")
        || path == "/api/v1/data/cleanup-events"
        || path.starts_with("/api/v1/console/audit-logs")
        || path == "/api/v1/console/upload"
        || (path == "/api/v1/console/settings" && *method != Method::GET)
}

pub fn is_service_route(path: &str) -> bool {
    path == "/api/v1/ingest"
        || path.starts_with("/api/v1/ingest/")
        || path == "/api/v1/collect/raw"
}

pub fn hash_password(password: &str) -> String {
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2,
    };
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("argon2 hash")
        .to_string()
}

pub fn verify_password(password: &str, stored: &str) -> bool {
    if stored.starts_with("$argon2") {
        use argon2::{
            password_hash::{PasswordHash, PasswordVerifier},
            Argon2,
        };
        return PasswordHash::new(stored)
            .ok()
            .and_then(|parsed| Argon2::default().verify_password(password.as_bytes(), &parsed).ok())
            .is_some();
    }
    sha256_hex(password) == stored
}

pub fn is_legacy_sha256_hash(stored: &str) -> bool {
    stored.len() == 64 && stored.chars().all(|c| c.is_ascii_hexdigit())
}

fn sha256_hex(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn login_allowed(username: &str) -> bool {
    let mut guard = LOGIN_GATES.lock().unwrap_or_else(|e| e.into_inner());
    let map = guard.get_or_insert_with(HashMap::new);
    let now = Instant::now();
    map.retain(|_, window| now.duration_since(window.started) < Duration::from_secs(15 * 60));
    match map.get(username) {
        Some(window) if window.failures >= 8 => false,
        _ => true,
    }
}

pub fn record_login_failure(username: &str) {
    let mut guard = LOGIN_GATES.lock().unwrap_or_else(|e| e.into_inner());
    let map = guard.get_or_insert_with(HashMap::new);
    let now = Instant::now();
    map.entry(username.to_string())
        .and_modify(|window| {
            if now.duration_since(window.started) >= Duration::from_secs(15 * 60) {
                window.failures = 1;
                window.started = now;
            } else {
                window.failures = window.failures.saturating_add(1);
            }
        })
        .or_insert(LoginWindow {
            failures: 1,
            started: now,
        });
}

pub fn clear_login_failures(username: &str) {
    if let Ok(mut guard) = LOGIN_GATES.lock() {
        if let Some(map) = guard.as_mut() {
            map.remove(username);
        }
    }
}

pub fn validate_public_http_url(raw: &str) -> Result<String, String> {
    let parsed = Url::parse(raw.trim()).map_err(|_| "URL is not valid".to_string())?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("URL must use HTTP or HTTPS".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("URLs containing credentials are not allowed".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL must include a host".to_string())?
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host == "metadata.google.internal"
    {
        return Err("Local or internal hosts are not allowed".to_string());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_blocked_ip(ip) {
            return Err("Private, loopback, and metadata addresses are not allowed".to_string());
        }
        return Ok(parsed.to_string());
    }
    let port = parsed.port_or_known_default().unwrap_or(80);
    let addrs = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|_| format!("URL host could not be resolved: {host}"))?;
    let mut resolved = false;
    for addr in addrs {
        resolved = true;
        if is_blocked_ip(addr.ip()) {
            return Err("Private, loopback, and metadata addresses are not allowed".to_string());
        }
    }
    if !resolved {
        return Err(format!("URL host has no address: {host}"));
    }
    Ok(parsed.to_string())
}

fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.octets()[0] == 0
                || v4.octets() == [169, 254, 169, 254]
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unicast_link_local()
                || v6.is_unique_local()
                || v6.is_unspecified()
                || v6.is_multicast()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argon2_round_trip_and_legacy_sha256() {
        let hashed = hash_password("secret-pass");
        assert!(hashed.starts_with("$argon2"));
        assert!(verify_password("secret-pass", &hashed));
        assert!(!verify_password("wrong", &hashed));
        let legacy = sha256_hex("legacy-pass");
        assert!(is_legacy_sha256_hash(&legacy));
        assert!(verify_password("legacy-pass", &legacy));
        assert!(!verify_password("nope", &legacy));
    }

    #[test]
    fn ssrf_blocks_localhost_and_private_literals() {
        assert!(validate_public_http_url("http://127.0.0.1/secret").is_err());
        assert!(validate_public_http_url("http://localhost/admin").is_err());
        assert!(validate_public_http_url("http://10.0.0.5/internal").is_err());
        assert!(validate_public_http_url("http://169.254.169.254/latest/meta-data").is_err());
        assert!(validate_public_http_url("ftp://example.org/x").is_err());
        assert!(validate_public_http_url("https://user:pass@example.org/x").is_err());
    }

    #[test]
    fn public_get_users_is_not_public() {
        assert!(!is_public_route(&Method::GET, "/api/v1/users"));
        assert!(is_admin_route(&Method::GET, "/api/v1/users"));
        assert!(is_public_route(&Method::GET, "/api/v1/public-dashboard"));
        assert!(is_public_route(&Method::GET, "/api/v1/pipeline-health"));
        assert!(is_service_route("/api/v1/ingest"));
        let pred = dashboard_event_predicate("evt");
        assert!(pred.contains("evt.is_health_related"));
        assert!(pred.contains("test"));
        assert!(sane_cases_expr("").contains(&MAX_EVENT_CASE_COUNT.to_string()));
        assert!(sane_deaths_expr("x").contains("x.death_count"));
        assert_eq!(MAX_EVENT_DEATH_COUNT, 200_000);
    }

    #[test]
    fn login_gate_trips_after_repeated_failures() {
        clear_login_failures("gate-user");
        for _ in 0..8 {
            record_login_failure("gate-user");
        }
        assert!(!login_allowed("gate-user"));
        clear_login_failures("gate-user");
        assert!(login_allowed("gate-user"));
    }
}
