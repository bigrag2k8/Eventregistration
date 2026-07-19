import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Collector for Content-Security-Policy-Report-Only violations (F-19).
 *
 * CSP ships in report-only mode first, so browsers POST a violation report here
 * describing what a strict policy WOULD have blocked. We log a compact line to
 * the server logs so we can tighten the policy toward enforcement from real
 * data. Always answers 204 and never throws — a malformed/junk report must not
 * error. Per-IP throttled so this open endpoint can't be used to flood logs.
 */
export async function POST(req: Request) {
  try {
    const gate = await rateLimit(`csp-report:${clientIp(req)}`, 20, 60, { failOpen: true });
    if (!gate.allowed) return new NextResponse(null, { status: 204 });

    const body: any = await req.json().catch(() => null);
    // Chrome sends { "csp-report": {...} }; the Reporting API sends an array of
    // { body: {...} }. Normalize both to the interesting fields.
    const r = body?.["csp-report"] ?? (Array.isArray(body) ? body[0]?.body : body?.body) ?? body;
    if (r) {
      console.warn(
        "[csp-report]",
        JSON.stringify({
          documentUri: r["document-uri"] ?? r.documentURL ?? null,
          violatedDirective: r["violated-directive"] ?? r.effectiveDirective ?? null,
          blockedUri: r["blocked-uri"] ?? r.blockedURL ?? null,
        }),
      );
    }
  } catch {
    // never let a bad report surface as an error
  }
  return new NextResponse(null, { status: 204 });
}
