import { prisma } from "@/lib/db";
import type { Event, PromoCode, TicketType } from "@prisma/client";

export interface ComputeTotalsInput {
  event: Event & { ticketTypes: TicketType[]; promoCodes: PromoCode[] };
  ticketTypeId: string;
  quantity: number;
  promoCode?: string;
}

const PROCESSING_FEE_PCT = 2.9;
const PROCESSING_FEE_FIXED_CENTS = 30;

export async function computeTotals(input: ComputeTotalsInput) {
  const tt = input.event.ticketTypes.find((t) => t.id === input.ticketTypeId);
  if (!tt) return { error: "Ticket type not found" as const };

  // Per-order quantity limits (enforced server-side, not just the form). The
  // ticket type's own min/max win; otherwise fall back to the event-wide
  // maxPerOrder, then the absolute zod cap of 20.
  const minPer = tt.minPerOrder ?? 1;
  const maxPer = tt.maxPerOrder ?? input.event.maxPerOrder ?? 20;
  if (input.quantity < minPer) {
    return { error: `Minimum ${minPer} ticket${minPer > 1 ? "s" : ""} per order for this type` as const };
  }
  if (input.quantity > maxPer) {
    return { error: `Maximum ${maxPer} ticket${maxPer > 1 ? "s" : ""} per order for this type` as const };
  }

  // Capacity check (fast, friendly pre-check; the authoritative guard is the
  // atomic reservation at registration creation).
  if (tt.quantityTotal && tt.quantitySold + input.quantity > tt.quantityTotal) {
    return { error: "Not enough tickets remaining" as const };
  }
  if (input.event.capacity != null) {
    const eventSold = input.event.ticketTypes.reduce((s, t) => s + t.quantitySold, 0);
    if (eventSold + input.quantity > input.event.capacity) {
      return { error: "This event is sold out" as const };
    }
  }
  // Sales window
  const now = new Date();
  if (tt.salesStartAt && now < tt.salesStartAt) return { error: "Sales have not started" as const };
  if (tt.salesEndAt && now > tt.salesEndAt) return { error: "Sales have ended" as const };

  const subtotal = tt.priceCents * input.quantity;

  // Promo code
  let discount = 0;
  let promoCodeId: string | undefined;
  if (input.promoCode) {
    const promo = input.event.promoCodes.find(
      (p) => p.code.toLowerCase() === input.promoCode!.toLowerCase() && p.isActive
    );
    if (!promo) return { error: "Invalid promo code" as const };
    if (promo.expiresAt && now > promo.expiresAt) return { error: "Promo code expired" as const };
    if (promo.usageLimit && promo.usageCount >= promo.usageLimit) {
      return { error: "Promo code usage limit reached" as const };
    }
    promoCodeId = promo.id;
    if (promo.discountType === "PERCENTAGE" && promo.percentage) {
      discount = Math.floor(subtotal * Number(promo.percentage) / 100);
    } else if (promo.discountType === "FIXED" && promo.amountCents) {
      discount = Math.min(subtotal, promo.amountCents);
    }
  }

  const taxable = subtotal - discount;
  const taxRate = Number(input.event.taxRatePct ?? 0);
  const tax = Math.round((taxable * taxRate) / 100);

  let fee = 0;
  if (input.event.passProcessingFee && taxable > 0) {
    fee = Math.round((taxable * PROCESSING_FEE_PCT) / 100) + PROCESSING_FEE_FIXED_CENTS;
  }

  const total = Math.max(0, taxable + tax + fee);

  return {
    subtotal,
    discount,
    tax,
    fee,
    total,
    currency: tt.currency,
    promoCodeId,
  };
}
