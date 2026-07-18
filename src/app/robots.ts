import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Everything a crawler has no business indexing: the whole app behind
      // auth, API routes, one-time token pages, and account flows.
      disallow: ["/dashboard", "/admin", "/api", "/account", "/checkin", "/review", "/signin", "/reset-password", "/qr"],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
