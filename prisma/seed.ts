import { PrismaClient, Role, EventStatus, TicketTypeKind } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding…");

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
    update: {},
    create: {
      email: "organizer@example.com",
      passwordHash,
      firstName: "Olivia",
      lastName: "Organizer",
      role: Role.ORGANIZER,
      organizationId: org.id,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "staff@example.com" },
    update: {},
    create: {
      email: "staff@example.com",
      passwordHash,
      firstName: "Sam",
      lastName: "Staff",
      role: Role.STAFF,
      organizationId: org.id,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "attendee@example.com" },
    update: {},
    create: {
      email: "attendee@example.com",
      passwordHash,
      firstName: "Avery",
      lastName: "Attendee",
      role: Role.ATTENDEE,
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
      status: EventStatus.PUBLISHED,
      startAt: new Date("2026-08-15T16:00:00Z"),
      endAt: new Date("2026-08-16T01:00:00Z"),
      timezone: "America/Los_Angeles",
      capacity: 500,
      organizationId: org.id,
      publishedAt: new Date(),
      bannerUrl: "/sample-banner.jpg",
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
      tags: {
        create: [{ tag: "ai" }, { tag: "machine-learning" }, { tag: "conference" }],
      },
      ticketTypes: {
        create: [
          {
            name: "Early Bird",
            kind: TicketTypeKind.EARLY_BIRD,
            priceCents: 14900,
            quantityTotal: 200,
            salesEndAt: new Date("2026-07-01"),
            sortOrder: 0,
          },
          {
            name: "General Admission",
            kind: TicketTypeKind.GENERAL,
            priceCents: 19900,
            quantityTotal: 250,
            sortOrder: 1,
          },
          {
            name: "VIP",
            kind: TicketTypeKind.VIP,
            priceCents: 39900,
            quantityTotal: 50,
            sortOrder: 2,
          },
        ],
      },
      customQuestions: {
        create: [
          { label: "How did you hear about us?", type: "TEXT", required: false, sortOrder: 0 },
          {
            label: "T-shirt size",
            type: "RADIO",
            required: true,
            options: ["S", "M", "L", "XL"],
            sortOrder: 1,
          },
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

  console.log(`Seeded org=${org.slug} event=${event.slug} organizer=${organizer.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
