import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { reserveSeats } from "@/server/tickets";

let n = 0;
async function seedTicketType(quantityTotal: number | null): Promise<string> {
  n += 1;
  const org = await prisma.organization.create({
    data: { name: `Org ${n}`, slug: `org-${n}-${Date.now()}` },
  });
  const event = await prisma.event.create({
    data: {
      organizationId: org.id,
      name: `Event ${n}`,
      slug: `event-${n}`,
      description: "Integration test event",
      startAt: new Date(Date.now() + 86_400_000),
      endAt: new Date(Date.now() + 90_000_000),
    },
  });
  const tt = await prisma.ticketType.create({
    data: { eventId: event.id, name: "GA", quantityTotal, quantitySold: 0 },
  });
  return tt.id;
}

describe("atomic seat reservation under concurrency (H-1)", () => {
  it("never oversells a 1-seat type when 10 buyers race for it", async () => {
    const ttId = await seedTicketType(1);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveSeats(prisma, ttId, 1)),
    );
    // Exactly one concurrent caller may win the last seat.
    expect(results.filter(Boolean).length).toBe(1);
    const tt = await prisma.ticketType.findUnique({ where: { id: ttId } });
    expect(tt!.quantitySold).toBe(1); // never pushed past capacity
  });

  it("lets exactly the available count through for a 3-seat type", async () => {
    const ttId = await seedTicketType(3);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveSeats(prisma, ttId, 1)),
    );
    expect(results.filter(Boolean).length).toBe(3);
    const tt = await prisma.ticketType.findUnique({ where: { id: ttId } });
    expect(tt!.quantitySold).toBe(3);
  });

  it("rejects a multi-seat claim that wouldn't fit, accepts one that exactly fits", async () => {
    const ttId = await seedTicketType(2);
    expect(await reserveSeats(prisma, ttId, 3)).toBe(false); // 3 > 2
    expect(await reserveSeats(prisma, ttId, 2)).toBe(true); // exactly fills it
    expect(await reserveSeats(prisma, ttId, 1)).toBe(false); // now full
  });

  it("treats a null quantityTotal as unlimited", async () => {
    const ttId = await seedTicketType(null);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => reserveSeats(prisma, ttId, 1)),
    );
    expect(results.filter(Boolean).length).toBe(5);
  });
});
