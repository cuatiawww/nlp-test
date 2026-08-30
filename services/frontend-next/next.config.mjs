/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Disable font optimization so build doesn't need Google Fonts network access.
  optimizeFonts: false,
  basePath: '/nlp',
  // Static branding assets are already optimized PNG files. Serving them
  // directly also avoids reverse-proxy issues with /nlp/_next/image.
  images: {
    unoptimized: true,
  },
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
