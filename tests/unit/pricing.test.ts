import { describe, it, expect, vi } from "vitest";

// computeTotals imports the prisma client at module load but never queries it
// (it operates purely on its input). Stub it so no PrismaClient is constructed.
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { computeTotals } from "@/server/pricing";

const HOUR = 60 * 60 * 1000;
const future = () => new Date(Date.now() + 24 * HOUR);
const past = () => new Date(Date.now() - 24 * HOUR);

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "tt1",
    priceCents: 1000,
    currency: "usd",
    minPerOrder: null,
    maxPerOrder: null,
    quantityTotal: null,
    quantitySold: 0,
    salesStartAt: null,
    salesEndAt: null,
    isVendorTier: false,
    ...overrides,
  };
}

function makeEvent(ticketTypes: any[], overrides: Record<string, unknown> = {}) {
  return {
    ticketTypes,
    promoCodes: [],
    maxPerOrder: null,
    capacity: null,
    presalePercent: null,
    presaleEndsAt: null,
    taxRatePct: null,
    passProcessingFee: false,
    ...overrides,
  };
}

const run = (event: any, opts: { ticketTypeId?: string; quantity?: number; promoCode?: string } = {}) =>
  computeTotals({ event, ticketTypeId: opts.ticketTypeId ?? "tt1", quantity: opts.quantity ?? 1, promoCode: opts.promoCode });

describe("computeTotals — base pricing", () => {
  it("multiplies price by quantity with no discounts/fees", async () => {
    const r = await run(makeEvent([makeTicket()]), { quantity: 2 });
    expect(r).toMatchObject({ subtotal: 2000, discount: 0, tax: 0, fee: 0, total: 2000, currency: "usd" });
  });

  it("errors when the ticket type is not found", async () => {
    const r = await run(makeEvent([makeTicket()]), { ticketTypeId: "missing" });
    expect(r).toEqual({ error: "Ticket type not found" });
  });
});

describe("computeTotals — per-order limits", () => {
  it("enforces the ticket-type minimum", async () => {
    const r = await run(makeEvent([makeTicket({ minPerOrder: 2 })]), { quantity: 1 });
    expect(r).toMatchObject({ error: expect.stringContaining("Minimum 2") });
  });

  it("enforces the ticket-type maximum (wins over event max)", async () => {
    const r = await run(makeEvent([makeTicket({ maxPerOrder: 5 })], { maxPerOrder: 99 }), { quantity: 6 });
    expect(r).toMatchObject({ error: expect.stringContaining("Maximum 5") });
  });

  it("falls back to the event-wide max when the ticket type has none", async () => {
    const r = await run(makeEvent([makeTicket()], { maxPerOrder: 3 }), { quantity: 4 });
    expect(r).toMatchObject({ error: expect.stringContaining("Maximum 3") });
  });
});

describe("computeTotals — capacity & sales window", () => {
  it("rejects when the ticket type is nearly sold out", async () => {
    const r = await run(makeEvent([makeTicket({ quantityTotal: 10, quantitySold: 9 })]), { quantity: 2 });
    expect(r).toEqual({ error: "Not enough tickets remaining" });
  });

  it("rejects when the event capacity is exceeded across ticket types", async () => {
    const event = makeEvent([makeTicket({ quantitySold: 4 })], { capacity: 5 });
    const r = await run(event, { quantity: 2 });
    expect(r).toEqual({ error: "This event is sold out" });
  });

  it("rejects before sales start and after sales end", async () => {
    expect(await run(makeEvent([makeTicket({ salesStartAt: future() })]))).toEqual({ error: "Sales have not started" });
    expect(await run(makeEvent([makeTicket({ salesEndAt: past() })]))).toEqual({ error: "Sales have ended" });
  });
});

describe("computeTotals — discounts (presale + promo stack)", () => {
  it("applies an active presale percentage", async () => {
    const event = makeEvent([makeTicket({ priceCents: 1000 })], { presalePercent: 20, presaleEndsAt: future() });
    const r = await run(event, { quantity: 1 });
    expect(r).toMatchObject({ subtotal: 1000, discount: 200, total: 800 });
  });

  it("ignores an expired presale", async () => {
    const event = makeEvent([makeTicket()], { presalePercent: 20, presaleEndsAt: past() });
    expect(await run(event)).toMatchObject({ discount: 0, total: 1000 });
  });

  it("stacks a percentage promo on the post-presale amount", async () => {
    const event = makeEvent([makeTicket({ priceCents: 1000 })], {
      presalePercent: 20,
      presaleEndsAt: future(),
      promoCodes: [{ id: "p1", code: "SAVE10", isActive: true, discountType: "PERCENTAGE", percentage: 10, expiresAt: null, usageLimit: null, usageCount: 0 }],
    });
    // 1000 -> presale 20% (-200) -> 800 -> promo 10% of 800 (-80) -> 720
    const r = await run(event, { quantity: 1, promoCode: "save10" });
    expect(r).toMatchObject({ discount: 280, total: 720, promoCodeId: "p1" });
  });

  it("clamps a fixed promo to the remaining amount (never negative)", async () => {
    const event = makeEvent([makeTicket({ priceCents: 800 })], {
      promoCodes: [{ id: "p2", code: "BIG", isActive: true, discountType: "FIXED", amountCents: 1000, expiresAt: null, usageLimit: null, usageCount: 0 }],
    });
    expect(await run(event, { promoCode: "BIG" })).toMatchObject({ discount: 800, total: 0 });
  });

  it("rejects an unknown or inactive promo code", async () => {
    const event = makeEvent([makeTicket()], {
      promoCodes: [{ id: "p3", code: "OFF", isActive: false, discountType: "FIXED", amountCents: 100, expiresAt: null, usageLimit: null, usageCount: 0 }],
    });
    expect(await run(event, { promoCode: "OFF" })).toEqual({ error: "Invalid promo code" });
    expect(await run(event, { promoCode: "NOPE" })).toEqual({ error: "Invalid promo code" });
  });

  it("rejects a promo at its usage limit", async () => {
    const event = makeEvent([makeTicket()], {
      promoCodes: [{ id: "p4", code: "MAX", isActive: true, discountType: "FIXED", amountCents: 100, expiresAt: null, usageLimit: 5, usageCount: 5 }],
    });
    expect(await run(event, { promoCode: "MAX" })).toEqual({ error: "Promo code usage limit reached" });
  });
});

describe("computeTotals — tax & processing fee", () => {
  it("rounds tax on the discounted (taxable) amount", async () => {
    const event = makeEvent([makeTicket({ priceCents: 1000 })], { taxRatePct: 8.25 });
    // tax = round(1000 * 8.25%) = round(82.5) = 83
    expect(await run(event)).toMatchObject({ tax: 83, total: 1083 });
  });

  it("adds the passed-through processing fee (2.9% + 30c)", async () => {
    const event = makeEvent([makeTicket({ priceCents: 1000 })], { passProcessingFee: true });
    // fee = round(1000 * 2.9%) + 30 = 29 + 30 = 59
    expect(await run(event)).toMatchObject({ fee: 59, total: 1059 });
  });
});
