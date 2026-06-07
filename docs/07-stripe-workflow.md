# EventFlow — Stripe Integration Workflow

## Setup (one-time)

1. Create a Stripe account (or use a Connect account per organization in Phase 2).
2. Copy `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` from the dashboard.
3. In the Stripe dashboard, create a webhook endpoint pointing at:
   ```
   https://<your-domain>/api/webhooks/stripe
   ```
   Subscribe to these events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
5. (Local dev) Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

## Paid Registration Flow

```
Attendee fills form
        │
        ▼
POST /api/registrations
   → DB row Registration{status: PENDING}
   → computeTotals() applies promo, tax, fee
        │
        ▼
POST /api/checkout/session
   → stripe.checkout.sessions.create({...})
   → DB: store stripeSessionId
   → Response: { url: "https://checkout.stripe.com/..." }
        │
        ▼
User lands on Stripe Checkout (hosted, PCI-safe)
   → Submits card / Apple Pay / Google Pay
        │
        ▼
Stripe redirects → /events/[slug]/success?reg=...
        │
        ▼
Stripe sends webhook `checkout.session.completed`
   → /api/webhooks/stripe
       (verifies signature with STRIPE_WEBHOOK_SECRET)
       → tx: Registration.status = CONFIRMED
       → tx: insert Payment{status: SUCCEEDED}
       → issueTickets()    (generates QR JWTs)
       → sendConfirmationEmail()
```

## Refund Flow

```
Organizer clicks "Refund" in dashboard
   → POST /api/registrations/:id/refund {amountCents?}
   → stripe.refunds.create({payment_intent, amount})
        │
        ▼
Stripe webhook `charge.refunded`
   → /api/webhooks/stripe
       → Payment.refundedAmountCents += amount
       → if full: Registration.status = REFUNDED
                  Tickets.isValid = false
                  Email REFUND sent
```

## Idempotency

- Stripe Checkout already prevents double-charge.
- Webhook handler is idempotent: it checks `Registration.status` before mutating and uses unique `stripePaymentIntentId` on Payment to dedupe.
- Repeated webhooks for the same event are safe.

## Apple Pay / Google Pay

- Both wallets are enabled by default on hosted Stripe Checkout — no additional code needed.
- Just verify your domain in the Stripe dashboard (Apple Pay domain registration).

## Connect (Phase 2)

For marketplace mode where each organization receives payouts directly:
- Use `stripe.accounts.create({ type: 'express' })` per org → store `stripeAccountId`.
- When creating a Checkout Session, pass `payment_intent_data: { application_fee_amount, transfer_data: { destination: org.stripeAccountId } }`.
- Implement organizer onboarding flow via `stripe.accountLinks.create`.

## Testing

```bash
# Use Stripe test cards
4242 4242 4242 4242 — success
4000 0000 0000 9995 — declined (insufficient funds)
4000 0027 6000 3184 — 3DS required

# Trigger webhook locally
stripe trigger checkout.session.completed
```

## Security Notes

- Card details never touch our server (Checkout is hosted on Stripe).
- Webhook endpoint uses raw body + signature verification via `stripe.webhooks.constructEvent`.
- The Stripe webhook route is exempt from CSRF (Stripe-signed).
- `STRIPE_SECRET_KEY` lives in env only; never log it.
