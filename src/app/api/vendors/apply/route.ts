import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  eventId: z.string(),
  companyName: z.string().max(200).optional().default(""),
  contactFirstName: z.string().min(1, "First name is required").max(80),
  contactLastName: z.string().min(1, "Last name is required").max(80),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(7, "Phone number is required").max(40),
  website: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().min(10).max(4000),
  productCategory: z.string().min(1, "Product category is required").max(120),
  boothPreference: z.string().max(200).optional(),
  sponsorshipLevel: z.string().max(120).optional(),
  electricalNeeds: z.boolean().optional(),
  additionalRequests: z.string().max(2000).optional(),
  addressLine1: z.string().min(1, "Street address is required").max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(1, "State / province is required").max(100),
  zipCode: z.string().min(1, "ZIP / postal code is required").max(20),
  country: z.string().min(1, "Country is required").max(100),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
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
      phone: input.phone,
      website: input.website || null,
      logoUrl: input.logoUrl || null,
      description: input.description,
      productCategory: input.productCategory,
      boothPreference: input.boothPreference || null,
      sponsorshipLevel: input.sponsorshipLevel || null,
      electricalNeeds: input.electricalNeeds ?? false,
      additionalRequests: input.additionalRequests || null,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 || null,
      city: input.city,
      state: input.state,
      zipCode: input.zipCode,
      country: input.country,
    },
  });

  return NextResponse.json({ id: app.id, status: app.status });
}
