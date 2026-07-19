import { withSentryConfig } from "@sentry/nextjs";

// F-19: security response headers.
//
// Content-Security-Policy is shipped in REPORT-ONLY mode first (per the audit):
// it reports what a strict policy would block — to /api/csp-report — without
// breaking anything, so we can tighten it toward enforcement from real data.
// Everything else below is enforced immediately (no behavioral risk).
//
// Sources reflect what the app actually loads: Google Maps JS (maps.googleapis
// .com) and the Maps embed iframe (www.google.com); org logos/banners come from
// arbitrary https hosts + Cloudinary/Unsplash (img-src https:); Sentry client
// telemetry posts to *.sentry.io. 'unsafe-inline' scripts are required by Next's
// hydration bootstrap and the ld+json block until we move to per-request nonces.
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://maps.googleapis.com https://*.googleapis.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
  "frame-src 'self' https://www.google.com https://maps.google.com",
  "report-uri /api/csp-report",
].join("; ");

const securityHeaders = [
  // Force HTTPS for two years. No `preload` (that's a deliberate, hard-to-undo
  // submission); includeSubDomains is safe — no *.yourevents.app is served over
  // plain HTTP.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Clickjacking: no other origin may frame our pages (we embed Google Maps,
  // but that's us framing them — this header governs the other direction).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Least-privilege for powerful features. camera=(self) is REQUIRED — the
  // check-in scanner (CheckinScanner.tsx) uses getUserMedia/BarcodeDetector.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(self), browsing-topics=()" },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // F-21: don't advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Type-checking (tsc --noEmit) and ESLint already run in CI (GitHub Actions:
  // .github/workflows/ci.yml) and locally before every deploy. Re-running them
  // inside the production Docker build just duplicates that work and adds
  // ~1–2 min to each deploy, so skip them here. (Compile errors still fail the
  // build — only the separate type/lint passes are skipped.)
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    // The CDNs actually used for banners/avatars. (next/image isn't used yet,
    // but keep these accurate so a future switch doesn't break image loading.)
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
    // Required in Next 14 so src/instrumentation.ts runs (Sentry server init).
    instrumentationHook: true,
  },
};

export default withSentryConfig(nextConfig, {
  // Quiet build output; source-map upload is skipped without SENTRY_AUTH_TOKEN.
  silent: true,
  // Tree-shake Sentry's logger statements out of the bundle.
  disableLogger: true,
  // No SENTRY_AUTH_TOKEN is configured, so source maps are never uploaded —
  // generating them just adds build time (prod stack traces were minified
  // either way). To get readable stack traces in Sentry later, add the auth
  // token and remove this line.
  sourcemaps: { disable: true },
});
