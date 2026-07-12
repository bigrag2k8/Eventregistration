/**
 * DEV HELPER — print a working review link for a registration, so you can open
 * the /review/[token] page locally without waiting for the worker's post-event
 * invite email. Mints the same signed token sendReviewRequestEmail uses.
 *
 * Usage:
 *   npx tsx scripts/dev-review-link.ts <registrationId>
 *   npx tsx scripts/dev-review-link.ts            # lists recent registrations to pick from
 *
 * The review page still enforces that the event has ended and the registration
 * is CONFIRMED — this only saves you the email round-trip.
 */
import { PrismaClient } from "@prisma/client";
import { signReviewToken } from "@/lib/auth";

const prisma = new PrismaClient();

async function main() {
  const id = process.argv[2];
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  if (!id) {
    const recent = await prisma.registration.findMany({
      where: { status: "CONFIRMED" },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { event: { select: { name: true, endAt: true } } },
    });
    if (recent.length === 0) {
      console.log("No CONFIRMED registrations found. Seed some data first (npm run seed).");
      return;
    }
    console.log("Recent confirmed registrations (pass an id as the first arg):\n");
    for (const r of recent) {
      const ended = r.event.endAt < new Date() ? "ended" : "upcoming";
      console.log(`  ${r.id}  ${r.email}  —  ${r.event.name} (${ended})`);
    }
    return;
  }

  const reg = await prisma.registration.findUnique({
    where: { id },
    include: { event: { select: { name: true, endAt: true } } },
  });
  if (!reg) {
    console.log(`No registration with id ${id}`);
    return;
  }
  const token = await signReviewToken({ registrationId: reg.id });
  console.log(`\nEvent:   ${reg.event.name}  (${reg.event.endAt < new Date() ? "ended" : "NOT ended yet — page will say come back later"})`);
  console.log(`Email:   ${reg.email}`);
  console.log(`\nReview link:\n${base}/review/${token}\n`);
  console.log(`Pre-filled 4 stars:\n${base}/review/${token}?rating=4\n`);
}

main().finally(() => prisma.$disconnect());
