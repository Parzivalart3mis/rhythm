import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const isDev = process.env.NODE_ENV === "development";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: isDev,
  reloadOnOnline: true,
});

// Content Security Policy. Clerk needs its script/frame/connect hosts; Upstash/Neon
// are server-side only so they don't need CSP allowances.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com`,
  `font-src 'self' data:`,
  `connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com wss://*.clerk.com`,
  `frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  isDev ? "" : "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withSerwist(nextConfig);
