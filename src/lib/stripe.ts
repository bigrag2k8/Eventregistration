import Stripe from "stripe";

const rawKey = (process.env.STRIPE_SECRET_KEY ?? "").trim();
// Use `||` (not `??`) so empty strings fall back too.
// Without this, an empty STRIPE_SECRET_KEY produces Stripe's confusing
// "You did not provide an API key" error at request time.
const key = rawKey || "sk_test_placeholder";

if (!rawKey) {
  // Surface this loud and early in deploy logs so it doesn't masquerade
  // as a generic Stripe API error later.
  // eslint-disable-next-line no-console
  console.error(
    "[stripe] STRIPE_SECRET_KEY is missing or empty — Stripe calls will fail with 'no API key'.",
  );
}

export const stripe = new Stripe(key, {
  apiVersion: "2024-06-20",
  typescript: true,
});

/** True iff a real-looking Stripe key is configured. */
export const stripeConfigured = /^sk_(test|live)_/.test(rawKey);
