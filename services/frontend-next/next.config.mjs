/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://backend-rust:8081/api/:path*',
      },
    ];
  },
};

export default nextConfig;
