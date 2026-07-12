# YourEvents — Positioning One-Pager

**Date:** 2026-06-27 · **Purpose:** the brand foundation once payout holds ship. Everything below is copy-ready.

---

## The one-line positioning
> **The event platform that pays you more, protects your buyers, and keeps your brand yours — not the ticketing company's.**

Payout *speed* is a supporting detail, never the headline. (It's copyable and it attracts fraud — a weak moat.)

## Who it's for (the wedge — don't try to be "all of Eventbrite")
Community & small-to-mid organizers Eventbrite has priced out and bureaucratized: **vendor fairs, craft/farmers markets, food festivals, car shows, fundraisers/galas, faith & civic events, fitness competitions, workshops, small conferences ($5–$50 tickets).** Notice: many are **vendor-heavy** — a category Eventbrite handles poorly and you handle natively.

**Do NOT** fight Eventbrite on their real moat: the consumer **discovery marketplace** (millions searching eventbrite.com). You won't out-SEO them. Win on economics, ownership, vendors, and fit.

---

## The five pillars (in priority order)

1. **Keep more of your revenue.** Flat 5% (min $1.25), charged to the organizer — never a surcharge on the attendee. On a $20 ticket the attendee pays $20, not $23.11. *This is the headline. It's true, it's provable, and holds don't touch it.*
2. **Your brand and your data — not ours.** Custom URL, logo, color, banner; you own the attendee relationship and list. On Eventbrite the buyer sees Eventbrite and Eventbrite keeps the data.
3. **One dashboard, including vendors.** Tickets + **vendor application/booth flow** + QR check-in + refunds + promo/waitlist in one place. The vendor flow is a genuine gap in Eventbrite for market/festival/expo organizers.
4. **Pay per event, not a subscription.** Free events free forever; premium is a one-time **$19** per event. No monthly bill whether you run events or not.
5. **Buyer protection + payouts you earn.** Funds are held safely until the event happens, so **if an event is cancelled, attendee refunds are guaranteed.** Organizers who build a track record graduate to fast payouts. Trust that cuts both ways.

> Pillar 5 is the **reframe of the payout hold**: what was a "we never hold your money" boast becomes a *buyer-protection* feature (a positive to advertise to attendees) plus an *earned reward* (a positive to organizers). Eventbrite holds everyone forever with no upside story; you turn the hold into trust + a loyalty ladder.

---

## Messaging do's & don'ts
- ✅ Lead with **revenue kept** and **brand/data ownership**.
- ✅ Sell the hold as **buyer protection** ("book with confidence") and **earned instant payouts**.
- ❌ Don't lead with "faster payouts" — it's now conditional, copyable, and invites fraud.
- ❌ Don't claim "we never hold your funds" anywhere (see copy fixes below — it becomes false).

---

## 🔧 Copy changes

### A. Safe to apply NOW (true today, strengthens positioning)

**Homepage hero** — [`src/app/page.tsx`](../src/app/page.tsx) (currently generic: "Modern event registration, ticketing, and check-in…"):
> **Your event. Your brand. Your revenue.**
> Sell tickets and manage vendors on beautiful, branded pages — and keep more of every dollar. Flat 5%, charged to you, never your attendees.

**Homepage sub-CTA line:** keep "Free tier available · No credit card required."

### B. Apply IN LOCKSTEP with Phase 0 (these are false the moment holds ship)

**`/why` hero** — [`why/page.tsx`](../src/app/(marketing)/why/page.tsx) line ~51. Remove "or the wait for your money."
> Event management without the hidden fees, the complexity, **or the middleman taking your brand.**

**`/why` Pillar 2** — currently *"Direct payouts to your bank … we never hold your funds and we never delay your payouts until after the event."* Replace with:
> **Title:** Buyer protection, and payouts you earn
> **Body:** Attendee funds are held safely until your event happens — so buyers know that if an event is cancelled, their refund is guaranteed. Organizers who build a track record of great events unlock fast payouts straight to their own Stripe account. Trust that works both ways.

**`/why` comparison row 2** — currently *"Eventbrite holds your money until after the event." → "We never touch your money…"* This backfires once you also hold new orgs. Replace the whole row with a brand/data-ownership jab (still 100% true):
> **Issue:** "Eventbrite puts their brand on your event and keeps your attendee list."
> **Answer:** "Your page, your logo, your attendees — the data is yours to keep."

**`/why` final-CTA line** — line ~198 drop any payout-timing promise; keep "Free events stay free forever. Paid events run at flat 5%."

### C. `/pricing` — [`pricing/page.tsx`](../src/app/(marketing)/pricing/page.tsx)
Data-driven from `PLANS`, so numbers are safe. Add one trust line near the plans:
> "Attendee funds are protected until your event happens — cancellations mean guaranteed refunds."

---

## The elevator pitch (for decks, bios, cold outreach)
> YourEvents is event ticketing for the organizers Eventbrite forgot — markets, festivals, fundraisers, community events. You keep more of every dollar (flat 5%, no attendee surcharges), you run tickets *and* vendors *and* check-in from one dashboard, and your event carries *your* brand, not ours. Buyers are protected — funds are held until the event happens — and organizers who deliver earn instant payouts. Pay $19 per event, or nothing at all for free events.
