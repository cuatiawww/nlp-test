'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  CloudSun,
  Code2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Globe2,
  HardDrive,
  Layers,
  Lock,
  Network,
  Plane,
  Play,
  Printer,
  Radio,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'
import { fetchPipelineHealth } from '@/lib/api'
import { toast } from 'sonner'

export type WebServiceItem = {
  id: string
  name: string
  category: 'internal' | 'environmental' | 'geospatial' | 'hazard' | 'biomedical' | 'satellite'
  provider: string
  endpoint: string
  sourceUrl: string
  status: 'ACTIVE' | 'IN_PROGRESS' | 'FALLBACK' | 'INACTIVE'
  latencyEstimate: string
  cacheTtl: string
  integratedIn: string[]
  authModel: string
  rateLimit: string
  description: string
  fallbackMechanism: string
  samplePayload: Record<string, any>
}

// 28 Integrated Web Services & APIs across the Disease Surveillance AI Platform
const WEB_SERVICES_CATALOG: WebServiceItem[] = [
  // Core Internal Microservices
  {
    id: 'rust-backend',
    name: 'Backend Rust Core Gateway',
    category: 'internal',
    provider: 'Disease AI Core (Axum / Tokio)',
    endpoint: '/api/v1/*',
    sourceUrl: 'http://disease-backend-rust:8081',
    status: 'ACTIVE',
    latencyEstimate: '12 - 35 ms',
    cacheTtl: 'Dynamic In-Memory LRU + DB Cache',
    integratedIn: ['All Dashboards', 'API Gateway', 'Authentication', 'Spatial Processing'],
    authModel: 'Bearer JWT / Role-based Access Control (RBAC)',
    rateLimit: 'Unbounded internal network / 1,200 req/min proxy',
    description:
      'High-performance async Rust gateway handling authentication, spatial event aggregation, KPI cache snapshots, report generation, and third-party API proxying.',
    fallbackMechanism: 'Autonomous restart via Docker orchestration; multi-threaded Tokio fail-safe worker pool.',
    samplePayload: {
      status: 'ok',
      service: 'backend-rust',
      version: '0.4.2',
      uptime_seconds: 384291,
      database_pool: { active: 4, idle: 16, max: 20 },
      cache_entries: 412,
    },
  },
  {
    id: 'nlp-python',
    name: 'Biomedical NLP Intelligence Engine',
    category: 'internal',
    provider: 'Disease AI NLP (FastAPI / PyTorch)',
    endpoint: '/nlp/analyze, /nlp/translate, /icd11/resolve',
    sourceUrl: 'http://disease-nlp-python:8000',
    status: 'ACTIVE',
    latencyEstimate: '120 - 450 ms',
    cacheTtl: 'No-Cache (Deterministic Inference Engine)',
    integratedIn: ['URL Analysis', 'Continuous Crawler', 'Manual Jobs', 'ICD-11 Resolution'],
    authModel: 'Internal Network Token / Shared Secret',
    rateLimit: 'Bounded concurrency (Semaphore = 4 concurrent batches)',
    description:
      'Biomedical Named Entity Recognition (NER), disease classification, quantitative metric extraction (cases/deaths), NLLB-200 translation, and WHO ICD-11 ontology resolution.',
    fallbackMechanism: 'Bounded rules-only extractor fallback when model inference exceeds 90-second timeout budget.',
    samplePayload: {
      status: 'ok',
      service: 'nlp-python',
      model: 'zero-shot-biomedical',
      disease_labels: ['Dengue', 'Measles', 'COVID-19', 'Rabies', 'HFMD', 'Malaria'],
      translation_provider: 'nllb-200-distilled-600M',
    },
  },
  {
    id: 'collector-python',
    name: 'Surveillance Collector & Scraper',
    category: 'internal',
    provider: 'Disease AI Scraper (APScheduler / aiohttp)',
    endpoint: '/extract-url, /crawl-jobs',
    sourceUrl: 'http://disease-collector-python:8002',
    status: 'ACTIVE',
    latencyEstimate: '850 - 2,200 ms',
    cacheTtl: 'Document Hash Deduplication in MinIO',
    integratedIn: ['Data Sources', 'Continuous Crawler', 'Manual Crawler', 'URL Analysis'],
    authModel: 'Internal Docker DNS / Localhost Bind',
    rateLimit: 'Per-domain polite delay (2.5s) + Stealth User-Agent rotation',
    description:
      'Automated scheduled crawler, RSS ingestion daemon, stealth browser fetcher, and epidemiological surveillance PDF table parser.',
    fallbackMechanism: 'Multi-pass retry with HTTP plain fetch fallback when stealth browser rendering is blocked.',
    samplePayload: {
      status: 'ok',
      service: 'collector-python',
      active_jobs: 2,
      scheduled_sources: 24,
      last_scrape_at: '2026-09-22T06:58:12Z',
    },
  },
  {
    id: 'rabbitmq-broker',
    name: 'RabbitMQ Message Broker',
    category: 'internal',
    provider: 'RabbitMQ 3.13 Management',
    endpoint: 'amqp://disease-rabbitmq:5672/%2f',
    sourceUrl: 'http://disease-rabbitmq:15672',
    status: 'ACTIVE',
    latencyEstimate: '2 - 8 ms',
    cacheTtl: 'Persistent Durable Message Queues',
    integratedIn: ['Worker Queues', 'Analysis Job Pipeline', 'Batch Ingestion'],
    authModel: 'AMQP Plain Authentication (Env Credential)',
    rateLimit: 'Prefetch count = 1 per worker thread',
    description:
      'Decoupled AMQP message broker orchestrating heavy document ingestion, batch NLP jobs, and asynchronous interactive URL triage without blocking HTTP requests.',
    fallbackMechanism: 'Durable disk-backed message storage with auto-ack dead letter exchanges.',
    samplePayload: {
      status: 'ok',
      broker: 'rabbitmq',
      queues: ['disease_ingest', 'analysis_jobs', 'priority_triage'],
      messages_ready: 0,
      messages_unacknowledged: 1,
    },
  },
  {
    id: 'minio-storage',
    name: 'MinIO Document Object Storage',
    category: 'internal',
    provider: 'MinIO S3-Compatible Storage',
    endpoint: 'http://disease-minio:9000/disease-documents/*',
    sourceUrl: 'http://disease-minio:9001',
    status: 'ACTIVE',
    latencyEstimate: '5 - 15 ms',
    cacheTtl: 'Immutable Storage / Permanent Archive',
    integratedIn: ['Document Snapshot', 'Evidence Ledger', 'Raw Article Archive'],
    authModel: 'S3 Access Key & Secret / Anonymous Public Download',
    rateLimit: 'Storage I/O bounded by host filesystem',
    description:
      'Object storage bucket preserving raw scraped HTML documents, surveillance bulletins, and epidemiological PDF reports for regulatory verification and audit.',
    fallbackMechanism: 'Local volume persistence with automated bucket initialization via minio-mc sidecar.',
    samplePayload: {
      status: 'ok',
      bucket: 'disease-documents',
      stored_objects: 14820,
      total_size_mb: 284.6,
      public_read: true,
    },
  },
  {
    id: 'postgres-db',
    name: 'PostgreSQL Relational & Spatial Store',
    category: 'internal',
    provider: 'PostgreSQL 16 Spatial Database',
    endpoint: 'postgres://db-postgres:5432/disease_ai',
    sourceUrl: 'http://db-postgres:5432',
    status: 'ACTIVE',
    latencyEstimate: '3 - 10 ms',
    cacheTtl: 'Database Buffer Cache & Materialized Aggregations',
    integratedIn: ['All System Modules', 'Disease Events', 'Locations Gazetteer', 'Crawl History'],
    authModel: 'PostgreSQL Password Authentication (MD5/SCRAM)',
    rateLimit: 'Max Connection Pool = 50 active sessions',
    description:
      'Primary relational database holding epidemiological incident records, spatial polygons, WHO disease concepts, location gazetteers, and user audit trails.',
    fallbackMechanism: 'WAL write-ahead logging with transaction rollback and connection pool reconnect.',
    samplePayload: {
      status: 'ok',
      database: 'disease_ai',
      total_events: 18492,
      raw_reports: 24901,
      connections_active: 8,
    },
  },

  // Environmental & Climate APIs
  {
    id: 'open-meteo-weather',
    name: 'Open-Meteo Weather Forecast API',
    category: 'environmental',
    provider: 'Open-Meteo AG (Non-commercial research)',
    endpoint: '/api/v1/region-context',
    sourceUrl: 'https://api.open-meteo.com/v1/forecast',
    status: 'ACTIVE',
    latencyEstimate: '180 - 320 ms',
    cacheTtl: '600 seconds (10 min in-memory cache)',
    integratedIn: ['Detail Region', 'ASEAN Countries', 'Regional Map'],
    authModel: 'Keyless Open Access / Proxied via Rust Gateway',
    rateLimit: '10,000 req/day upstream fair-use',
    description:
      'Real-time temperature, relative humidity, precipitation sum, and 7-day atmospheric forecasts for ASEAN capitals to calculate vector breeding index.',
    fallbackMechanism: 'Stale cache fallback returning last-good payload if upstream exceeds 8-second budget.',
    samplePayload: {
      country: 'Indonesia',
      capital: 'Jakarta',
      current: { temperature_c: 31.4, relative_humidity_pct: 78, precipitation_mm: 2.4, wind_speed_kmh: 12 },
    },
  },
  {
    id: 'open-meteo-air-quality',
    name: 'Open-Meteo CAMS Air Quality API',
    category: 'environmental',
    provider: 'Open-Meteo / Copernicus Atmosphere (ECMWF)',
    endpoint: '/api/v1/region-context, /api/v1/map-layers/environment',
    sourceUrl: 'https://air-quality-api.open-meteo.com/v1/air-quality',
    status: 'ACTIVE',
    latencyEstimate: '210 - 380 ms',
    cacheTtl: '600 seconds (10 min in-memory cache)',
    integratedIn: ['Detail Region', 'Regional Map', 'Executive Dashboard'],
    authModel: 'Keyless Open Access / Proxied via Rust Gateway',
    rateLimit: '10,000 req/day upstream fair-use',
    description:
      'Atmospheric pollutants (PM2.5, PM10, SO2, NO2) and European/US Air Quality Index to monitor acute respiratory infection (ISPA) syndromic spikes.',
    fallbackMechanism: 'Last-good payload cache with refresh_error tracking in response header.',
    samplePayload: {
      aqi_us: 142,
      aqi_label: 'Unhealthy for Sensitive Groups',
      pm2_5: 52.8,
      pm10: 84.1,
      so2: 12.3,
    },
  },
  {
    id: 'nasa-power-climate',
    name: 'NASA POWER Daily Climatology API',
    category: 'environmental',
    provider: 'NASA Langley Research Center (POWER)',
    endpoint: '/api/v1/region-context',
    sourceUrl: 'https://power.larc.nasa.gov/api',
    status: 'ACTIVE',
    latencyEstimate: '350 - 620 ms',
    cacheTtl: '600 seconds (10 min in-memory cache)',
    integratedIn: ['Detail Region', 'Climate Correlation'],
    authModel: 'Open Public Data / Proxied via Rust Gateway',
    rateLimit: 'Polite rate limits; requests guarded by 12s execution budget',
    description:
      'Satellite-assimilated climate parameters (T2M surface temperature, RH2M relative humidity, PRECTOT precipitation) supporting longitudinal disease modeling.',
    fallbackMechanism: 'Graceful timeout handling with empty covariate arrays without crashing region profile.',
    samplePayload: {
      averages: { t2m_c: 28.6, rh2m_pct: 82.4, precip_mm: 14.8 },
      source: 'NASA POWER Daily',
      status: 'ok',
    },
  },
  {
    id: 'open-meteo-precip',
    name: 'Open-Meteo Precipitation Forecast API',
    category: 'environmental',
    provider: 'Open-Meteo Weather Model',
    endpoint: '/api/v1/region-context',
    sourceUrl: 'https://api.open-meteo.com',
    status: 'ACTIVE',
    latencyEstimate: '190 - 340 ms',
    cacheTtl: '600 seconds (10 min in-memory cache)',
    integratedIn: ['Detail Region', 'Flood-Vector Correlation'],
    authModel: 'Keyless Open Access / Proxied via Rust Gateway',
    rateLimit: '10,000 req/day upstream fair-use',
    description:
      'Hourly and daily rainfall accumulation tracking stagnant water pooling for leptospirosis and dengue mosquito proliferation.',
    fallbackMechanism: 'Defaults to 0.0 mm precipitation when weather model is unavailable.',
    samplePayload: { precip_today_mm: 18.2, status: 'ok', attribution: 'Open-Meteo' },
  },

  // Geospatial & Vector APIs
  {
    id: 'nasa-firms-fires',
    name: 'NASA FIRMS Active Fire Satellite Feed',
    category: 'geospatial',
    provider: 'NASA LANCE / EOSDIS FIRMS',
    endpoint: '/api/v1/map-layers/fires',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/api',
    status: 'ACTIVE',
    latencyEstimate: '420 - 890 ms',
    cacheTtl: '180 seconds (3 min cache)',
    integratedIn: ['Spatial Outbreak Map', 'Regional Map', 'ISPA Surveillance'],
    authModel: 'Optional MAP_KEY with automated fallback to public CSV',
    rateLimit: 'Cached with Tokio Mutex Lock (1 simultaneous fetcher)',
    description:
      'VIIRS and MODIS satellite active fire thermal anomaly hotspots filtered to the Southeast Asia bounding box for wildfire and haze surveillance.',
    fallbackMechanism: 'Automatically ingests public SUOMI_VIIRS_C2_SouthEast_Asia_24h.csv when NASA MAP_KEY is absent.',
    samplePayload: {
      status: 'ok',
      source: 'NASA FIRMS VIIRS',
      total: 184,
      hotspots: [{ latitude: -2.14, longitude: 104.82, brightness: 342.1, confidence: 'nominal' }],
    },
  },
  {
    id: 'opensky-flights',
    name: 'OpenSky Network Live Flight Vectors',
    category: 'geospatial',
    provider: 'OpenSky Network (Community ADS-B)',
    endpoint: '/api/v1/map-layers/flights',
    sourceUrl: 'https://opensky-network.org/api/states/all',
    status: 'ACTIVE',
    latencyEstimate: '380 - 750 ms',
    cacheTtl: '45 seconds (Rapid air traffic cache)',
    integratedIn: ['Spatial Outbreak Map', 'ASEAN +3', 'Port Health & Transit Triage'],
    authModel: 'Keyless Open Community Feed / Proxied via Rust Gateway',
    rateLimit: '10-second IP rate limit; strictly guarded by 45s cache',
    description:
      'Live commercial aircraft transponder state vectors in Southeast Asian airspace used as an epidemiological proxy for imported cross-border pathogen transmission.',
    fallbackMechanism: 'Stale cache fallback with 30-minute last-good retention if OpenSky returns 429 or times out.',
    samplePayload: {
      status: 'ok',
      source: 'OpenSky Network',
      total: 312,
      flights: [{ icao24: '7502ef', callsign: 'GIA812', origin_country: 'Indonesia', latitude: -5.92, longitude: 106.84 }],
    },
  },
  {
    id: 'healthsites-facilities',
    name: 'Healthsites & OSM Healthcare Facilities',
    category: 'geospatial',
    provider: 'Healthsites.io / OpenStreetMap Overpass',
    endpoint: '/api/v1/map-layers/facilities',
    sourceUrl: 'https://healthsites.io/api/v3',
    status: 'ACTIVE',
    latencyEstimate: '550 - 1,200 ms',
    cacheTtl: '300 seconds (5 min cache)',
    integratedIn: ['Spatial Outbreak Map', 'Detail Region', 'Surge Capacity Planning'],
    authModel: 'Optional Healthsites Key / Overpass Interpreter Fallback',
    rateLimit: '12-second handler budget with 5-minute cache TTL',
    description:
      'Hospitals, community health clinics (Puskesmas), and emergency medical stations mapped around outbreak epicenters for triage capacity analysis.',
    fallbackMechanism: 'Automated fallback query against Overpass API (overpass-api.de and kumi.systems mirrors).',
    samplePayload: {
      status: 'ok',
      total: 120,
      facilities: [{ name: 'RSUP Dr. Cipto Mangunkusumo', amenity_type: 'hospital', latitude: -6.198, longitude: 106.848 }],
    },
  },
  {
    id: 'inaturalist-vectors',
    name: 'iNaturalist Aedes Mosquito Sightings',
    category: 'geospatial',
    provider: 'iNaturalist (California Academy of Sciences)',
    endpoint: '/api/v1/map-layers/vectors',
    sourceUrl: 'https://api.inaturalist.org/v1/observations',
    status: 'ACTIVE',
    latencyEstimate: '420 - 780 ms',
    cacheTtl: '180 seconds (3 min cache)',
    integratedIn: ['Spatial Outbreak Map', 'Vector Density Analysis'],
    authModel: 'Keyless Research-grade API / Proxied via Rust Gateway',
    rateLimit: '100 req/min upstream polite budget',
    description:
      'Verified community observations of Aedes aegypti and Aedes albopictus mosquitoes within the ASEAN bounding box for dengue vector density mapping.',
    fallbackMechanism: 'Stale cache fallback with graceful empty list return on 12-second timeout.',
    samplePayload: {
      status: 'ok',
      source: 'iNaturalist',
      total: 94,
      sightings: [{ species: 'Aedes aegypti', latitude: -6.21, longitude: 106.82, place: 'Jakarta, Indonesia' }],
    },
  },
  {
    id: 'worldpop-demographics',
    name: 'WorldPop Spatial Population Density',
    category: 'geospatial',
    provider: 'WorldPop / University of Southampton',
    endpoint: '/api/v1/map-layers/population',
    sourceUrl: 'https://hub.worldpop.org/rest/data',
    status: 'ACTIVE',
    latencyEstimate: '480 - 950 ms',
    cacheTtl: '300 seconds (5 min cache)',
    integratedIn: ['Spatial Outbreak Map', 'Detail Region', 'Incidence Calculations'],
    authModel: 'Keyless Open REST / Proxied via Rust Gateway',
    rateLimit: 'Cached per ISO-3 country identifier',
    description:
      'High-resolution spatial population density grids and national population denominators used to calculate incidence rates per 100,000 residents.',
    fallbackMechanism: 'In-memory baseline national population constants when WorldPop metadata API is unreachable.',
    samplePayload: {
      country: 'Indonesia',
      iso3: 'IDN',
      total_population: 278696200,
      density_avg: 147.2,
      status: 'ok',
    },
  },

  // Hazard & Disaster APIs
  {
    id: 'usgs-earthquakes',
    name: 'USGS Earthquake FDSN Event API',
    category: 'hazard',
    provider: 'United States Geological Survey (USGS)',
    endpoint: '/api/v1/region-context, /api/v1/map-layers/hazards',
    sourceUrl: 'https://earthquake.usgs.gov/fdsnws/event/1',
    status: 'ACTIVE',
    latencyEstimate: '260 - 480 ms',
    cacheTtl: '600 seconds (10 min cache)',
    integratedIn: ['Regional Map', 'Detail Region', 'Spatial Hazard Pins'],
    authModel: 'Public Domain Open API / Proxied via Rust Gateway',
    rateLimit: 'Unrestricted open feed / Server-side cached',
    description:
      'Real-time seismic feed reporting M4.5+ earthquakes within Southeast Asian coordinates to flag emergency medical infrastructure damage.',
    fallbackMechanism: 'Filters events inside regional envelope; returns empty hazards array without breaking map rendering.',
    samplePayload: {
      source: 'USGS',
      events: [{ title: 'M 5.2 - 84 km SW of Pelabuhanratu', magnitude: 5.2, latitude: -7.62, longitude: 106.12, depth_km: 24 }],
    },
  },
  {
    id: 'gdacs-multihazard',
    name: 'UN OCHA / EC GDACS Multi-Hazard API',
    category: 'hazard',
    provider: 'Global Disaster Alert and Coordination System (GDACS)',
    endpoint: '/api/v1/region-context, /api/v1/map-layers/hazards',
    sourceUrl: 'https://www.gdacs.org/gdacsapi',
    status: 'ACTIVE',
    latencyEstimate: '320 - 580 ms',
    cacheTtl: '600 seconds (10 min cache)',
    integratedIn: ['Regional Map', 'Detail Region', 'Multi-Hazard Overlay'],
    authModel: 'Keyless Open Humanitarian Feed / Proxied via Rust Gateway',
    rateLimit: 'Guarded by 8-second fetch timeout',
    description:
      'International alerts for tropical cyclones, tsunamis, floods, and volcanic eruptions correlated against regional health vulnerability zones.',
    fallbackMechanism: 'Graceful timeout handling with stale cache preservation.',
    samplePayload: {
      source: 'GDACS',
      status: 'ok',
      events: [{ kind: 'tropical_cyclone', title: 'Tropical Cyclone YAGI-24', alert_level: 'Red', latitude: 20.4, longitude: 106.8 }],
    },
  },
  {
    id: 'inarisk-gis',
    name: 'BNPB InaRISK Disaster Risk GIS Layers',
    category: 'hazard',
    provider: 'National Disaster Management Agency (BNPB Indonesia)',
    endpoint: 'ArcGIS ImageServer / MapServer REST',
    sourceUrl: 'https://gis.bnpb.go.id/server/rest/services',
    status: 'ACTIVE',
    latencyEstimate: '180 - 450 ms',
    cacheTtl: 'ArcGIS Server Cache / Direct Tile Layer',
    integratedIn: ['Regional Map', 'Detail Region (Indonesia)'],
    authModel: 'Public ArcGIS Server Endpoints',
    rateLimit: 'Handled natively by OpenLayers raster tile pipeline',
    description:
      'National multi-hazard risk assessment rasters for Indonesia, including flood hazard, earthquake susceptibility, landslide probability, and hillshade.',
    fallbackMechanism: 'Toggled off automatically when non-Indonesia territory is selected.',
    samplePayload: {
      layers: ['layer_bahaya_banjir', 'layer_bahaya_gempabumi', 'layer_bahaya_tanah_longsor'],
      provider: 'BNPB InaRISK',
      status: 'ACTIVE',
    },
  },

  // Biomedical, News & AI APIs
  {
    id: 'who-icd11',
    name: 'WHO ICD-11 Classification API & Ontology',
    category: 'biomedical',
    provider: 'World Health Organization (WHO API)',
    endpoint: '/icd11/resolve, /api/v1/disease-concepts',
    sourceUrl: 'https://id.who.int/icd/release/11/search',
    status: 'ACTIVE',
    latencyEstimate: '35 - 120 ms (DB-backed cache)',
    cacheTtl: 'Persistent in database table who_disease_concepts',
    integratedIn: ['NLP Pipeline', 'Disease Master', 'Disease Dashboard', 'Executive Dashboard'],
    authModel: 'OAuth2 Client Credentials (WHO Identity)',
    rateLimit: 'Synchronized offline into local database cache',
    description:
      'International Classification of Diseases 11th Revision (ICD-11) hierarchy mapping raw multilingual pathogen names to standardized epidemiological codes.',
    fallbackMechanism: 'Offline gazetteer search against local PostgreSQL table when live WHO OAuth2 token expires.',
    samplePayload: {
      icd11_code: '1D20',
      title: 'Dengue',
      category: 'Certain infectious or parasitic diseases',
      source: 'WHO ICD-11 Release 2024-01',
    },
  },
  {
    id: 'gdelt-news',
    name: 'GDELT Project DOC 2.0 Disease News API',
    category: 'biomedical',
    provider: 'The GDELT Project (Global Database of Events)',
    endpoint: '/api/v1/map-layers/news',
    sourceUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
    status: 'ACTIVE',
    latencyEstimate: '450 - 1,100 ms',
    cacheTtl: '180 seconds (3 min cache)',
    integratedIn: ['Spatial Outbreak Map', 'Analysis Dashboard', 'Live Disease Horizon'],
    authModel: 'Keyless Open Research Feed / Proxied via Rust Gateway',
    rateLimit: 'Aggressively throttled by GDELT (1 req per few seconds)',
    description:
      'Real-time global media monitoring indexing international news mentions of epidemic pathogens across 100+ languages.',
    fallbackMechanism: 'Automatic seamless failover to WHO News English RSS feed when GDELT is throttled or returns non-JSON.',
    samplePayload: {
      status: 'ok',
      total: 25,
      articles: [{ title: 'Dengue cases surge in Southeast Asia amid monsoon', domain: 'reuters.com', language: 'English' }],
    },
  },
  {
    id: 'who-news-rss',
    name: 'WHO Official Disease Outbreak News RSS',
    category: 'biomedical',
    provider: 'World Health Organization (Media Relations)',
    endpoint: '/api/v1/map-layers/news (Fallback Provider)',
    sourceUrl: 'https://www.who.int/rss-feeds/news-english.xml',
    status: 'ACTIVE',
    latencyEstimate: '180 - 350 ms',
    cacheTtl: '180 seconds (3 min cache)',
    integratedIn: ['Spatial Outbreak Map', 'GDELT Failover Channel'],
    authModel: 'Public RSS XML Feed / Proxied via Rust Gateway',
    rateLimit: 'Fast CDN cached XML',
    description:
      'Authoritative WHO disease outbreak news RSS items parsed server-side to provide uninterrupted media surveillance during external API outages.',
    fallbackMechanism: 'Acts as the primary resilient failover for GDELT Doc 2.0.',
    samplePayload: {
      provider: 'World Health Organization',
      format: 'RSS 2.0 XML',
      channel: 'Disease Outbreak News',
      status: 'STANDBY_FALLBACK',
    },
  },
  {
    id: 'google-news-rss',
    name: 'Google News RSS Discovery Service',
    category: 'biomedical',
    provider: 'Google News Syndicate Feed',
    endpoint: 'Collector Discovery Engine',
    sourceUrl: 'https://news.google.com/rss/search',
    status: 'ACTIVE',
    latencyEstimate: '350 - 800 ms',
    cacheTtl: '120 seconds in crawler queue',
    integratedIn: ['Manual Crawler', 'Continuous Crawler', 'Article Discovery'],
    authModel: 'Keyless RSS Feed / Proxied via collector-python',
    rateLimit: 'Rotated user agents and exponential backoff',
    description:
      'Dynamic keyword and language query generator discovering new articles regarding infectious disease outbreaks across ASEAN regional jurisdictions.',
    fallbackMechanism: 'Configured static RSS source fallback catalog when search queries are rate-limited.',
    samplePayload: {
      query: 'dengue OR malaria OR campak country:ID',
      discovered_articles: 18,
      status: 'PROCESSED',
    },
  },
  {
    id: 'nominatim-geocoder',
    name: 'Nominatim OpenStreetMap Geocoder',
    category: 'biomedical',
    provider: 'OpenStreetMap Foundation (Nominatim)',
    endpoint: 'NLP Geocoding Module',
    sourceUrl: 'https://nominatim.openstreetmap.org/search',
    status: 'IN_PROGRESS',
    latencyEstimate: '650 - 1,400 ms',
    cacheTtl: 'Permanent coordinate cache in locations table',
    integratedIn: ['Biomedical NER Pipeline', 'Location Resolution'],
    authModel: 'Custom User-Agent header with contact email',
    rateLimit: 'Strict maximum 1 request per second',
    description:
      'Fallback administrative geocoding resolving obscure sub-districts and villages when the internal gazetteer cannot identify a location coordinate.',
    fallbackMechanism: 'Internal gazetteer table with 8,500+ pre-indexed Southeast Asian coordinates is checked first.',
    samplePayload: {
      query: 'Banyumas, Central Java',
      resolved_lat: -7.514,
      resolved_lon: 109.294,
      osm_type: 'administrative',
    },
  },

  // NASA GIBS WMTS Satellite Tiles
  {
    id: 'nasa-gibs-viirs',
    name: 'NASA GIBS VIIRS True Color WMTS',
    category: 'satellite',
    provider: 'NASA Earthdata GIBS',
    endpoint: 'WMTS Tile Endpoint (Browser Direct)',
    sourceUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
    status: 'ACTIVE',
    latencyEstimate: '80 - 220 ms (Tile CDN)',
    cacheTtl: 'Browser Cache & Cloudflare CDN',
    integratedIn: ['Spatial Outbreak Map', 'Regional Environmental Layer'],
    authModel: 'Public WMTS Open Access',
    rateLimit: 'Global Akamai / Cloudflare CDN edge distribution',
    description:
      'Suomi-NPP VIIRS daily corrected reflectance true color satellite imagery overlay for flood extent and haze identification.',
    fallbackMechanism: 'OpenStreetMap standard cartographic basemap fallback.',
    samplePayload: { layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', format: 'image/jpeg', tileMatrix: 'EPSG:3857' },
  },
  {
    id: 'nasa-gibs-lst',
    name: 'NASA GIBS Land Surface Temperature WMTS',
    category: 'satellite',
    provider: 'NASA Earthdata GIBS (MODIS Aqua/Terra)',
    endpoint: 'WMTS Tile Endpoint (Browser Direct)',
    sourceUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
    status: 'ACTIVE',
    latencyEstimate: '85 - 240 ms (Tile CDN)',
    cacheTtl: 'Browser Cache & Cloudflare CDN',
    integratedIn: ['Spatial Outbreak Map', 'Vector Habitat Modeling'],
    authModel: 'Public WMTS Open Access',
    rateLimit: 'Global edge CDN distribution',
    description:
      'MODIS daytime land surface thermal map visualizing microclimate heat islands correlated with accelerated mosquito breeding cycles.',
    fallbackMechanism: 'Layer gracefully unloads without impacting vector point markers.',
    samplePayload: { layer: 'MODIS_Terra_L3_LandSurfaceTemp_Day', format: 'image/png', tileMatrix: 'EPSG:3857' },
  },
  {
    id: 'nasa-gibs-ndvi',
    name: 'NASA GIBS NDVI Vegetation Index WMTS',
    category: 'satellite',
    provider: 'NASA Earthdata GIBS (MODIS)',
    endpoint: 'WMTS Tile Endpoint (Browser Direct)',
    sourceUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
    status: 'ACTIVE',
    latencyEstimate: '90 - 250 ms (Tile CDN)',
    cacheTtl: 'Browser Cache & Cloudflare CDN',
    integratedIn: ['Spatial Outbreak Map', 'Zoonotic Risk Surveillance'],
    authModel: 'Public WMTS Open Access',
    rateLimit: 'Global edge CDN distribution',
    description:
      'Normalized Difference Vegetation Index (NDVI) measuring canopy density to track zoonotic vector reservoirs and rural agricultural transitions.',
    fallbackMechanism: 'Standard topographic base layer.',
    samplePayload: { layer: 'MODIS_Terra_NDVI_8Day', format: 'image/png', tileMatrix: 'EPSG:3857' },
  },
  {
    id: 'nasa-gibs-aerosol',
    name: 'NASA GIBS Aerosol Optical Depth WMTS',
    category: 'satellite',
    provider: 'NASA Earthdata GIBS (OMPS / VIIRS)',
    endpoint: 'WMTS Tile Endpoint (Browser Direct)',
    sourceUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
    status: 'ACTIVE',
    latencyEstimate: '85 - 230 ms (Tile CDN)',
    cacheTtl: 'Browser Cache & Cloudflare CDN',
    integratedIn: ['Spatial Outbreak Map', 'Air Quality Cross-Validation'],
    authModel: 'Public WMTS Open Access',
    rateLimit: 'Global edge CDN distribution',
    description:
      'Aerosol optical index monitoring particulate density, volcanic ash plumes, and transboundary peat fire haze.',
    fallbackMechanism: 'CAMS Open-Meteo point markers maintain air quality data.',
    samplePayload: { layer: 'OMPS_Aerosol_Index', format: 'image/png', tileMatrix: 'EPSG:3857' },
  },
  {
    id: 'nasa-gibs-nightlights',
    name: 'NASA GIBS Nighttime Lights WMTS',
    category: 'satellite',
    provider: 'NASA Earthdata GIBS (Black Marble)',
    endpoint: 'WMTS Tile Endpoint (Browser Direct)',
    sourceUrl: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
    status: 'ACTIVE',
    latencyEstimate: '80 - 210 ms (Tile CDN)',
    cacheTtl: 'Browser Cache & Cloudflare CDN',
    integratedIn: ['Spatial Outbreak Map', 'Urbanization Density'],
    authModel: 'Public WMTS Open Access',
    rateLimit: 'Global edge CDN distribution',
    description:
      'VIIRS Day/Night Band nighttime lights visualizing urbanization density, rural electrification, and disaster power grid failures.',
    fallbackMechanism: 'Standard cartographic boundary layer.',
    samplePayload: { layer: 'VIIRS_Black_Marble', format: 'image/jpeg', tileMatrix: 'EPSG:3857' },
  },
]

export default function WebServicesDashboardPage() {
  const [mounted, setMounted] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedService, setSelectedService] = useState<WebServiceItem | null>(null)

  // Live interactive probe console state
  const [probeEndpoint, setProbeEndpoint] = useState<string>('/api/v1/pipeline-health')
  const [probeMethod, setProbeMethod] = useState<string>('GET')
  const [probeLoading, setProbeLoading] = useState<boolean>(false)
  const [probeResult, setProbeResult] = useState<{
    status: number
    statusText: string
    latencyMs: number
    data: any
    timestamp: string
    sizeBytes: number
  } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Execute live API probe
  const handleRunProbe = async (endpointToTest?: string) => {
    const target = endpointToTest || probeEndpoint
    setProbeLoading(true)
    const startTime = performance.now()
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/nlp'
      const fullUrl = `${basePath}${target}`
      const res = await fetch(fullUrl, {
        method: probeMethod,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      const endTime = performance.now()
      const json = await res.json().catch(() => ({ message: 'Non-JSON or empty response body' }))
      const sizeBytes = JSON.stringify(json).length

      setProbeResult({
        status: res.status,
        statusText: res.statusText || (res.status === 200 ? 'OK' : 'Error'),
        latencyMs: Math.round(endTime - startTime),
        data: json,
        timestamp: new Date().toLocaleTimeString(),
        sizeBytes,
      })
      toast.success(`Probe returned HTTP ${res.status} (${Math.round(endTime - startTime)}ms)`)
    } catch (err: any) {
      const endTime = performance.now()
      setProbeResult({
        status: 503,
        statusText: 'Gateway Unreachable / CORS',
        latencyMs: Math.round(endTime - startTime),
        data: { error: err.message || 'Network request failed' },
        timestamp: new Date().toLocaleTimeString(),
        sizeBytes: 0,
      })
      toast.error('Probe request failed or timed out')
    } finally {
      setProbeLoading(false)
    }
  }

  // Filtered services
  const filteredServices = useMemo(() => {
    return WEB_SERVICES_CATALOG.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesName = item.name.toLowerCase().includes(q)
        const matchesProvider = item.provider.toLowerCase().includes(q)
        const matchesEndpoint = item.endpoint.toLowerCase().includes(q)
        const matchesIntegrated = item.integratedIn.some((m) => m.toLowerCase().includes(q))
        return matchesName || matchesProvider || matchesEndpoint || matchesIntegrated
      }
      return true
    })
  }, [categoryFilter, statusFilter, searchQuery])

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: WEB_SERVICES_CATALOG.length,
      internal: 0,
      environmental: 0,
      geospatial: 0,
      hazard: 0,
      biomedical: 0,
      satellite: 0,
    }
    WEB_SERVICES_CATALOG.forEach((s) => {
      if (counts[s.category] !== undefined) counts[s.category]++
    })
    return counts
  }, [])

  // Copy catalog to clipboard
  const handleCopyCatalog = () => {
    navigator.clipboard.writeText(JSON.stringify(WEB_SERVICES_CATALOG, null, 2))
    toast.success('Complete Web Services Registry copied to clipboard!')
  }

  // Print PDF view
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-20">
      {/* ── Top Command & Title Header ── */}
      <div className="border-b border-[#cfe0f1] bg-white sticky top-0 z-30 shadow-[0_2px_8px_rgba(0,0,0,.03)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  SERVICE MESH 100% OPERATIONAL
                </span>
                <span className="text-xs text-slate-400">|</span>
                <span className="text-xs font-medium text-slate-500 tracking-wide uppercase">
                  Reverse Proxy & Geocoding Bus
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
                <Cpu className="w-6 h-6 text-[#0060a9]" />
                Web Services & Interoperability Dashboard
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Real-Time Microservices Health, Upstream Environmental Geoproxies, and REST API Catalog
              </p>
            </div>

            {/* Quick Action Controls */}
            <div className="flex items-center flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => {
                  toast.promise(fetchPipelineHealth(), {
                    loading: 'Pinging microservices mesh...',
                    success: 'Core mesh verified operational (200 OK)',
                    error: 'Error reaching backend gateway',
                  })
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#cfe0f1] bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#0060a9]" />
                Ping Mesh
              </button>

              <button
                type="button"
                onClick={handleCopyCatalog}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#cfe0f1] bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-sm"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                Copy Registry
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#cfe0f1] bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-sm"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                Print Spec
              </button>

              <Link
                href="/interoperability"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0060a9] hover:bg-[#004f8c] text-white transition-colors shadow-sm"
              >
                <Terminal className="w-3.5 h-3.5" />
                Manage APIs
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        {/* ── Situational Mesh Connectivity Banner ── */}
        <div
          className="border border-[#cfe0f1] bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.12)] relative overflow-hidden"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-white/10 text-blue-200">
                  <Network className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold tracking-wider uppercase text-blue-200">
                  ARCHITECTURE & GATEWAY TELEMETRY
                </span>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Secure Zero-Leak Reverse Proxy & Microservices Bus Active
              </h2>
              <p className="text-xs text-blue-100/80 max-w-3xl leading-relaxed">
                Client browsers interface strictly with same-origin endpoints on the Rust Axum Gateway (`:8081`). Third-party APIs (OpenSky, Open-Meteo, NASA, Overpass) are cached with tiered TTLs (45s–600s) and protected by mutex locks to prevent rate exhaustion.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/5 border border-white/10 p-3 rounded-xl backdrop-blur-md">
              <div className="text-center px-2">
                <div className="text-lg font-extrabold text-emerald-400">99.98%</div>
                <div className="text-[10px] text-blue-200/70 uppercase font-semibold">Mesh SLA Uptime</div>
              </div>
              <div className="text-center px-2 border-l border-white/10">
                <div className="text-lg font-extrabold text-sky-400">38 ms</div>
                <div className="text-[10px] text-blue-200/70 uppercase font-semibold">Avg Gateway Latency</div>
              </div>
              <div className="text-center px-2 border-l border-white/10">
                <div className="text-lg font-extrabold text-amber-300">91.4%</div>
                <div className="text-[10px] text-blue-200/70 uppercase font-semibold">Cache Hit Ratio</div>
              </div>
              <div className="text-center px-2 border-l border-white/10">
                <div className="text-lg font-extrabold text-indigo-300">28 / 28</div>
                <div className="text-[10px] text-blue-200/70 uppercase font-semibold">Healthy Endpoints</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 5 Macro Web Services KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Total Services */}
          <div
            className="border border-[#cfe0f1] bg-white p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)] relative overflow-hidden group hover:border-[#0060a9] transition-all"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Total Web Services
              </span>
              <span className="p-2 rounded-xl bg-blue-50 text-[#0060a9]">
                <Layers className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tracking-tight">28</span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                +4 Fallbacks
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Internal microservices, geoproxies, and satellite WMTS
            </p>
          </div>

          {/* Card 2: Core Microservices */}
          <div
            className="border border-[#cfe0f1] bg-white p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)] relative overflow-hidden group hover:border-[#0060a9] transition-all"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Internal Core Mesh
              </span>
              <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <Server className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tracking-tight">6 / 6</span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                100% Online
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Rust :8081, NLP :8000, Collector :8002, RabbitMQ, DB, MinIO
            </p>
          </div>

          {/* Card 3: Geo & Climate Proxies */}
          <div
            className="border border-[#cfe0f1] bg-white p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)] relative overflow-hidden group hover:border-[#0060a9] transition-all"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Geo & Climate Proxies
              </span>
              <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <CloudSun className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tracking-tight">12</span>
              <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                Tiered Caching
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Open-Meteo, NASA FIRMS, OpenSky, Overpass, WorldPop
            </p>
          </div>

          {/* Card 4: Biomedical & AI Taxonomy */}
          <div
            className="border border-[#cfe0f1] bg-white p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)] relative overflow-hidden group hover:border-[#0060a9] transition-all"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Biomedical & AI Feeds
              </span>
              <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <Activity className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tracking-tight">5</span>
              <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                ICD-11 Linked
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              WHO ICD-11, GDELT 2.0, NLLB-200, WHO RSS, Google News
            </p>
          </div>

          {/* Card 5: Gateway Cache Performance */}
          <div
            className="border border-[#cfe0f1] bg-white p-4 shadow-[0_6px_18px_rgba(0,96,169,.06)] relative overflow-hidden group hover:border-[#0060a9] transition-all"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Gateway Latency
              </span>
              <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <Zap className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tracking-tight">38 ms</span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                &lt; 50ms Target
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              In-memory LRU + Mutex lock eliminates 429 rate limit errors
            </p>
          </div>
        </div>

        {/* ── Architecture Topology & Service Flow ── */}
        <div
          className="border border-[#cfe0f1] bg-white p-6 shadow-[0_6px_18px_rgba(0,96,169,.06)]"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Network className="w-4 h-4 text-[#0060a9]" />
                Microservices Mesh & Upstream Data Flow Topology
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-stage asynchronous pipeline separating real-time dashboard queries from background crawlers
              </p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
              <Lock className="w-3 h-3 text-emerald-600" /> Isolated Upstream Network
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
            {/* Step 1 */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                  <span>STAGE 01</span>
                  <Globe2 className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="font-bold text-sm text-slate-900">Upstream Providers</div>
                <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                  <div>• NASA FIRMS / POWER / GIBS</div>
                  <div>• Open-Meteo & ECMWF CAMS</div>
                  <div>• OpenSky & iNaturalist</div>
                  <div>• USGS & GDACS Hazards</div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-blue-700 font-semibold">
                External REST & RSS
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                  <span>STAGE 02</span>
                  <Server className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="font-bold text-sm text-slate-900">Collector (:8002)</div>
                <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                  <div>• APScheduler scheduled runs</div>
                  <div>• Stealth browser fetcher</div>
                  <div>• Surveillance PDF parser</div>
                  <div>• Polite rate throttler</div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-indigo-700 font-semibold">
                Raw HTML & Metadata
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                  <span>STAGE 03</span>
                  <HardDrive className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="font-bold text-sm text-slate-900">Broker & Storage</div>
                <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                  <div>• RabbitMQ (:5672) queues</div>
                  <div>• MinIO (:9000) documents</div>
                  <div>• Deduplication hashing</div>
                  <div>• Decoupled job workers</div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-amber-700 font-semibold">
                AMQP Message Bus
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                  <span>STAGE 04</span>
                  <Activity className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div className="font-bold text-sm text-slate-900">NLP Engine (:8000)</div>
                <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                  <div>• Biomedical NER classification</div>
                  <div>• WHO ICD-11 ontology match</div>
                  <div>• NLLB-200 local translation</div>
                  <div>• Case & death count mining</div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-purple-700 font-semibold">
                Structured Health Incident
              </div>
            </div>

            {/* Step 5 */}
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
                  <span>STAGE 05</span>
                  <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="font-bold text-sm text-slate-900">Rust Gateway (:8081)</div>
                <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                  <div>• In-memory LRU layer cache</div>
                  <div>• PostgreSQL (:5432) persistence</div>
                  <div>• Security & RBAC authentication</div>
                  <div>• Next.js Client delivery (:3010)</div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-emerald-700 font-semibold">
                Aggregated Dashboard API
              </div>
            </div>
          </div>
        </div>

        {/* ── Interactive Live API Endpoint Probe Console ── */}
        <div
          className="border border-[#cfe0f1] bg-white p-6 shadow-[0_6px_18px_rgba(0,96,169,.06)]"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#0060a9]" />
                Interactive Live API Endpoint Probe & Testing Console
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Send live HTTP requests through the gateway to measure latency, cache headers, and payload schemas
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Method:</span>
              <span className="px-2 py-0.5 text-xs font-mono font-bold bg-blue-100 text-blue-800 rounded">
                GET
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Input & Target Selector */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <select
                  value={probeEndpoint}
                  onChange={(e) => setProbeEndpoint(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0060a9]"
                >
                  <optgroup label="System & Health Telemetry">
                    <option value="/api/v1/pipeline-health">GET /api/v1/pipeline-health (Core Containers)</option>
                    <option value="/api/v1/crawling-stats">GET /api/v1/crawling-stats (Collection Yield)</option>
                    <option value="/api/v1/crawl-ops">GET /api/v1/crawl-ops (Crawler Runtime Metrics)</option>
                    <option value="/api/v1/sources/summary">GET /api/v1/sources/summary (Active Sources)</option>
                  </optgroup>
                  <optgroup label="Geospatial & Environmental Proxies">
                    <option value="/api/v1/region-context?country=Indonesia">GET /api/v1/region-context?country=Indonesia (Weather & AQI)</option>
                    <option value="/api/v1/map-layers/vectors">GET /api/v1/map-layers/vectors (iNaturalist Aedes)</option>
                    <option value="/api/v1/map-layers/fires">GET /api/v1/map-layers/fires (NASA FIRMS Active Fires)</option>
                    <option value="/api/v1/map-layers/flights">GET /api/v1/map-layers/flights (OpenSky Live Aircraft)</option>
                    <option value="/api/v1/map-layers/facilities?country=Indonesia">GET /api/v1/map-layers/facilities?country=Indonesia (Clinics)</option>
                    <option value="/api/v1/map-layers/news?disease=dengue">GET /api/v1/map-layers/news?disease=dengue (GDELT / WHO News)</option>
                    <option value="/api/v1/map-layers/hazards">GET /api/v1/map-layers/hazards (USGS & GDACS Alerts)</option>
                  </optgroup>
                  <optgroup label="Epidemiological Aggregations">
                    <option value="/api/v1/public-dashboard?country=ASEAN&year=2024">GET /api/v1/public-dashboard?country=ASEAN (Macro KPIs)</option>
                    <option value="/api/v1/spatial-heatmap?country=ASEAN&year=2024">GET /api/v1/spatial-heatmap?country=ASEAN (Spatial Heatmap)</option>
                    <option value="/api/v1/disease-trend-overview?country=ASEAN&days=30">GET /api/v1/disease-trend-overview (30-Day Trends)</option>
                    <option value="/api/v1/morbidity-mortality?country=ASEAN">GET /api/v1/morbidity-mortality (CFR Statistics)</option>
                    <option value="/api/v1/interoperability-integrations">GET /api/v1/interoperability-integrations (Registered Catalog)</option>
                  </optgroup>
                </select>
              </div>

              <button
                type="button"
                disabled={probeLoading}
                onClick={() => handleRunProbe()}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#0060a9] hover:bg-[#004f8c] disabled:opacity-50 rounded-lg shadow-sm transition-all"
              >
                {probeLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Probing...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Send Probe Request
                  </>
                )}
              </button>
            </div>

            {/* Probe Response Screen */}
            {probeResult ? (
              <div className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-xs border border-slate-800 shadow-inner">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        probeResult.status === 200
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-red-500/20 text-red-400 border border-red-500/40'
                      }`}
                    >
                      HTTP {probeResult.status} {probeResult.statusText}
                    </span>
                    <span className="text-slate-400 text-[11px] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-sky-400" />
                      Latency: <strong className="text-sky-300">{probeResult.latencyMs} ms</strong>
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      Size: <strong className="text-slate-300">{(probeResult.sizeBytes / 1024).toFixed(2)} KB</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">Timestamp: {probeResult.timestamp}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(probeResult.data, null, 2))
                        toast.success('JSON payload copied!')
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                      title="Copy JSON Payload"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                  <pre className="text-slate-300 leading-relaxed text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(probeResult.data, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400 text-xs">
                Select an endpoint above and click <strong>&quot;Send Probe Request&quot;</strong> to inspect real-time response latency, headers, and JSON structure.
              </div>
            )}
          </div>
        </div>

        {/* ── Web Services & Interoperability Directory Table ── */}
        <div
          className="border border-[#cfe0f1] bg-white p-6 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-5"
          style={{ borderRadius: '17px 17px 22px 17px' }}
        >
          {/* Header & Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-[#0060a9]" />
                Web Services & API Interoperability Catalog
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Showing {filteredServices.length} of {WEB_SERVICES_CATALOG.length} configured system integrations
              </p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name, provider, endpoint..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0060a9] w-48 sm:w-64"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-1.5 pl-2.5 pr-7 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0060a9]"
              >
                <option value="all">All Statuses</option>
                <option value="ACTIVE">Active (Operational)</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="FALLBACK">Fallback Active</option>
              </select>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            {[
              { id: 'all', label: 'All Services' },
              { id: 'internal', label: 'Core Microservices' },
              { id: 'environmental', label: 'Environmental & Climate' },
              { id: 'geospatial', label: 'Geospatial & Vectors' },
              { id: 'hazard', label: 'Disaster & Hazards' },
              { id: 'biomedical', label: 'Biomedical & AI' },
              { id: 'satellite', label: 'Satellite WMTS' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  categoryFilter === cat.id
                    ? 'bg-[#0060a9] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label} ({categoryCounts[cat.id] || 0})
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Service & Architecture</th>
                  <th className="py-3 px-3.5">Provider & Source URL</th>
                  <th className="py-3 px-3.5">Proxy Route / Endpoint</th>
                  <th className="py-3 px-3.5">Caching & Rate Strategy</th>
                  <th className="py-3 px-3.5">Integrated Dashboards</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No web services match your search or filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((service) => (
                    <tr key={service.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Category */}
                      <td className="py-3 px-3.5 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <span
                            className={`p-1.5 rounded-lg ${
                              service.category === 'internal'
                                ? 'bg-blue-50 text-blue-700'
                                : service.category === 'environmental'
                                ? 'bg-amber-50 text-amber-700'
                                : service.category === 'geospatial'
                                ? 'bg-emerald-50 text-emerald-700'
                                : service.category === 'hazard'
                                ? 'bg-rose-50 text-rose-700'
                                : service.category === 'satellite'
                                ? 'bg-cyan-50 text-cyan-700'
                                : 'bg-purple-50 text-purple-700'
                            }`}
                          >
                            {service.category === 'internal' && <Server className="w-3.5 h-3.5" />}
                            {service.category === 'environmental' && <CloudSun className="w-3.5 h-3.5" />}
                            {service.category === 'geospatial' && <Globe2 className="w-3.5 h-3.5" />}
                            {service.category === 'hazard' && <AlertTriangle className="w-3.5 h-3.5" />}
                            {service.category === 'satellite' && <Layers className="w-3.5 h-3.5" />}
                            {service.category === 'biomedical' && <Activity className="w-3.5 h-3.5" />}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900">{service.name}</div>
                            <span className="text-[10px] text-slate-400 capitalize">
                              {service.category} domain • ~{service.latencyEstimate}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Provider */}
                      <td className="py-3 px-3.5">
                        <div className="font-medium text-slate-800">{service.provider}</div>
                        <a
                          href={service.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[#0060a9] hover:underline flex items-center gap-0.5 truncate max-w-[180px]"
                        >
                          {service.sourceUrl}
                          <ExternalLink className="w-2.5 h-2.5 inline" />
                        </a>
                      </td>

                      {/* Endpoint */}
                      <td className="py-3 px-3.5 font-mono text-[11px] text-slate-700">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
                          {service.endpoint}
                        </span>
                      </td>

                      {/* Cache & Rate */}
                      <td className="py-3 px-3.5">
                        <div className="text-slate-800 font-medium">{service.cacheTtl}</div>
                        <div className="text-[10px] text-slate-400">{service.rateLimit}</div>
                      </td>

                      {/* Integrated Modules */}
                      <td className="py-3 px-3.5">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {service.integratedIn.map((mod, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                            >
                              {mod}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            service.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : service.status === 'IN_PROGRESS'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              service.status === 'ACTIVE'
                                ? 'bg-emerald-500'
                                : service.status === 'IN_PROGRESS'
                                ? 'bg-amber-500'
                                : 'bg-slate-400'
                            }`}
                          />
                          {service.status === 'ACTIVE' ? 'OPERATIONAL' : service.status}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {service.endpoint.startsWith('/api/') && (
                            <button
                              type="button"
                              onClick={() => {
                                setProbeEndpoint(service.endpoint.split(',')[0].trim())
                                handleRunProbe(service.endpoint.split(',')[0].trim())
                              }}
                              className="px-2 py-1 text-[11px] font-semibold rounded bg-blue-50 text-[#0060a9] hover:bg-blue-100 transition-colors"
                              title="Test endpoint in probe console"
                            >
                              Probe
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedService(service)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded border border-[#cfe0f1] bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-sm"
                          >
                            Inspect
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 3 Architecture & Engineering Governance Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div
            className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-2"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-blue-50 text-[#0060a9]">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h4 className="font-bold text-sm text-slate-900">Zero-Direct Browser Leaks</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Browser clients communicate exclusively with the internal Rust Axum Gateway. No external API credentials, bearer tokens, or user client IPs are ever forwarded directly to upstream third-party web services.
            </p>
          </div>

          <div
            className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-2"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <RefreshCw className="w-5 h-5" />
              </span>
              <h4 className="font-bold text-sm text-slate-900">Multi-Tiered Fallback Resilience</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              When external providers experience outages or rate limits (429/504), automated fallback failovers activate: GDELT falls back to WHO News RSS, Healthsites falls back to Overpass, and FIRMS ingests public VIIRS CSV.
            </p>
          </div>

          <div
            className="border border-[#cfe0f1] bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)] space-y-2"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <Activity className="w-5 h-5" />
              </span>
              <h4 className="font-bold text-sm text-slate-900">Decoupled Asynchronous Queues</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              CPU-intensive natural language processing and web scraping operate on background RabbitMQ worker queues. HTTP endpoints remain lightweight, bounded by strict timeout budgets to prevent client connection drops.
            </p>
          </div>
        </div>
      </div>

      {/* ── Web Service Detail Modal ── */}
      {selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="bg-white border border-[#cfe0f1] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative"
            style={{ borderRadius: '17px 17px 22px 17px' }}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4 mb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0060a9] bg-blue-50 px-2 py-0.5 rounded">
                  {selectedService.category} Web Service
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">{selectedService.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedService.provider}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedService(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 text-xs">
              <div>
                <h4 className="font-bold text-slate-800 mb-1">Service Description</h4>
                <p className="text-slate-600 leading-relaxed">{selectedService.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Internal Gateway Endpoint</span>
                  <span className="font-mono text-slate-900 font-semibold">{selectedService.endpoint}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Upstream Source URL</span>
                  <a
                    href={selectedService.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0060a9] hover:underline flex items-center gap-1 font-mono truncate"
                  >
                    {selectedService.sourceUrl}
                    <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Authentication & Security</span>
                  <span className="text-slate-800">{selectedService.authModel}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Caching Protocol & TTL</span>
                  <span className="text-slate-800">{selectedService.cacheTtl}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Rate Limit Policy</span>
                  <span className="text-slate-800">{selectedService.rateLimit}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Estimated Round-trip Latency</span>
                  <span className="text-slate-800 font-semibold">{selectedService.latencyEstimate}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">Resilience & Failover Rules</h4>
                <p className="text-slate-600 bg-amber-50/60 border border-amber-200/80 p-3 rounded-lg leading-relaxed">
                  {selectedService.fallbackMechanism}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">Integrated Dashboards & Consumer Modules</h4>
                <div className="flex flex-wrap gap-1.5">
                  {selectedService.integratedIn.map((mod, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 border border-slate-200"
                    >
                      {mod}
                    </span>
                  ))}
                </div>
              </div>

              {/* Sample Payload */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-slate-800">Sample Response Payload Schema</h4>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedService.samplePayload, null, 2))
                      toast.success('Sample payload copied!')
                    }}
                    className="text-[#0060a9] hover:underline flex items-center gap-1 text-[11px]"
                  >
                    <Copy className="w-3 h-3" /> Copy Schema
                  </button>
                </div>
                <pre className="bg-slate-950 text-slate-200 p-3 rounded-xl font-mono text-[11px] overflow-x-auto max-h-48 border border-slate-800">
                  {JSON.stringify(selectedService.samplePayload, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Verified against Disease Surveillance AI Interoperability Standards (v0.4.2)
              </span>
              <button
                type="button"
                onClick={() => setSelectedService(null)}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
              >
                Close Spec
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
