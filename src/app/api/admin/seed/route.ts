/**
 * One-shot production seed endpoint.
 *
 * Hit with: POST /api/admin/seed?secret=YOUR_SECRET
 * Requires SEED_SECRET env var.
 * Idempotent — safe to call multiple times.
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.SEED_SECRET || secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const passwordHash = await bcrypt.hash("password123", 12);

  const org = await prisma.organization.upsert({
    where: { slug: "acme-events" },
    update: {},
    create: {
      name: "Acme Events",
      slug: "acme-events",
      contactEmail: "hello@acme.events",
      taxRatePct: 8.5,
      passProcessingFee: true,
    },
  });

  const organizer = await prisma.user.upsert({
    where: { email: "organizer@example.com" },
    update: { role: "ORGANIZER", organizationId: org.id, passwordHash, emailVerified: true },
    create: {
      email: "organizer@example.com",
      passwordHash,
      firstName: "Olivia",
      lastName: "Organizer",
      role: "ORGANIZER",
      organizationId: org.id,
      emailVerified: true,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { role: "SUPERADMIN", organizationId: org.id, passwordHash, emailVerified: true },
    create: {
      email: "admin@example.com",
      passwordHash,
      firstName: "Alex",
      lastName: "Admin",
      role: "SUPERADMIN",
      organizationId: org.id,
      emailVerified: true,
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "staff@example.com" },
    update: { role: "STAFF", organizationId: org.id, passwordHash, emailVerified: true },
    create: {
      email: "staff@example.com",
      passwordHash,
      firstName: "Sam",
      lastName: "Staff",
      role: "STAFF",
      organizationId: org.id,
      emailVerified: true,
    },
  });

  const attendee = await prisma.user.upsert({
    where: { email: "attendee@example.com" },
    update: { passwordHash, emailVerified: true },
    create: {
      email: "attendee@example.com",
      passwordHash,
      firstName: "Avery",
      lastName: "Attendee",
      role: "ATTENDEE",
      emailVerified: true,
    },
  });

  const event = await prisma.event.upsert({
    where: { slug: "ai-summit-2026" },
    update: {},
    create: {
      slug: "ai-summit-2026",
      name: "AI Summit 2026",
      shortDescription: "A one-day conference for AI builders.",
      description:
        "Join 500+ engineers, researchers, and product leaders for a day of talks, workshops, and networking focused on production AI systems.",
      category: "Technology",
      status: "PUBLISHED",
      startAt: new Date("2026-08-15T16:00:00Z"),
      endAt: new Date("2026-08-16T01:00:00Z"),
      timezone: "America/Los_Angeles",
      capacity: 500,
      organizationId: org.id,
      publishedAt: new Date(),
      contactEmail: "hello@acme.events",
      refundPolicy: "Refunds available up to 14 days before the event.",
      taxRatePct: 8.5,
      passProcessingFee: true,
      location: {
        create: {
          venueName: "Moscone Center West",
          addressLine1: "747 Howard St",
          city: "San Francisco",
          state: "CA",
          postalCode: "94103",
          country: "US",
          latitude: 37.7836,
          longitude: -122.4014,
        },
      },
      speakers: {
        create: [
          { name: "Dr. Ada Lin", title: "Chief Scientist, Vector Labs", bio: "PhD in ML systems.", order: 0 },
          { name: "Jorge Reyes", title: "VP Engineering, FoundryAI", bio: "Builds reliable LLM infra.", order: 1 },
        ],
      },
      tags: { create: [{ tag: "ai" }, { tag: "machine-learning" }, { tag: "conference" }] },
      ticketTypes: {
        create: [
          { name: "Early Bird", kind: "EARLY_BIRD", priceCents: 14900, quantityTotal: 200, sortOrder: 0 },
          { name: "General Admission", kind: "GENERAL", priceCents: 19900, quantityTotal: 250, sortOrder: 1 },
          { name: "VIP", kind: "VIP", priceCents: 39900, quantityTotal: 50, sortOrder: 2 },
          { name: "Free Community Pass", kind: "FREE", priceCents: 0, quantityTotal: 50, sortOrder: 3 },
        ],
      },
      promoCodes: {
        create: [
          { code: "SUMMER20", discountType: "PERCENTAGE", percentage: 20, usageLimit: 100 },
          { code: "FRIENDS50", discountType: "FIXED", amountCents: 5000, usageLimit: 25 },
        ],
      },
    },
  });

  return NextResponse.json({
    ok: true,
    seeded: {
      organization: org.slug,
      event: `/events/${event.slug}`,
      users: [organizer.email, admin.email, staff.email, attendee.email],
      defaultPassword: "password123",
    },
  });
}
