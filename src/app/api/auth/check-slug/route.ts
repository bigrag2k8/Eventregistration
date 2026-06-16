import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Live slug availability check for the signup form.
 *
 * Returns:
 *   { valid: false, reason: "too_short" | "bad_chars" | "reserved" | "taken" }
 *   { valid: true,  available: true }
 *   { valid: true,  available: false, suggestions: [...] }
 *
 * Cheap to call: hits Redis rate limiter then a single Prisma findUnique.
 * Suggestions are only computed when the requested slug is taken or reserved.
 */

const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "checkin", "dashboard", "events",
  "o", "vendor", "vendors", "signin", "signup", "signout", "static",
  "_next", "favicon.ico", "robots.txt", "sitemap.xml", "invite",
  "settings", "billing", "team", "audit", "support", "help", "about",
  "pricing", "legal", "privacy", "terms", "www",
]);

function isValidSlug(s: string): { ok: boolean; reason?: string } {
  if (!s || s.length < 2) return { ok: false, reason: "too_short" };
  if (s.length > 60) return { ok: false, reason: "too_long" };
  if (!/^[a-z0-9-]+$/.test(s)) return { ok: false, reason: "bad_chars" };
  if (s.startsWith("-") || s.endsWith("-")) return { ok: false, reason: "bad_chars" };
  if (RESERVED_SLUGS.has(s)) return { ok: false, reason: "reserved" };
  return { ok: true };
}

async function suggestions(base: string, max = 3): Promise<string[]> {
  // Generate candidate slugs that aren't taken AND aren't reserved.
  const year = new Date().getFullYear();
  const candidates = [
    `${base}-events`,
    `${base}-${year}`,
    `${base}-hq`,
    `${base}-team`,
    `${base}-2`,
    `${base}-3`,
    `hello-${base}`,
    `${base}-online`,
  ];
  const out: string[] = [];
  for (const c of candidates) {
    if (out.length >= max) break;
    if (RESERVED_SLUGS.has(c)) continue;
    if (!/^[a-z0-9-]+$/.test(c)) continue;
    const taken = await prisma.organization.findUnique({ where: { slug: c }, select: { id: true } });
    if (!taken) out.push(c);
  }
  return out;
}

export async function GET(req: Request) {
  const ip = clientIp(req);
  // 60 checks per minute per IP — generous so typing isn't blocked, but stops abuse.
  const rl = await rateLimit(`slugcheck:${ip}`, 60, 60);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const url = new URL(req.url);
  const raw = (url.searchParams.get("slug") ?? "").trim().toLowerCase();

  const validity = isValidSlug(raw);
  if (!validity.ok) {
    return NextResponse.json({
      valid: false,
      reason: validity.reason,
      // Still offer suggestions for the "reserved" case so the user has options.
      suggestions: validity.reason === "reserved" ? await suggestions(raw) : [],
    });
  }

  const taken = await prisma.organization.findUnique({
    where: { slug: raw },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json({
      valid: true,
      available: false,
      reason: "taken",
      suggestions: await suggestions(raw),
    });
  }

  return NextResponse.json({ valid: true, available: true });
}
