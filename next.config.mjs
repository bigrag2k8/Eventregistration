import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
