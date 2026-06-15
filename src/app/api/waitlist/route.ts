import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getSession } from "@/lib/auth";

const schema = z.object({
  eventId: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  const rl = await rateLimit(`waitlist:${ip}`, 10, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }
  const input = parsed.data;

  const event = await prisma.event.findFirst({
    where: { id: input.eventId, status: "PUBLISHED", waitlistEnabled: true, deletedAt: null },
  });
  if (!event) {
    return NextResponse.json({ error: "This event is not accepting waitlist signups." }, { status: 404 });
  }

  const existing = await prisma.waitlist.findUnique({
    where: { eventId_email: { eventId: event.id, email: input.email } },
  });
  if (existing) {
    return NextResponse.json({
      error: "You're already on the waitlist for this event.",
      position: existing.position,
    }, { status: 409 });
  }

  const lastEntry = await prisma.waitlist.findFirst({
    where: { eventId: event.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const nextPosition = (lastEntry?.position ?? 0) + 1;

  // Own the entry immediately if a signed-in attendee is joining with their own
  // email; otherwise it stays unlinked and gets adopted at their next sign-in.
  const session = await getSession();
  const ownerUserId =
    session && session.email.toLowerCase() === input.email.toLowerCase()
      ? session.sub
      : null;

  const entry = await prisma.waitlist.create({
    data: {
      eventId: event.id,
      userId: ownerUserId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      position: nextPosition,
      leaveToken: crypto.randomBytes(24).toString("base64url"),
    },
  });

  return NextResponse.json({
    id: entry.id,
    position: entry.position,
    leaveToken: entry.leaveToken,
  });
}
