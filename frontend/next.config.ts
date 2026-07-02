import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API calls to Odoo to avoid CORS issues
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8069/:path*',
      },
    ];
  },
};

export default nextConfig;
