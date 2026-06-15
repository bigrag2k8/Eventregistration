import { NextResponse } from "next/server";
import { z } from "zod";
import { createPasswordReset } from "@/lib/password-reset";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email() });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";

  const parsed = schema.safeParse(await req.json().catch(() => null));
  // Generic 200 regardless of input/outcome so the endpoint can't be used to
  // probe which emails have accounts.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const email = parsed.data.email.toLowerCase();
  const rl = await rateLimit(`forgot-password:${ip}:${email}`, 5, 15 * 60);
  if (!rl.allowed) return NextResponse.json({ ok: true });

  try {
    const raw = await createPasswordReset(email, ip);
    if (raw) {
      const url = `${APP_URL}/reset-password?token=${encodeURIComponent(raw)}`;
      await sendPasswordResetEmail(email, url);
    }
  } catch (e: any) {
    console.error("[forgot-password] send failed:", e?.message);
  }

  return NextResponse.json({ ok: true });
}
