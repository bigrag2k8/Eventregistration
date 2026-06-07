import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/rate-limit";

export async function GET() {
  const checks: Record<string, string> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (e) {
    checks.database = "fail";
  }
  try {
    await redis().ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "fail";
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ ok, checks, version: process.env.npm_package_version }, { status: ok ? 200 : 503 });
}
