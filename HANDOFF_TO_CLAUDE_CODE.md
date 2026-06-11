# Handoff to Claude Code — Your Events App

This file has two parts:

1. **Setup** — install Claude Code, point it at your repo, start a session.
2. **Handoff prompt** — paste this into the first message of a fresh Claude Code session so it picks up where Cowork left off.

---

## Part 1 — Setup

### 1.1 Install Claude Code

Requires Node.js 18+. Open PowerShell and run:

```
npm install -g @anthropic-ai/claude-code
```

Verify:

```
claude --version
```

### 1.2 Open the project in Claude Code

```
cd C:\Users\Daddy\Documents\Claude\Projects\Build an Event Registration Platform MVP\eventflow
claude
```

The first run will ask you to authenticate via browser. Once logged in, you'll get a prompt inside the project folder.

### 1.3 Local dev (so Claude Code can run/test things)

Create `.env.local` in the `eventflow` folder with the same values you have in Railway. At minimum:

```
DATABASE_URL=postgresql://...           # use Railway's connection string OR a local Postgres
REDIS_URL=redis://localhost:6379         # or your Railway Redis
JWT_SECRET=some-32-byte-random-string
JWT_ISSUER=yourevents
SESSION_COOKIE_NAME=eventflow_session
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
EMAIL_FROM=events@yourevents.app
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=...
NEXT_PUBLIC_GOOGLE_MAPS_KEY=...
```

Run:

```
npm install
npx prisma generate
npm run dev
```

App boots on `http://localhost:3000`.

### 1.4 Optional but recommended

- Install Stripe CLI (you started this earlier — finish via `winget install stripe.stripe-cli`) so Claude Code can forward webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- Add a `CLAUDE.md` at repo root so every session loads the conventions automatically. Claude Code reads it on launch. You can copy the "Conventions" section of the handoff prompt below into `CLAUDE.md`.

---

## Part 2 — Handoff prompt

Paste everything between the two horizontal rules into Claude Code as your first message.

---

You are picking up an in-flight project from a previous Cowork session. Read this brief carefully before doing any work.

**Project:** Your Events App — multi-tenant event registration SaaS at `www.yourevents.app`. Eventbrite competitor for organizations, nonprofits, clubs, conferences. Supports attendee tickets, vendor booth applications, QR check-in, organizer dashboard, platform admin.

**Repo & deploy:**
- GitHub: `bigrag2k8/Eventregistration` (branch `main`)
- Hosting: Railway project `EventReg` (auto-deploys from `main`)
- Services: web (Next.js), worker (reminder emails), Postgres, Redis
- Custom domain: `www.yourevents.app`

**Stack:**
- Next.js 14 App Router, React 18, TypeScript, Tailwind
- Prisma ORM against Postgres (uses `prisma db push` at boot — no migrations folder)
- ioredis for rate limiting
- JWT auth in HttpOnly cookies (`src/lib/auth.ts`), bcrypt (cost 12)
- Stripe + Stripe Connect Express (Destination Charges, 3.5% platform fee)
- Resend for transactional email
- Cloudinary for image uploads (unsigned preset, browser → CDN direct)

**Repo conventions you must follow:**
- Roles are `ATTENDEE | ORGANIZER | STAFF | VOLUNTEER | ADMIN | SUPERADMIN`. Gate routes with `requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession())` from `@/lib/auth`.
- For cross-org queries, use `orgScope(session)` (also from `@/lib/auth`). It returns `{}` for SUPERADMIN and `{ organizationId }` for everyone else. Spread it into Prisma `where` clauses.
- Plan limits live in `src/lib/plans.ts`. Gate event creation, campaigns, etc. via `requirePlanSelected(session)` and the `PLANS[org.subscriptionPlan]` map.
- Public org pages are `/o/[orgSlug]/events/[slug]`. Legacy `/events/[slug]` 307-redirects.
- Stripe Connect helpers are in `src/lib/connect.ts`:
  - `PLATFORM_FEE_PERCENT` (currently 3.5)
  - `platformFeeCents(amountCents)`
  - `connectChargeParams(org, totalCents)` → returns the `payment_intent_data` slice (destination + fee + on_behalf_of) or null if not Connect-ready
  - `canAcceptPayments(org)` → guard before any paid checkout
- Webhook handler at `src/app/api/webhooks/stripe/route.ts`. Handles `checkout.session.completed`, `charge.refunded`, `customer.subscription.*`, `invoice.payment_failed`, `account.updated`, `capability.updated`, `account.application.deauthorized`. **Adding new events?** Also register them in the Stripe Dashboard webhook config.
- Audit log: write to `prisma.auditLog` for any admin-significant action. Helper at `src/lib/audit.ts`.
- Reminder emails run in the worker service (`src/server/worker.ts`).

**Recent work shipped (commits on `main`):**
1. Phase A Connect onboarding (Express, deferred KYC `currently_due`, `business_type: individual`, MCC 7922, daily payouts)
2. Phase B Connect payment routing (attendee + vendor checkouts via Destination Charges with 3.5% application_fee_amount, block paid ticket types when org not Connect-ready, refund flow with `reverse_transfer: true, refund_application_fee: true`)
3. Upgrade-to-business endpoint at `/api/billing/connect/upgrade-to-business` (gated at $20K lifetime sales, SUPERADMIN can override)
4. Cloudinary banner uploads via `BannerImageInput` component (direct-to-CDN, never touches our server). Wired into create-event and event manage forms. Hero overlay on public event page.
5. Race-safe `finalizeVendor` (catches Prisma P2002, uses atomic updateMany for status flip)
6. `orgScope` helper rolled out across dashboard pages so SUPERADMIN sees events from any org
7. Homepage search above featured events (no duplicate cards when searching)
8. Factory reset endpoint at `/admin` (SUPERADMIN-only, `WIPE EVERYTHING` confirmation phrase)
9. KycBanner on dashboard overview when org has revenue but `payoutsEnabled=false`

**Dockerfile gotcha:** `NEXT_PUBLIC_*` env vars must be declared as `ARG` in the build stage and re-exported as `ENV` before `npm run build`, otherwise Next.js inlines them as `undefined`. Already done for `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`. **Add any new `NEXT_PUBLIC_*` var to the Dockerfile too** or it won't reach the client bundle.

**Pending / next up:**
- KYC reminder emails: cron logic exists in `src/server/worker.ts`; need to add: (a) when first ticket sells and `payoutsEnabled=false`, (b) when Stripe balance ≥ $100, (c) 7 days before event if still not verified.
- Sales tax + organizer-side payment fee toggles (`Event.taxRatePct`, `Event.passProcessingFee` already in schema but not wired into checkout math).
- Group ticket type kind (`TicketTypeKind.GROUP`) is in the schema but not implemented in registration math.
- Custom questions on registration (`CustomQuestion` / `CustomAnswer` schemas exist; UI not built).
- Photo gallery + speaker management UI (schemas exist).
- Promo codes UI (schema + relation exists; admin UI missing).

**How I work (please match):**
- Be concise. The user prefers terse responses, no preamble like "Let me…", no recap after each change.
- Read files before editing them. Always.
- Make file edits directly with the Edit / Write tools. Don't generate diffs in the chat for the user to copy-paste.
- After making changes, the user pushes from their Windows terminal. Don't try to `git push` yourself (no creds in sandbox). After committing locally, give them the exact 2-3 lines they need to run.
- Schema changes: edit `prisma/schema.prisma`. Container runs `prisma db push --accept-data-loss` at boot, so no migration file needed.
- For multi-step work, use the TodoWrite tool to track progress.

**First action when starting:**
1. `git status` and `git log -5 --oneline` so you know the current HEAD.
2. Skim `prisma/schema.prisma` so you know the data model.
3. Ask the user what they want to work on next — do not dive into a pending item unprompted.

Now wait for the user's first request.

---
