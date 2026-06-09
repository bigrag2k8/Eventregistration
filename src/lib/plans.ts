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
