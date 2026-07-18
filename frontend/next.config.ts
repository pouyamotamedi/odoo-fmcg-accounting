import type { NextConfig } from "next";

const ODOO_INTERNAL_URL = process.env.ODOO_INTERNAL_URL || 'http://localhost:8069';

const nextConfig: NextConfig = {
  // Proxy API calls to Odoo to avoid CORS issues
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${ODOO_INTERNAL_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
