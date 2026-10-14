const API = process.env.API_URL ?? 'http://localhost:5002';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@checkout/core', '@checkout/shared'],
  // Our packages use ESM ".js" import paths for ".ts" files (TypeScript NodeNext style).
  webpack(cfg) {
    cfg.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return cfg;
  },
  // Same origin for the browser: login cookies stay first-party, the preview iframe is ours.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      { source: '/storefront/:path*', destination: `${API}/storefront/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
export default config;
