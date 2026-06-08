import { NextResponse } from "next/server";

/**
 * Public self-serve signup is DISABLED.
 * New organizations are created by SUPERADMIN via /admin/orgs/new,
 * which sends an invite email. Recipients accept at /invite/[token].
 */
export async function POST() {
  return NextResponse.json(
    { error: "Self-serve signup is closed. Please contact AITS-Events@automateditsolutions.net to request access." },
    { status: 403 }
  );
}
