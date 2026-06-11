# CLAUDE.md — Your Events App

This file is auto-loaded by Claude Code at the start of every session. Read it before any work.

## Project

Multi-tenant event registration SaaS at `www.yourevents.app`. Eventbrite competitor.
Users: attendees, organizers, vendors, staff/volunteers, platform admin.

## Stack

- **Framework:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS
- **Database:** PostgreSQL via Prisma ORM. The container runs `prisma db push --accept-data-loss` at boot — no migrations folder.
- **Cache / rate limit:** ioredis against Railway Redis
- **Auth:** JWT in HttpOnly cookies (`src/lib/auth.ts`), bcrypt (cost 12)
- **Payments:** Stripe + Stripe Connect Express. Destination Charges with `application_fee_amount`.
- **Email:** Resend
- **Images:** Cloudinary, browser → CDN direct via unsigned upload preset

## Deploy

- **Repo:** `bigrag2k8/Eventregistration`, branch `main`
- **Hosting:** Railway project `EventReg`. Auto-deploys from `main`.
- **Services:** `web` (Next.js), `worker` (reminder/email cron), Postgres, Redis
- **Public domain:** `www.yourevents.app`

## Conventions you MUST follow

### Roles
`ATTENDEE | ORGANIZER | STAFF | VOLUNTEER | ADMIN | SUPERADMIN`.

Gate routes with:
```ts
const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
```
from `@/lib/auth`.

### Cross-org queries
Use `orgScope(session)` from `@/lib/auth`. Returns `{}` for SUPERADMIN, `{ organizationId: session.orgId }` for everyone else. Spread into Prisma `where`:
```ts
where: { id: params.id, ...orgScope(session), deletedAt: null }
```

### Plan limits
- `src/lib/plans.ts` holds `PLANS` map.
- `requirePlanSelected(session)` from `@/lib/plan-gate` gates dashboard pages.
- Enforce per-event and per-month limits in server actions before creating resources.

### URLs
- Public org/event pages live at `/o/[orgSlug]/events/[slug]`.
- Legacy `/events/[slug]` 307-redirects.
- Use `org.slug` for public links; never expose `org.id`.

### Stripe Connect (Phase B is live)
Helpers in `src/lib/connect.ts`:
- `PLATFORM_FEE_PERCENT` (currently **3.5**)
- `platformFeeCents(amountCents)`
- `connectChargeParams(org, totalCents)` → returns `payment_intent_data` slice (destination + fee + on_behalf_of) or `null` if org isn't Connect-ready
- `canAcceptPayments(org)` → guard before ANY paid checkout

Pattern in checkout routes:
```ts
const connect = connectChargeParams(org, total);
if (!connect) return error503("Organizer hasn't finished payouts.");
const session = await stripe.checkout.sessions.create({
  ...,
  payment_intent_data: { metadata: {...}, ...connect },
});
```

Refunds MUST use:
```ts
await stripe.refunds.create({
  payment_intent: pi,
  reverse_transfer: true,        // claw funds from connected account
  refund_application_fee: true,   // refund our 3.5% proportionally
});
```

### Webhooks
Single handler at `src/app/api/webhooks/stripe/route.ts`. Currently subscribes to:
`checkout.session.completed`, `charge.refunded`, `customer.subscription.*`, `invoice.payment_failed`, `account.updated`, `capability.updated`, `account.application.deauthorized`.

**Adding a new event?** Also register it in the Stripe Dashboard webhook config — the code listener alone isn't enough.

### Audit log
Write to `prisma.auditLog` for any admin-significant action via `audit()` from `@/lib/audit`. Categories: `event.publish`, `registration.refund`, `stripe_connect.account_created`, `platform.factory_reset`, etc.

### Reminder emails
The worker service runs `src/server/worker.ts`. Add new cron-style jobs there.

## Dockerfile gotcha — DO NOT FORGET

`NEXT_PUBLIC_*` env vars must be declared as `ARG` in the build stage of the Dockerfile and re-exported as `ENV` before `npm run build`, otherwise Next.js inlines them as `undefined` into the client bundle.

Already declared: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`.

If you add ANY new `NEXT_PUBLIC_*` var, update `Dockerfile` too.

## Working style

- **Be concise.** Terse responses, no preambles like "Let me…", no recaps after each change. User reads diffs.
- **Read before editing.** Always.
- **Edit directly with Edit/Write.** Don't dump diffs in chat for the user to copy-paste.
- **The user pushes from their Windows terminal**, not from any agent. After committing locally, give them the exact 2-3 lines they need to run.
- **Schema changes:** edit `prisma/schema.prisma`. Container runs `db push` at boot, no migration file needed.
- **Multi-step work:** use the TodoWrite tool to track progress.
- **No emojis** in code or files unless explicitly requested.

## First action when starting

1. `git status` and `git log -5 --oneline` so you know HEAD
2. Skim `prisma/schema.prisma` for the data model
3. Ask the user what they want to work on — don't dive into pending items unprompted

## Pending / next up

- KYC reminder emails (first-ticket-sold, balance ≥ $100, T-7d before event)
- Sales tax + processing fee toggles wired into checkout math (`Event.taxRatePct`, `Event.passProcessingFee` exist on schema, not used)
- Group ticket type kind (schema has it, registration math doesn't)
- Custom questions UI (schema has `CustomQuestion` / `CustomAnswer`)
- Photo gallery + speaker management UI
- Promo codes UI
