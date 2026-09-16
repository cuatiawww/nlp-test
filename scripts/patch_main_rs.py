import re

path = '/home/aspire_5/app/NLP-PENYAKIT/services/backend-rust/src/main.rs'
with open(path, 'r') as f:
    content = f.read()

# 1. Add mod external_layers; after mod region_context;
content = content.replace(
    'mod region_context;\nmod report_narrative;',
    'mod external_layers;\nmod region_context;\nmod report_narrative;',
    1
)
# Also try with \r\n
content = content.replace(
    'mod region_context;\r\nmod report_narrative;',
    'mod external_layers;\r\nmod region_context;\r\nmod report_narrative;',
    1
)

# 2. Add routes after the region-context route
old_route = '.route("/api/v1/region-context", get(get_region_context))'
new_routes = old_route + """
        .route("/api/v1/map-layers/vectors", get(get_vector_sightings))
        .route("/api/v1/map-layers/flights", get(get_live_flights))
        .route("/api/v1/map-layers/fires", get(get_fire_hotspots))
        .route("/api/v1/map-layers/facilities", get(get_health_facilities))
        .route("/api/v1/map-layers/news", get(get_disease_news))
        .route("/api/v1/map-layers/population", get(get_population_meta))"""
content = content.replace(old_route, new_routes, 1)

# 3. Append handler functions at the end of the file
handlers = '''

// ── External map layer proxy handlers ────────────────────────────────

#[derive(Deserialize)]
struct MapLayerQuery {
    country: Option<String>,
    disease: Option<String>,
    iso3: Option<String>,
    bbox: Option<String>,
}

async fn get_vector_sightings(
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let data = external_layers::fetch_inaturalist_vectors(&state.http).await;
    Json(json!({ "success": true, "data": data }))
}

async fn get_live_flights(
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let data = external_layers::fetch_opensky_flights(&state.http).await;
    Json(json!({ "success": true, "data": data }))
}

async fn get_fire_hotspots(
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let key = env::var("NASA_FIRMS_MAP_KEY").ok();
    let data = external_layers::fetch_firms_hotspots(&state.http, key.as_deref()).await;
    Json(json!({ "success": true, "data": data }))
}

async fn get_health_facilities(
    State(state): State<Arc<AppState>>,
    Query(params): Query<MapLayerQuery>,
) -> Json<Value> {
    let key = env::var("HEALTHSITES_API_KEY").ok();
    let country = params.country.as_deref().unwrap_or("Indonesia");
    let data = external_layers::fetch_healthsites(&state.http, key.as_deref(), country).await;
    Json(json!({ "success": true, "data": data }))
}

async fn get_disease_news(
    State(state): State<Arc<AppState>>,
    Query(params): Query<MapLayerQuery>,
) -> Json<Value> {
    let data = external_layers::fetch_gdelt_news(&state.http, params.disease.as_deref()).await;
    Json(json!({ "success": true, "data": data }))
}

async fn get_population_meta(
    State(state): State<Arc<AppState>>,
    Query(params): Query<MapLayerQuery>,
) -> Json<Value> {
    let iso3 = params.iso3.as_deref().unwrap_or("IDN");
    let data = external_layers::fetch_worldpop_meta(&state.http, iso3).await;
    Json(json!({ "success": true, "data": data }))
}
'''
content = content.rstrip() + '\n' + handlers

with open(path, 'w') as f:
    f.write(content)

print(f'Patched main.rs — now {len(content)} bytes')
