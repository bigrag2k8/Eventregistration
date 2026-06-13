import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
});
