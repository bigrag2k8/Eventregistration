/**
 * Plan catalog — Stripe price IDs and limits for each tier.
 * Stripe products/prices live in the AITS sandbox account (test mode).
 */

export const STRIPE_PRICES = {
  SINGLE_EVENT: "price_1TgNn4GUh2HvGphW681dH3kx", // $19 one-time
  STARTER:      "price_1TgNn5GUh2HvGphWGBVl8PHW", // $24.99/mo
  PRO:          "price_1TgNYYGUh2HvGphWcQuMhzwf", // $29/mo
} as const;

export interface PlanInfo {
  key: "FREE" | "SINGLE_EVENT" | "STARTER" | "PRO" | "ENTERPRISE";
  name: string;
  price: string;                  // human-readable
  priceCents: number;
  cadence: "free" | "one_time" | "monthly" | "custom";
  stripePriceId: string | null;
  /** null = unlimited */
  monthlyEventLimit: number | null;
  registrationLimitPerEvent: number | null;
  /** Max email broadcasts an organizer can send per event. null = unlimited. */
  emailCampaignsPerEvent: number | null;
  features: {
    customBranding: boolean;       // logo + brand color + custom from-email
    vendorFlow: boolean;
    teamInvites: boolean;
    csvExport: boolean;
    apiAccess: boolean;
    customDomain: boolean;
    prioritySupport: boolean;
  };
  blurb: string;
}

export const PLANS: Record<PlanInfo["key"], PlanInfo> = {
  FREE: {
    key: "FREE",
    name: "Free",
    price: "$0",
    priceCents: 0,
    cadence: "free",
    stripePriceId: null,
    monthlyEventLimit: 1,
    registrationLimitPerEvent: 50,
    emailCampaignsPerEvent: 1,
    features: {
      customBranding: false,
      vendorFlow: false,
      teamInvites: false,
      csvExport: true,
      apiAccess: false,
      customDomain: false,
      prioritySupport: false,
    },
    blurb: "Try the platform with one event a month and up to 50 registrations.",
  },
  SINGLE_EVENT: {
    key: "SINGLE_EVENT",
    name: "Single Event",
    price: "$19 per event",
    priceCents: 1900,
    cadence: "one_time",
    stripePriceId: STRIPE_PRICES.SINGLE_EVENT,
    monthlyEventLimit: null, // credit-based; controlled by singleEventCredits
    registrationLimitPerEvent: null,
    emailCampaignsPerEvent: 3,
    features: {
      customBranding: true,
      vendorFlow: true,
      teamInvites: true,
      csvExport: true,
      apiAccess: false,
      customDomain: false,
      prioritySupport: false,
    },
    blurb: "Pay-as-you-go. One payment unlocks one full-featured event. No subscription.",
  },
  STARTER: {
    key: "STARTER",
    name: "Starter",
    price: "$24.99/mo",
    priceCents: 2499,
    cadence: "monthly",
    stripePriceId: STRIPE_PRICES.STARTER,
    monthlyEventLimit: 3,
    registrationLimitPerEvent: null,
    emailCampaignsPerEvent: 5,
    features: {
      customBranding: true,
      vendorFlow: true,
      teamInvites: true,
      csvExport: true,
      apiAccess: false,
      customDomain: false,
      prioritySupport: false,
    },
    blurb: "Up to 3 events per month with full branding and team management.",
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    price: "$29/mo",
    priceCents: 2900,
    cadence: "monthly",
    stripePriceId: STRIPE_PRICES.PRO,
    monthlyEventLimit: null,
    registrationLimitPerEvent: null,
    emailCampaignsPerEvent: 8,
    features: {
      customBranding: true,
      vendorFlow: true,
      teamInvites: true,
      csvExport: true,
      apiAccess: false,
      customDomain: false,
      prioritySupport: false,
    },
    blurb: "Unlimited events, vendor application flow, full branding, team invites.",
  },
  ENTERPRISE: {
    key: "ENTERPRISE",
    name: "Enterprise",
    price: "Contact us",
    priceCents: 0,
    cadence: "custom",
    stripePriceId: null,
    monthlyEventLimit: null,
    registrationLimitPerEvent: null,
    emailCampaignsPerEvent: null,
    features: {
      customBranding: true,
      vendorFlow: true,
      teamInvites: true,
      csvExport: true,
      apiAccess: true,
      customDomain: true,
      prioritySupport: true,
    },
    blurb: "Everything in Pro plus custom domain, API access, priority support, and dedicated instance option.",
  },
};

/** Numeric plan limits a SUPERADMIN can override per-org. */
export const OVERRIDABLE_LIMITS = [
  "monthlyEventLimit",
  "registrationLimitPerEvent",
  "emailCampaignsPerEvent",
] as const;
export type OverridableLimit = (typeof OVERRIDABLE_LIMITS)[number];

/**
 * Per-org overrides set by a SUPERADMIN (stored in Organization.planOverrides).
 * A present key replaces the catalog value for that org; `null` means unlimited.
 * An absent key falls back to the plan default.
 */
export type PlanOverrides = Partial<Record<OverridableLimit, number | null>>;

/** Defensively coerce the raw Json blob into a clean PlanOverrides object. */
export function parseOverrides(raw: unknown): PlanOverrides {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: PlanOverrides = {};
  for (const key of OVERRIDABLE_LIMITS) {
    if (!(key in src)) continue;
    const v = src[key];
    if (v === null) out[key] = null;                              // explicit unlimited
    else if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[key] = Math.floor(v);
    // anything else (undefined / garbage) → no override for this key
  }
  return out;
}

/** Layer per-org overrides on top of a catalog plan, returning a new PlanInfo. */
export function applyOverrides(plan: PlanInfo, overrides: PlanOverrides): PlanInfo {
  if (!overrides || Object.keys(overrides).length === 0) return plan;
  const next = { ...plan };
  for (const key of OVERRIDABLE_LIMITS) {
    if (key in overrides) next[key] = overrides[key] ?? null;
  }
  return next;
}

/** Days a PAST_DUE org keeps paid features past its period end before dropping to FREE. */
const PAST_DUE_GRACE_DAYS = 7;

/**
 * The plan an org is ACTUALLY entitled to right now. Plan gates must use this,
 * not org.subscriptionPlan alone — a subscription whose payment failed stays
 * PAST_DUE (or worse) indefinitely on Stripe's side, and the raw plan field
 * would keep granting paid features forever.
 *
 * FREE/ENTERPRISE/one-time plans have no subscription to lapse and pass
 * through; monthly plans require ACTIVE/TRIALING, or PAST_DUE within a short
 * grace window after the paid period ended.
 */
export function effectivePlan(org: {
  subscriptionPlan: string;
  subscriptionStatus: string;
  subscriptionCurrentPeriodEnd: Date | null;
  planOverrides?: unknown;
}): PlanInfo {
  const base = PLANS[org.subscriptionPlan as keyof typeof PLANS] ?? PLANS.FREE;

  // Resolve the entitled catalog plan first (monthly plans can lapse to FREE)…
  let resolved = base;
  if (base.cadence === "monthly") {
    let granted = org.subscriptionStatus === "ACTIVE" || org.subscriptionStatus === "TRIALING";
    if (!granted && org.subscriptionStatus === "PAST_DUE") {
      const periodEnd = org.subscriptionCurrentPeriodEnd?.getTime() ?? 0;
      granted = Date.now() < periodEnd + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
    }
    resolved = granted ? base : PLANS.FREE;
  }

  // …then layer any SUPERADMIN per-org overrides on top of whatever is in force.
  return applyOverrides(resolved, parseOverrides(org.planOverrides));
}

/**
 * Map a Stripe price ID back to a plan key (used by webhook handler).
 */
export function planFromPriceId(priceId: string | null | undefined): PlanInfo["key"] | null {
  if (!priceId) return null;
  if (priceId === STRIPE_PRICES.SINGLE_EVENT) return "SINGLE_EVENT";
  if (priceId === STRIPE_PRICES.STARTER) return "STARTER";
  if (priceId === STRIPE_PRICES.PRO) return "PRO";
  return null;
}
