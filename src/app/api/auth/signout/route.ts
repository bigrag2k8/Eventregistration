import { NextResponse } from "next/server";
import { clearSessionCookieOn } from "@/lib/auth";

export async function POST() {
  // Clear on the response object (same route-handler caveat as setting it).
  const res = NextResponse.json({ ok: true });
  clearSessionCookieOn(res);
  return res;
}
