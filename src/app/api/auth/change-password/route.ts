import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireRoleApi,
  hashPassword,
  verifyPassword,
  signSession,
  attachSessionCookie,
} from "@/lib/auth";
import { isProtectedOwner } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

/**
 * Change the signed-in user's password from inside the dashboard (Settings).
 * Requires the current password (so a hijacked but idle session can't silently
 * rotate the password), then, like a reset, bumps sessionVersion to revoke every
 * OTHER session — and re-issues THIS session's cookie so the caller stays logged
 * in. The passwordless break-glass owner has no password to change here.
 */
export async function POST(req: Request) {
  const gate = await requireRoleApi(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (gate instanceof NextResponse) return gate;
  const session = gate;

  const ip = clientIp(req);
  const rl = await rateLimit(`change-password:${session.sub}`, 5, 15 * 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Your new password must be 8–72 characters." }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "This account signs in without a password, so there's nothing to change here." },
      { status: 400 },
    );
  }

  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) {
    await audit({
      userId: user.id, organizationId: user.organizationId, action: "auth.password_change_failed",
      metadata: { reason: "wrong_current" }, ipAddress: ip,
    });
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 });
  }

  if (await verifyPassword(newPassword, user.passwordHash)) {
    return NextResponse.json({ error: "Your new password must be different from your current one." }, { status: 400 });
  }

  // Update the hash and revoke all existing sessions by bumping sessionVersion
  // (same revocation the reset flow uses). The returned row has the new version.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });

  await audit({
    userId: user.id, organizationId: user.organizationId, action: "auth.password_changed", ipAddress: ip,
  });

  // Keep THIS session alive: re-sign a token carrying the new sessionVersion and
  // set it on the response, so the just-bumped version doesn't log the caller out.
  const role = isProtectedOwner(user.email) ? "SUPERADMIN" : user.role;
  const token = await signSession({
    sub: user.id,
    role,
    email: user.email,
    orgId: user.organizationId ?? undefined,
    ver: updated.sessionVersion,
  });
  const res = NextResponse.json({ ok: true });
  attachSessionCookie(res, token);
  return res;
}
