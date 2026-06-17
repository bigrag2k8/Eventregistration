import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { attachSessionCookie, signSession } from "@/lib/auth";
import { verifyMfaChallenge, decryptSecret, verifyTotp, consumeRecoveryCode } from "@/lib/mfa";
import { isProtectedOwner } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const schema = z.object({ mfaToken: z.string().min(1), code: z.string().min(1).max(20) });

// Second factor: exchange a valid challenge token + TOTP (or recovery) code for
// a real session. The challenge token proves the password step already passed.
export async function POST(req: Request) {
  const ip = clientIp(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const userId = await verifyMfaChallenge(parsed.data.mfaToken);
  if (!userId) {
    return NextResponse.json({ error: "Your sign-in attempt expired. Please sign in again." }, { status: 401 });
  }

  // Throttle code guesses per account (TOTP is only 6 digits).
  const rl = await rateLimit(`mfa:${userId}`, 10, 300);
  if (!rl.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt || !user.mfaEnabled || !user.mfaSecret) {
    return NextResponse.json({ error: "Invalid request" }, { status: 401 });
  }

  const code = parsed.data.code.trim();
  const secret = decryptSecret(user.mfaSecret);
  let ok = !!secret && verifyTotp(secret, code);
  let usedRecovery = false;
  if (!ok) {
    const remaining = consumeRecoveryCode(user.mfaRecoveryCodes, code);
    if (remaining) {
      ok = true;
      usedRecovery = true;
      await prisma.user.update({ where: { id: user.id }, data: { mfaRecoveryCodes: remaining } });
    }
  }
  if (!ok) {
    await audit({ userId: user.id, action: "auth.mfa_failed", ipAddress: ip });
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  // Mirror the password sign-in's owner elevation + session issuance.
  const owner = isProtectedOwner(user.email);
  const role = owner ? "SUPERADMIN" : user.role;
  const token = await signSession({
    sub: user.id, role, email: user.email,
    orgId: user.organizationId ?? undefined, ver: user.sessionVersion,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), ...(role !== user.role ? { role } : {}) },
  });
  await audit({
    userId: user.id, organizationId: user.organizationId, action: "auth.mfa_success",
    metadata: { method: usedRecovery ? "recovery_code" : "totp", role }, ipAddress: ip,
  });

  let needsPlan = false;
  if (user.organizationId && role !== "SUPERADMIN") {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId }, select: { planSelected: true },
    });
    needsPlan = !!org && !org.planSelected;
  }
  const redirectTo =
    needsPlan ? "/dashboard/billing?welcome=1"
    : role === "STAFF" || role === "VOLUNTEER" ? "/checkin"
    : "/dashboard";

  const res = NextResponse.json({ ok: true, redirectTo, recoveryUsed: usedRecovery });
  attachSessionCookie(res, token);
  return res;
}
