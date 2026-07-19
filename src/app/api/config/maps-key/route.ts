import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Runtime fallback for the Google Maps key. NEXT_PUBLIC_* env vars are inlined
 * at build time, so adding the variable AFTER a build doesn't help until the
 * code re-builds. This endpoint reads the key at REQUEST time from any of the
 * names we currently accept, so address autocomplete can come online the
 * moment the var is set on Railway — no rebuild required.
 *
 * Exposing the key through a public endpoint is no different from inlining it
 * into the JS bundle (which is exactly what NEXT_PUBLIC_ does anyway) — a Maps
 * browser key is never a secret. Its ONLY protection is Google Cloud key
 * restrictions (HTTP referrer + API allow-list). F-14 (2026-07-19) VERIFIED the
 * production key was NOT referrer-restricted (usable from an unrelated origin),
 * so those restrictions MUST be set in the Cloud Console — see the Google Maps
 * section of .env.example for the exact referrers/APIs to configure.
 */
export async function GET() {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
    null;

  return NextResponse.json(
    { key },
    {
      // Cache for a minute on the edge — the key is stable across requests and
      // we don't want to hammer the API route on every page load. Vary by
      // nothing since the response is identical for all callers.
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    }
  );
}
