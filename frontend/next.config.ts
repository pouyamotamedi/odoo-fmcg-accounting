import type { NextConfig } from "next";

const ODOO_INTERNAL_URL = process.env.ODOO_INTERNAL_URL || 'http://localhost:8069';

const nextConfig: NextConfig = {
  // Increase body size limit for file uploads (backup restore)
  serverExternalPackages: [],
  
  // Proxy API calls to Odoo to avoid CORS issues
  // EXCEPT /api/system/* which are our own Next.js API routes
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        {
          source: '/api/system/:path*',
          destination: '/api/system/:path*', // Keep as-is (Next.js API route)
        },
      ],
      fallback: [
        {
          source: '/api/:path*',
          destination: `${ODOO_INTERNAL_URL}/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
