/** @type {import('next').NextConfig} */
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
  "script-src-elem 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.arcgisonline.com https://gis.bnpb.go.id https://*.tile.opentopomap.org https://flagcdn.com https://*.tile.stamen.com https://*.stadiamaps.com https://purecatamphetamine.github.io https://gibs.earthdata.nasa.gov https://*.earthdata.nasa.gov https://*.inaturalist.org https://static.inaturalist.org https://inaturalist-open-data.s3.amazonaws.com",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.arcgisonline.com https://gis.bnpb.go.id https://*.tile.opentopomap.org https://cloudflareinsights.com https://*.cloudflareinsights.com https://static.cloudflareinsights.com https://sipkk-new.mediaciptainformasi.co.id https://opsroom.sipongidata.my.id https://router.project-osrm.org https://api.open-meteo.com https://air-quality-api.open-meteo.com https://nominatim.openstreetmap.org https://gibs.earthdata.nasa.gov https://*.earthdata.nasa.gov",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' https://lookerstudio.google.com https://datastudio.google.com",
  "frame-ancestors 'self'",
].join('; ');

const nextConfig = {
  output: 'standalone',
  basePath: '/nlp',
  // Keep /api rewrites from waiting past reverse-proxy 504 budgets when the
  // collector or NLP stage hangs. Interactive URL jobs are async; 60s is only
  // a safety cap for job creation and status reads.
  experimental: {
    proxyTimeout: 60_000,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspDirectives,
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/reports/:slug.pdf',
        destination: '/reports/:slug/print',
      },
      {
        source: '/api/v1/assets/:path*',
        destination: 'http://disease-collector-python:8002/assets/:path*',
      },
      {
        source: '/api/v1/console/upload',
        destination: 'http://disease-collector-python:8002/upload-asset',
      },
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_INTERNAL_URL || 'http://disease-backend-rust:8081'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
