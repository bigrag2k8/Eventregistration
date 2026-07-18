/**
 * Plan catalog — Stripe price IDs and limits for each tier.
 *
 * Price IDs are env-overridable so test↔live can be flipped entirely from Railway
 * with no code change: set STRIPE_PRICE_SINGLE_EVENT / _STARTER / _PRO to the live
 * `price_…` IDs alongside the live keys. When unset they fall back to the current
 * test-sandbox IDs (recreated 2026-06-13 after the sandbox move), so existing
 * test-mode billing keeps working untouched.
 */

export const STRIPE_PRICES = {
  SINGLE_EVENT: process.env.STRIPE_PRICE_SINGLE_EVENT ?? "price_1Thy3mGrTuPPvYuYlFzhMPOH", // $19 one-time
  // Recurring event credit is ALWAYS billed inline (price_data) at
  // RECURRING_EVENT_CREDIT_PRICE_CENTS — hardcoded null so the price is
  // controlled entirely from code, not a Stripe Price object. NOTE: the old
  // STRIPE_PRICE_RECURRING_EVENT_CREDIT env var (a $34.99 Price) is intentionally
  // ignored; delete it from the host to avoid confusion.
  RECURRING_EVENT_CREDIT: null as string | null,
  STARTER:      process.env.STRIPE_PRICE_STARTER      ?? "price_1Thy4EGrTuPPvYuYf7xx0F0i", // $24.99/mo
  PRO:          process.env.STRIPE_PRICE_PRO          ?? "price_1Thy4eGrTuPPvYuY3VtIshXM", // $29/mo
};

/**
 * Per-EVENT entitlements (the Free + Single Event model).
 *
 * Packaging is per event, not per org: every org runs unlimited FREE events
 * (basic, capped registrations) and spends a one-time single-event credit to
 * make any individual event PREMIUM. `Event.isPremium` is the source of truth;
 * this maps it to what that event is allowed to do.
 */
export const FREE_EVENT_REGISTRATION_LIMIT = 50;
export const FREE_EVENT_EMAIL_BROADCASTS = 1;
export const PREMIUM_EVENT_EMAIL_BROADCASTS = 5;
/** Price of one single-event credit (USD cents). Mirrors PLANS.SINGLE_EVENT. */
export const SINGLE_EVENT_PRICE_CENTS = 1900;
/** Price of one recurring event credit (USD cents). Mirrors PLANS.RECURRING_EVENT_CREDIT. */
export const RECURRING_EVENT_CREDIT_PRICE_CENTS = 1900;
/** Max total sessions a single recurring event may generate with a credit (fits
 *  a 12-week course; also stops abuse — a $19 credit can't mint thousands). A
 *  FREE recurring event is capped much lower — see FREE_RECURRING_SESSIONS in
 *  src/server/recurring-rule.ts. The number of recurring events is unlimited. */
export const MAX_RECURRING_OCCURRENCES = 12;

export interface EventEntitlements {
  /** Max total registrations (tickets) for this event. null = unlimited. */
  registrationLimit: number | null;
  /** Can this event accept vendor/booth applications? */
  vendorFlow: boolean;
  /** Show the org's custom branding (logo + color) on this event's public page? */
  customBranding: boolean;
  /** Max organizer email broadcasts for this event. null = unlimited. */
  emailBroadcasts: number | null;
}

/** What an event can do, based solely on whether a credit has been spent on it. */
export function eventEntitlements(isPremium: boolean): EventEntitlements {
  return isPremium
    ? { registrationLimit: null, vendorFlow: true, customBranding: true, emailBroadcasts: PREMIUM_EVENT_EMAIL_BROADCASTS }
    : { registrationLimit: FREE_EVENT_REGISTRATION_LIMIT, vendorFlow: false, customBranding: false, emailBroadcasts: FREE_EVENT_EMAIL_BROADCASTS };
}

/**
 * Plans shown on the public pricing/billing UI. The subscription tiers
 * (STARTER/PRO) are intentionally hidden in the per-event model but kept in the
 * catalog + webhook code so they can be switched back on without a rebuild.
 */
export const PUBLIC_PLAN_KEYS = ["FREE", "SINGLE_EVENT"] as const;

export interface PlanInfo {
  key: "FREE" | "SINGLE_EVENT" | "RECURRING_EVENT_CREDIT" | "STARTER" | "PRO" | "ENTERPRISE";
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
  RECURRING_EVENT_CREDIT: {
    key: "RECURRING_EVENT_CREDIT",
    name: "Recurring event",
    price: "$19 per recurring event",
    priceCents: RECURRING_EVENT_CREDIT_PRICE_CENTS,
    cadence: "one_time",
    stripePriceId: STRIPE_PRICES.RECURRING_EVENT_CREDIT,
    monthlyEventLimit: null, // credit-based; controlled by recurringEventCredits
    registrationLimitPerEvent: null,
    emailCampaignsPerEvent: 5,
    features: {
      customBranding: true,
      vendorFlow: false,
      teamInvites: true,
      csvExport: true,
      apiAccess: false,
      customDomain: false,
      prioritySupport: false,
    },
    blurb: "One payment unlocks one full recurring event — every session premium, plus the all-sessions pass.",
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
