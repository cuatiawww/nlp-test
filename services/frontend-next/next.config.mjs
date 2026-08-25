/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/nlp',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_INTERNAL_URL || 'http://backend-rust:8081'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
