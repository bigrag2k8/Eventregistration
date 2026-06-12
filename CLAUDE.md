# CLAUDE.md — Your Events App

Auto-loaded by Claude Code at the start of every session. Read this before any work.

## Project

Multi-tenant event registration SaaS at `www.yourevents.app`. Eventbrite competitor.
Users: attendees, organizers, vendors, staff/volunteers, platform admin.

## Stack

- **Framework:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS
- **Database:** PostgreSQL via Prisma ORM. Container runs `prisma db push` at boot — no migrations folder. The `--accept-data-loss` flag was removed: additive changes still auto-apply, but a destructive change (column/model rename, type change, new required column) now FAILS the deploy instead of silently dropping data. Make destructive changes deliberately (run `db push --accept-data-loss` once by hand against the DB).
- **Cache / rate limit:** ioredis against Railway Redis
- **Auth:** JWT in HttpOnly cookies (`src/lib/auth.ts`), bcrypt (cost 12)
- **Payments:** Stripe + Stripe Connect Express. Destination Charges with `application_fee_amount`. Platform fee = **3.5%**.
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

Gate routes:
```ts
const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
```
from `@/lib/auth`.

### Cross-org queries
Use `orgScope(session)` from `@/lib/auth`. Returns `{}` for SUPERADMIN, `{ organizationId: session.orgId }` for everyone else:
```ts
where: { id: params.id, ...orgScope(session), deletedAt: null }
```

### Plan limits
- `src/lib/plans.ts` holds `PLANS` map (FREE, SINGLE_EVENT, STARTER, PRO, ENTERPRISE).
- `requirePlanSelected(session)` from `@/lib/plan-gate` gates dashboard pages.
- New signups land on `/dashboard/billing?welcome=1` until `planSelected=true`.

### URLs
- Public org pages: `/o/[orgSlug]`
- Public event pages: `/o/[orgSlug]/events/[slug]`
- Legacy `/events/[slug]` 307-redirects
- Use `org.slug` for public links; never expose `org.id`

### Stripe Connect (Phase B is live)
Helpers in `src/lib/connect.ts`:
- `PLATFORM_FEE_PERCENT` = **3.5**
- `platformFeeCents(amountCents)`
- `connectChargeParams(org, totalCents)` → returns `payment_intent_data` slice or `null` if not Connect-ready
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
  reverse_transfer: true,
  refund_application_fee: true,
});
```

### Deferred KYC
Connect onboarding uses `business_type: "individual"`, MCC 7922, daily payouts, and `collection_options.fields = "currently_due"` so orgs can list events and accept FREE registrations without ever finishing KYC. KYC banner on dashboard only fires when `totalRevenue > 0` (actual paid registrations exist) and `payoutsEnabled = false`.

### Webhooks
Single handler at `src/app/api/webhooks/stripe/route.ts`. Subscribed events:
`checkout.session.completed`, `charge.refunded`, `customer.subscription.*`, `invoice.payment_failed`, `account.updated`, `capability.updated`, `account.application.deauthorized`.

**Adding a new event?** Also register it in the Stripe Dashboard webhook config — the code listener alone isn't enough.

### Audit log
Write to `prisma.auditLog` for any admin-significant action via `audit()` from `@/lib/audit`. Categories: `event.publish`, `registration.refund`, `stripe_connect.account_created`, `platform.factory_reset`, etc.

### Reminder emails
Worker service runs `src/server/worker.ts`. Add new cron-style jobs there.

### Server actions: never throw on validation errors
Throwing from a server action surfaces as `Application error: Digest: ...` to the user — useless. Instead, `redirect` back with `?error=<reason>` and render an inline banner. Pattern:
```ts
if (endAt <= startAt) {
  redirect(`/dashboard/events/${event.id}?error=date_order`);
}
```

### Save confirmations
On successful update server actions, `redirect("?saved=1")` and render a green emerald banner from `searchParams.saved`. Without it, server actions complete silently and users think their save failed.

## Dockerfile gotcha — DO NOT FORGET

`NEXT_PUBLIC_*` env vars must be declared as `ARG` in the build stage of the Dockerfile and re-exported as `ENV` before `npm run build`, otherwise Next.js inlines them as `undefined` into the client bundle.

Already declared: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`.

If you add ANY new `NEXT_PUBLIC_*` var, update `Dockerfile` too.

## JWT_SECRET gotcha

Must be a **stable literal string** in Railway, NOT a `${{secret(...)}}` template. The template re-evaluates on every deploy → cookies invalidate → all users logged out. Worker service references the web's value via `${{56659692-...JWT_SECRET}}` — no separate change needed there.

## Working style

- **Be concise.** Terse responses, no preambles like "Let me…", no recaps after each change.
- **Read before editing.** Always.
- **Edit directly with Edit/Write.** Don't dump diffs in chat for the user to copy-paste.
- **The user pushes from their Windows terminal.** After committing locally, give them the exact 2-3 lines they need to run.
- **Schema changes:** edit `prisma/schema.prisma`. Container runs `db push` at boot, no migration file needed. Additive changes apply automatically. A DESTRUCTIVE change (rename, type change, new required column) will fail the deploy by design — flag it to the user so they can apply it deliberately rather than have data silently dropped.
- **Multi-step work:** use the TodoWrite tool to track progress.
- **No emojis** in code or files unless explicitly requested.

## First action when starting

1. `git status` and `git log -8 --oneline` so you know HEAD
2. Skim `prisma/schema.prisma` for the data model
3. Ask the user what they want to work on — don't dive into pending items unprompted

## What's already shipped (highlights)

- Self-serve signup with live slug availability check, suggestions, URL preview (`/api/auth/check-slug`)
- Plan-selected gate (new orgs locked to `/dashboard/billing` until they pick FREE or paid)
- Stripe Connect Phase A: Express onboarding with deferred KYC (`business_type: individual`, MCC 7922, daily payouts, `collection_options=currently_due`)
- Stripe Connect Phase B: attendee + vendor checkouts routed via Destination Charges with 3.5% application fee; refunds use `reverse_transfer + refund_application_fee`; paid ticket types blocked when org not Connect-ready
- Cloudinary banner uploads via `BannerImageInput` (direct browser→CDN, never touches server)
- Public event landing page with hero overlay
- Homepage search above featured events (no duplicate cards)
- Private event toggle (hides from public listings, direct link still works)
- Factory reset endpoint (`/admin`, SUPERADMIN-only, "WIPE EVERYTHING" confirmation)
- Audit log UI (`/dashboard/audit` and `/admin/audit`)
- Reminder-email worker on Railway
- Email broadcasts per plan (campaigns at `/dashboard/events/[id]/campaigns`)
- KYC banner that ONLY shows when actual paid revenue is waiting (not on free events)
- "Changes saved" emerald banner on event manage page
- "End must be after start" inline error instead of crash page
- ◀ Dashboard back-link on every dashboard subpage
- Free plan activation button correct on first-time billing page

## Pending / next up

- KYC reminder emails (first-paid-ticket-sold, balance ≥ $100, T-7d before event)
- Sales tax + processing fee toggles wired into checkout math (`Event.taxRatePct`, `Event.passProcessingFee` exist on schema, not used)
- Group ticket type kind (schema has it, registration math doesn't)
- Custom questions UI (schema has `CustomQuestion` / `CustomAnswer`)
- Photo gallery + speaker management UI
- Promo codes UI
