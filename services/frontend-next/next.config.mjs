/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/nlp',
  images: {
    unoptimized: true,
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
