import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { consumePasswordReset } from "@/lib/password-reset";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`reset-password:${ip}`, 10, 15 * 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be 8–72 characters." }, { status: 400 });
  }

  const userId = await consumePasswordReset(parsed.data.token);
  if (!userId) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Please request a new one." },
      { status: 400 },
    );
  }

  // NEW-02: bump sessionVersion so every JWT issued before this reset stops
  // validating in getSession — a stolen/leaked session cookie is revoked the
  // moment the victim resets their password (not up to 7 days later).
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      sessionVersion: { increment: 1 },
    },
  });

  await audit({ userId, action: "auth.password_reset", ipAddress: ip });

  return NextResponse.json({ ok: true });
}
