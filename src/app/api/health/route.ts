import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis, rateLimit, clientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/auth";

/**
 * Liveness/health probe.
 *
 * F-20: the per-dependency breakdown and app version are reconnaissance-useful
 * (they aid CVE correlation and make a nice amplification target), so anonymous
 * callers get only a minimal { ok } with the correct 200/503 status — enough for
 * Railway's healthcheck and uptime monitors. The detailed body is returned only
 * to an authorized caller: a SUPERADMIN session, or a request bearing the
 * internal HEALTH_TOKEN. A light per-IP rate limit blunts probing/amplification.
 */
export async function GET(req: Request) {
  const rl = await rateLimit(`health:${clientIp(req)}`, 30, 60, { failOpen: true });
  if (!rl.allowed) return NextResponse.json({ ok: true }, { status: 200 });

  const checks: Record<string, string> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "fail";
  }
  try {
    await redis().ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "fail";
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  const status = ok ? 200 : 503;

  // Cheap check first (a header token); only touch the session if needed. An
  // anonymous probe has no cookie, so getSession() returns null without a DB hit.
  const token = req.headers.get("x-health-token");
  const authorized =
    (!!process.env.HEALTH_TOKEN && token === process.env.HEALTH_TOKEN) ||
    (await getSession())?.role === "SUPERADMIN";

  if (!authorized) return NextResponse.json({ ok }, { status });
  return NextResponse.json({ ok, checks, version: process.env.npm_package_version }, { status });
}
