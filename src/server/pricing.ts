import type { Event, Organization, PromoCode, TicketType } from "@prisma/client";

type PricedEvent = Event & {
  ticketTypes: TicketType[];
  promoCodes: PromoCode[];
  organization: Pick<Organization, "passProcessingFee">;
};

export interface ComputeTotalsInput {
  // organization is required so the pricing layer can read passProcessingFee
  // from the org (the source of truth, set by SUPERADMIN). The deprecated
  // Event.passProcessingFee is no longer consulted.
  event: PricedEvent;
  ticketTypeId: string;
  quantity: number;
  promoCode?: string;
}

/** One line of a multi-pass cart (a conference day-pass combination). */
export interface CartItemInput {
  ticketTypeId: string;
  quantity: number;
}

export interface ComputeCartTotalsInput {
  event: PricedEvent;
  items: CartItemInput[];
  promoCode?: string;
}

/** One line of a priced cart, surfaced for receipts/summaries. */
export interface PriceLineSummary {
  ticketTypeId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineSubtotal: number;
}

interface PricedOrder {
  subtotal: number;
  discount: number;
  tax: number;
  fee: number;
  total: number;
  currency: string;
  promoCodeId?: string;
}

// Explicit discriminated unions (rather than inferred) so callers can narrow
// with `"error" in result` cleanly across both the single and cart paths.
export type PricingResult = { error: string } | PricedOrder;
export type CartPricingResult = { error: string } | (PricedOrder & { lines: PriceLineSummary[] });

const PROCESSING_FEE_PCT = 2.9;
const PROCESSING_FEE_FIXED_CENTS = 30;

/** A validated ticket line, ready to be summed into a subtotal. */
interface PricedLine {
  ticketTypeId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineSubtotal: number;
}

/**
 * Validate one ticket line (quantity limits, per-type capacity, sales window)
 * and return either its priced line or a friendly error. The authoritative
 * capacity guard is still the atomic reservation at registration creation.
 */
function priceLine(
  event: PricedEvent,
  ticketTypeId: string,
  quantity: number,
): { line: PricedLine } | { error: string } {
  const tt = event.ticketTypes.find((t) => t.id === ticketTypeId);
  if (!tt) return { error: "Ticket type not found" };

  // Per-order quantity limits (enforced server-side, not just the form). The
  // ticket type's own min/max win; otherwise fall back to the event-wide
  // maxPerOrder, then the absolute zod cap of 20.
  const minPer = tt.minPerOrder ?? 1;
  const maxPer = tt.maxPerOrder ?? event.maxPerOrder ?? 20;
  if (quantity < minPer) {
    return { error: `Minimum ${minPer} ticket${minPer > 1 ? "s" : ""} per order for this type` };
  }
  if (quantity > maxPer) {
    return { error: `Maximum ${maxPer} ticket${maxPer > 1 ? "s" : ""} per order for this type` };
  }

  // Capacity check (fast, friendly pre-check; the authoritative guard is the
  // atomic reservation at registration creation).
  if (tt.quantityTotal && tt.quantitySold + quantity > tt.quantityTotal) {
    return { error: "Not enough tickets remaining" };
  }

  // Sales window
  const now = new Date();
  if (tt.salesStartAt && now < tt.salesStartAt) return { error: "Sales have not started" };
  if (tt.salesEndAt && now > tt.salesEndAt) return { error: "Sales have ended" };

  return {
    line: {
      ticketTypeId: tt.id,
      name: tt.name,
      unitPriceCents: tt.priceCents,
      quantity,
      lineSubtotal: tt.priceCents * quantity,
    },
  };
}

/**
 * Shared money tail: given a validated subtotal, apply the presale early-bird
 * discount, an optional promo code, tax, and the optional Stripe processing fee.
 * Both the single-ticket (`computeTotals`) and multi-pass (`computeCartTotals`)
 * paths run through this so their discount/tax/fee math can never drift.
 */
function finalizeTotals(
  event: PricedEvent,
  subtotal: number,
  currency: string,
  promoCode: string | undefined,
): { discount: number; tax: number; fee: number; total: number; promoCodeId?: string } | { error: string } {
  const now = new Date();

  // Presale (early-bird) discount: an automatic, code-free percentage off the
  // ticket price while the presale window is open. Applies before any promo so
  // a promo code stacks on the already-discounted early-bird price.
  let presaleDiscount = 0;
  const presalePct = event.presalePercent != null ? Number(event.presalePercent) : 0;
  const presaleActive = presalePct > 0 && event.presaleEndsAt != null && now < event.presaleEndsAt;
  if (presaleActive) {
    presaleDiscount = Math.floor((subtotal * presalePct) / 100);
  }
  const afterPresale = subtotal - presaleDiscount;

  // Promo code (computed on the post-presale amount)
  let promoDiscount = 0;
  let promoCodeId: string | undefined;
  if (promoCode) {
    const promo = event.promoCodes.find(
      (p) => p.code.toLowerCase() === promoCode.toLowerCase() && p.isActive
    );
    if (!promo) return { error: "Invalid promo code" };
    if (promo.expiresAt && now > promo.expiresAt) return { error: "Promo code expired" };
    if (promo.usageLimit && promo.usageCount >= promo.usageLimit) {
      return { error: "Promo code usage limit reached" };
    }
    promoCodeId = promo.id;
    if (promo.discountType === "PERCENTAGE" && promo.percentage) {
      promoDiscount = Math.floor((afterPresale * Number(promo.percentage)) / 100);
    } else if (promo.discountType === "FIXED" && promo.amountCents) {
      promoDiscount = Math.min(afterPresale, promo.amountCents);
    }
  }

  // Total reduction off the sale value — presale + promo. Stored as the single
  // discountCents on the registration; the platform fee is charged on (subtotal − discount).
  const discount = presaleDiscount + promoDiscount;
  const taxable = subtotal - discount;
  const taxRate = Number(event.taxRatePct ?? 0);
  const tax = Math.round((taxable * taxRate) / 100);

  let fee = 0;
  if (event.organization.passProcessingFee && taxable > 0) {
    fee = Math.round((taxable * PROCESSING_FEE_PCT) / 100) + PROCESSING_FEE_FIXED_CENTS;
  }

  const total = Math.max(0, taxable + tax + fee);
  return { discount, tax, fee, total, promoCodeId };
}

export async function computeTotals(input: ComputeTotalsInput): Promise<PricingResult> {
  const priced = priceLine(input.event, input.ticketTypeId, input.quantity);
  if ("error" in priced) return { error: priced.error };
  const tt = input.event.ticketTypes.find((t) => t.id === input.ticketTypeId)!;

  // Event-wide capacity pre-check.
  if (input.event.capacity != null) {
    const eventSold = input.event.ticketTypes.reduce((s, t) => s + t.quantitySold, 0);
    if (eventSold + input.quantity > input.event.capacity) {
      return { error: "This event is sold out" as const };
    }
  }

  const finalized = finalizeTotals(input.event, priced.line.lineSubtotal, tt.currency, input.promoCode);
  if ("error" in finalized) return { error: finalized.error };

  return {
    subtotal: priced.line.lineSubtotal,
    discount: finalized.discount,
    tax: finalized.tax,
    fee: finalized.fee,
    total: finalized.total,
    currency: tt.currency,
    promoCodeId: finalized.promoCodeId,
  };
}

/**
 * Totals for a multi-pass conference order (one Registration, several TicketType
 * lines, one payment). Sums the per-line subtotals, then runs the same presale /
 * promo / tax / fee tail as a single-ticket order. Returns a `lines[]` breakdown
 * for the receipt/summary. `items` must be non-empty; each item is qty ≥ 1.
 */
export async function computeCartTotals(input: ComputeCartTotalsInput): Promise<CartPricingResult> {
  if (!input.items.length) return { error: "No passes selected" };

  const lines: PricedLine[] = [];
  for (const item of input.items) {
    const priced = priceLine(input.event, item.ticketTypeId, item.quantity);
    if ("error" in priced) return { error: priced.error };
    lines.push(priced.line);
  }

  // Event-wide capacity pre-check on the combined quantity.
  const orderQuantity = lines.reduce((s, l) => s + l.quantity, 0);
  if (input.event.capacity != null) {
    const eventSold = input.event.ticketTypes.reduce((s, t) => s + t.quantitySold, 0);
    if (eventSold + orderQuantity > input.event.capacity) {
      return { error: "This event is sold out" as const };
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.lineSubtotal, 0);
  const currency = input.event.ticketTypes.find((t) => t.id === input.items[0].ticketTypeId)?.currency ?? "USD";

  const finalized = finalizeTotals(input.event, subtotal, currency, input.promoCode);
  if ("error" in finalized) return { error: finalized.error };

  return {
    subtotal,
    discount: finalized.discount,
    tax: finalized.tax,
    fee: finalized.fee,
    total: finalized.total,
    currency,
    promoCodeId: finalized.promoCodeId,
    lines: lines.map((l) => ({
      ticketTypeId: l.ticketTypeId,
      name: l.name,
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
      lineSubtotal: l.lineSubtotal,
    })),
  };
}
