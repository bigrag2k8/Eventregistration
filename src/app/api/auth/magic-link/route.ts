import { NextResponse } from "next/server";
import { z } from "zod";
import { createMagicLink } from "@/lib/magic-link";
import { sendMagicLinkEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  next: z.string().optional(),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

/** Only allow same-site relative redirects to avoid an open-redirect via ?next. */
function safeNext(next?: string) {
  if (!next) return "/account";
  if (!next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";

  const parsed = schema.safeParse(await req.json().catch(() => null));
  // Generic 200 even on bad input so the endpoint can't be used to probe.
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }
  const email = parsed.data.email.toLowerCase();
  const next = safeNext(parsed.data.next);

  // Rate-limit per IP+email so one inbox can't be flooded and an attacker can't
  // enumerate by timing. Always return the same generic body regardless.
  const rl = await rateLimit(`magic-link:${ip}:${email}`, 5, 15 * 60);
  if (!rl.allowed) {
    return NextResponse.json({ ok: true });
  }

  try {
    const raw = await createMagicLink(email, ip);
    const url = `${APP_URL}/auth/verify?token=${encodeURIComponent(raw)}&next=${encodeURIComponent(next)}`;
    await sendMagicLinkEmail(email, url);
  } catch (e: any) {
    // Never surface whether the address exists or send failed — log only.
    console.error("[magic-link] send failed:", e?.message);
  }

  return NextResponse.json({ ok: true });
}
