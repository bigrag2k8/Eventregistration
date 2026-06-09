import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setSessionCookie, signSession, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email(), password: z.string() });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  const rl = await rateLimit(`signin:${ip}`, 20, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signSession({
    sub: user.id,
    role: user.role,
    email: user.email,
    orgId: user.organizationId ?? undefined,
  });
  await setSessionCookie(token);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

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
