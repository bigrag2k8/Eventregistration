import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sendRefundRequestReceivedEmail } from "@/lib/email";

const submitSchema = z.object({
  reason: z.string().min(10).max(2000),
  key: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ip = clientIp(req);
  const rl = await rateLimit(`refund-req:${ip}`, 5, 300);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a reason (at least 10 characters)." }, { status: 400 });
  }

  const reg = await prisma.registration.findUnique({
    where: { id: params.id },
    include: { event: { include: { organization: true } } },
  });
  if (!reg || !reg.accessToken || reg.accessToken !== parsed.data.key) {
    return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  }

  if (reg.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Only confirmed registrations can request a refund." }, { status: 400 });
  }
  if (reg.totalCents === 0) {
    return NextResponse.json({ error: "Free registrations do not require a refund." }, { status: 400 });
  }

  const existing = await prisma.refundRequest.findFirst({
    where: { registrationId: reg.id, status: "OPEN" },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a pending refund request for this registration." }, { status: 409 });
  }

  const request = await prisma.refundRequest.create({
    data: {
      registrationId: reg.id,
      eventId: reg.eventId,
      organizationId: reg.event.organizationId,
      reason: parsed.data.reason,
    },
  });

  // Notify the organizer (non-fatal — the request is recorded regardless).
  try {
    await sendRefundRequestReceivedEmail(request.id);
  } catch (e) {
    console.error("[refund-request] organizer notification failed", e);
  }

  return NextResponse.json({ id: request.id, status: request.status });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing access key." }, { status: 400 });

  const reg = await prisma.registration.findUnique({
    where: { id: params.id },
  });
  if (!reg || !reg.accessToken || reg.accessToken !== key) {
    return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  }

  const requests = await prisma.refundRequest.findMany({
    where: { registrationId: reg.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, reason: true, reviewNote: true, createdAt: true, reviewedAt: true },
  });

  return NextResponse.json({ requests });
}
