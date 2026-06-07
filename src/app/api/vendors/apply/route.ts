import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  eventId: z.string(),
  companyName: z.string().max(200).optional().default(""),
  contactFirstName: z.string().min(1).max(80),
  contactLastName: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().min(10).max(4000),
  productCategory: z.string().max(120).optional(),
  boothPreference: z.string().max(200).optional(),
  sponsorshipLevel: z.string().max(120).optional(),
  electricalNeeds: z.boolean().optional(),
  additionalRequests: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  const rl = await rateLimit(`vendor-apply:${ip}`, 5, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many submissions, please slow down." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fill in all required fields correctly." }, { status: 400 });
  }
  const input = parsed.data;

  const event = await prisma.event.findFirst({
    where: { id: input.eventId, status: "PUBLISHED", vendorRegistrationEnabled: true, deletedAt: null },
  });
  if (!event) return NextResponse.json({ error: "Vendor registration is not open for this event." }, { status: 404 });

  // dupe check
  const dupe = await prisma.vendorApplication.findUnique({
    where: { eventId_email: { eventId: event.id, email: input.email } },
  });
  if (dupe) {
    return NextResponse.json({
      error: "You've already submitted an application for this event with this email. Contact the organizer if you need to update it.",
    }, { status: 409 });
  }

  const app = await prisma.vendorApplication.create({
    data: {
      eventId: event.id,
      companyName: input.companyName || `${input.contactFirstName} ${input.contactLastName}`,
      contactFirstName: input.contactFirstName,
      contactLastName: input.contactLastName,
      email: input.email,
      phone: input.phone || null,
      website: input.website || null,
      logoUrl: input.logoUrl || null,
      description: input.description,
      productCategory: input.productCategory || null,
      boothPreference: input.boothPreference || null,
      sponsorshipLevel: input.sponsorshipLevel || null,
      electricalNeeds: input.electricalNeeds ?? false,
      additionalRequests: input.additionalRequests || null,
    },
  });

  return NextResponse.json({ id: app.id, status: app.status });
}
