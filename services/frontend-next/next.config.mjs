/** @type {import('next').NextConfig} */
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.arcgisonline.com https://*.tile.opentopomap.org https://flagcdn.com https://*.tile.stamen.com https://*.stadiamaps.com https://purecatamphetamine.github.io",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.arcgisonline.com https://*.tile.opentopomap.org https://cloudflareinsights.com https://static.cloudflareinsights.com",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-ancestors 'self'",
].join('; ');

const nextConfig = {
  output: 'standalone',
  basePath: '/nlp',
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
