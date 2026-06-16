import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setSessionCookie, signSession, verifyPassword } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isProtectedOwner } from "@/lib/owner";
import { audit } from "@/lib/audit";

const schema = z.object({ email: z.string().email(), password: z.string() });

// A real bcrypt hash (of a random string) to compare against when no user is
// found, so unknown-email sign-ins cost the same time as wrong-password ones.
const DUMMY_BCRYPT_HASH = "$2a$12$7r5cxj083lr0O1bcXocwnOqty.XHYuKrbaQHrQGbSZUGE.O.Ks90C";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`signin:${ip}`, 20, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  // Per-account throttle (SEC-06): survives IP rotation/spoofing by limiting
  // attempts against a single email regardless of source IP.
  const emailRl = await rateLimit(`signin:email:${parsed.data.email.toLowerCase()}`, 10, 300);
  if (!emailRl.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Always run a bcrypt compare — even when the user/hash is missing — so the
  // response time doesn't reveal whether an account exists (timing oracle).
  const hashToCheck = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
  const passwordOk = await verifyPassword(parsed.data.password, hashToCheck);
  if (!user?.passwordHash || !passwordOk) {
    await audit({
      userId: user?.id ?? null, action: "auth.signin_failed",
      metadata: { email: parsed.data.email, reason: user ? "bad_password" : "unknown_email" }, ipAddress: ip,
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  // A soft-deleted user must not be able to sign in (same generic message so
  // it isn't an account-enumeration oracle).
  if (user.deletedAt) {
    await audit({
      userId: user.id, action: "auth.signin_failed",
      metadata: { email: parsed.data.email, reason: "deleted_account" }, ipAddress: ip,
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Break-glass: a protected owner always signs in as SUPERADMIN. Persist the
  // elevation so the DB reflects it (and so the admin list shows them correctly).
  const role = isProtectedOwner(user.email) ? "SUPERADMIN" : user.role;
  const token = await signSession({
    sub: user.id,
    role,
    email: user.email,
    orgId: user.organizationId ?? undefined,
  });
  await setSessionCookie(token);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), ...(role !== user.role ? { role } : {}) },
  });

  await audit({
    userId: user.id, organizationId: user.organizationId, action: "auth.signin",
    metadata: { method: "password", role }, ipAddress: ip,
  });

  // Plan gate: if the user's org hasn't picked a plan yet, send them to billing first.
  let needsPlan = false;
  if (user.organizationId && user.role !== "SUPERADMIN") {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { planSelected: true },
    });
    needsPlan = !!org && !org.planSelected;
  }

  const redirectTo =
    needsPlan ? "/dashboard/billing?welcome=1"
    : (user.role === "STAFF" || user.role === "VOLUNTEER") ? "/checkin"
    : "/dashboard";
  return NextResponse.json({ id: user.id, role: user.role, redirectTo });
}
