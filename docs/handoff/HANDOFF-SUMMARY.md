# Handoff Summary — Your Events App

> A comprehensive starting context for a new development session.
> **Project:** Your Events App (formerly EventFlow / AITS Events) — multi-tenant event registration SaaS at `www.yourevents.app`.

---

## Project Overview

A multi-tenant event registration, ticketing, and check-in SaaS platform.
- **Production URL today:** `https://web-production-fd7f.up.railway.app` (Railway-provided)
- **Target domain:** `https://www.yourevents.app` (DNS cutover pending)
- **Brand display name:** "Your Events App"
- **Contact email:** `events@yourevents.app` (Resend domain verification pending)
- **Business model:** sell single-tenant deployments to enterprise + run multi-tenant SaaS with Free / Single Event / Starter / Pro / Enterprise plans.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend / Backend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Database | PostgreSQL via Prisma ORM (uses `prisma db push` at startup — no migration files) |
| Cache / rate-limit | Redis (ioredis) |
| Auth | JWT in HttpOnly cookies, bcrypt password hashing (cost 12) |
| Payments | Stripe (test sandbox `acct_1TgM51GUh2HvGphW`) |
| Email | Resend (sender currently `AITS-Events@automateditsolutions.net`, switching to `events@yourevents.app`) |
| Maps | Google Maps Embed API |
| Hosting | Railway, project `EventReg` (`d8571273-0cb8-4295-93b0-feac115ae71c`), web service `56659692-be0e-4a1e-950f-c6a30c53bb66` |
| Repo | `github.com/bigrag2k8/Eventregistration` (main branch) |
| Backup | tag `v1.0-single-tenant` + branch `legacy/v1` |

## Roles

`ATTENDEE` · `VOLUNTEER` · `STAFF` · `ORGANIZER` · `ADMIN` (org-scoped) · `SUPERADMIN` (platform-wide).

**Demo accounts** (all password `password123`):
- `admin@example.com` — SUPERADMIN
- `organizer@example.com` — ORGANIZER (Acme Events org)
- `staff@example.com` — STAFF
- `attendee@example.com` — ATTENDEE

## Major Architectural Decisions

1. **Multi-tenant via Organization table.** Every user, event, registration, and payment is scoped by `organizationId`. JWT session carries `orgId`; every query filters on it.
2. **Path-based per-org URLs** at `/o/[orgSlug]/events/[slug]`. Old `/events/[slug]` URLs auto-redirect to org-scoped paths. Event slugs are **unique per-org**, not globally — composite `@@unique([organizationId, slug])`.
3. **Invite-only signup.** Self-serve `/signup` is disabled — shows "Contact us." New orgs created by SUPERADMIN at `/admin/orgs/new` (sends invite email) OR organizers invite their own team at `/dashboard/team/invite`.
4. **PendingInvite + EventAssignment models.** Invites can be org-wide OR scoped to a specific event. Accepted invites with `eventId` create `EventAssignment` rows. Staff/Volunteers with assignments only see their assigned events in the check-in picker.
5. **Per-org branding via CSS variables.** `OrgBrandStyle` component injects `--org-brand` color; logos and brand color cascade to public pages and emails.
6. **Vendor flow is separate from attendee registration.** `/events/[slug]/vendors` collects applications; organizer approves with custom quoted price; magic-link Stripe checkout finalizes. Auto-creates a hidden "Vendor Booth" ticket type per event.
7. **Plan limits enforced at event create-time.** Free = 1 event/month, 50 reg per event; Starter = 3/mo; Pro = unlimited. Single Event credits decrement when an over-limit event is created.
8. **Stripe webhook is the source of truth for subscription state.** `customer.subscription.created/updated/deleted` + `invoice.payment_failed` events update `Organization.subscriptionPlan` / `subscriptionStatus`.

## Database Schema (Prisma) — Key Models

`Organization`, `User`, `Event`, `EventLocation`, `Speaker`, `EventTag`, `TicketType`, `CustomQuestion`/`CustomAnswer`, `Registration`, `Ticket`, `Payment`, `CheckIn`, `PromoCode`, `ReferralLink`/`ReferralClick`, `Waitlist`, `EmailCampaign`/`EmailLog`, `AbandonedCart`, `AuditLog`, `VendorApplication`, **`PendingInvite`** (has optional `eventId` for event-scoped invites), **`EventAssignment`**.

Enums: `Role`, `EventStatus`, `RegistrationStatus`, `TicketTypeKind`, `PaymentStatus`, `DiscountType`, `QuestionType`, `EmailKind`, `EmailStatus`, `WaitlistStatus`, `VendorApplicationStatus`, `InviteStatus`, **`SubscriptionPlan`**, **`SubscriptionStatus`**.

**`Organization` columns:** branding (logoUrl, bannerUrl, brandColor, tagline, aboutBlurb, fromEmail, fromName), billing (stripeCustomerId, subscriptionPlan, subscriptionStatus, stripeSubscriptionId, subscriptionCurrentPeriodEnd, subscriptionCancelAtPeriodEnd, singleEventCredits), vendor defaults (defaultVendorPriceCents, vendorRegistrationEnabled, vendorApplicationNotes).

## What's Built (feature inventory)

- **Public**: branded org pages (`/o/[slug]`), event landing pages, registration form with custom questions/promo codes, success page with QR + ICS, vendor application page, magic-link vendor checkout.
- **Organizer dashboard**: event create/edit/publish, ticket type CRUD, registrations list with search/filter/cancel/delete, CSV export, vendor approval with custom pricing, team management (Volunteer/Staff/Organizer roles with per-event assignments), org settings (branding + custom email sender), billing page with plan picker + Stripe Checkout + Customer Portal.
- **Staff/Volunteer check-in PWA**: event picker (assignment-filtered), camera scanner, manual paste, **find-attendee drawer with one-click check-in by name**, color-coded results.
- **Platform Admin (`/admin`)**: overview KPIs, invite-new-organization flow, invites list with resend/revoke.

## Stripe — Plans Configured (test mode)

| Plan | Price | Stripe Product ID | Stripe Price ID |
|---|---|---|---|
| Free | $0 | n/a | n/a |
| Single Event | $19 one-time | `prod_UfjF28AlMFLi3W` | `price_1TgNn4GUh2HvGphW681dH3kx` |
| Starter | $24.99/mo | `prod_UfjFBxyHLt5mv9` | `price_1TgNn5GUh2HvGphWGBVl8PHW` |
| Pro | $29/mo | `prod_Ufj0whb9W9BNt7` | `price_1TgNYYGUh2HvGphWcQuMhzwf` |
| Enterprise | Contact us | mailto only | — |

## Issues Encountered & Resolutions

- **Railway CVE check** blocked old Next.js → bumped to 14.2.35.
- **Prisma libssl errors on Alpine** → switched Dockerfile to `node:20-slim` (Debian).
- **Container exited silently** → moved startup into `npm start` script with explicit host/port: `prisma db push && next start -H 0.0.0.0 -p $PORT`.
- **Resend constructor threw at build time** → made client lazy-init.
- **TS errors after slug uniqueness change** → updated `event.findUnique({ where: { slug } })` calls to use composite `organizationId_slug` key.
- **Server-component onClick crash** → extracted to client components (`ConfirmButton`, `CopyButton`, `BillingActions`, `OrgNameSlugFields`).
- **Cache mount IDs rejected by Railway BuildKit** → reverted to non-cached Dockerfile.
- **Cross-tenant event collisions** → Event.slug now unique per-org, not globally.

## Last Known State (where we left off)

**Most recent task: rebrand to "Your Events App" + `yourevents.app`.**

All visible "AITS Events" and "Automated I.T. Solutions Events APP" strings in source replaced with **"Your Events App"**; email references replaced with `events@yourevents.app`. Stripe products renamed. Single Event and Starter products were freshly created and the real price IDs written into `plans.ts`.

User pushed the rebrand commit (`a7993042d335fc7c24c261087e70772a1a389561`) but **the latest deploy FAILED**.

### Last Known Error

Build failure on `2026-06-09T11:28` at `src/app/api/billing/checkout/route.ts:22:24`:

> Type error: Property 'stripeCustomerId' does not exist on type Organization.

**Root cause hypothesis:** the Phase 3 schema changes (adding `stripeCustomerId`, `subscriptionPlan`, etc. to Organization) were not part of the rebrand commit. The user may have only `git add src/`'d, leaving `prisma/schema.prisma` uncommitted. The Prisma client on Railway was regenerated against the OLD schema, so the new fields don't exist on the TypeScript type.

### Resolution in progress

Last action was telling the user to run:
```powershell
cd "C:\Users\Daddy\Documents\Claude\Projects\Build an Event Registration Platform MVP\eventflow"
git status
```
Then either `git add -A && git commit && git push` (if schema is uncommitted) or an empty commit to force rebuild (if schema is already pushed).

**Waiting for user to run that command and paste the output.**

## Open / Next Steps

After the deploy issue is resolved:

1. **Push the rebrand commit successfully** + verify build passes
2. **Manual cutover to yourevents.app:**
   - Verify `yourevents.app` in Resend (DNS records: SPF + DKIM + MX)
   - Update Railway env var `EMAIL_FROM` = `Your Events App <events@yourevents.app>`
   - Add `www.yourevents.app` as a custom domain in Railway → update CNAME at registrar
   - Update Railway env var `NEXT_PUBLIC_APP_URL` = `https://www.yourevents.app`
   - Add `https://www.yourevents.app/*` to Google Maps API HTTP referrer restrictions
   - Update Stripe webhook URL to `https://www.yourevents.app/api/webhooks/stripe`
3. **Stripe webhook setup** in dashboard (events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed`, `charge.refunded`). Copy signing secret → update `STRIPE_WEBHOOK_SECRET` env var.
4. **End-to-end test** of upgrade flow with test card `4242 4242 4242 4242`.
5. **Regenerate User Guide + Features Overview docx** with new "Your Events App" branding (current versions still say AITS).

### Bigger items still open

- **Phase 4** — custom domains per org, "move to dedicated instance" upsell
- **Stripe for paid attendee tickets** (code wired, just needs live keys)
- **Deploy the reminder-email worker** (`src/server/worker.ts` exists, not deployed)
- **Self-service refunds** for attendees via magic link
- **Audit log UI** (logs being written, no viewer)
- **Apple/Google Wallet `.pkpass` tickets**

## Key Files to Read First

### Schema & core libraries
- `eventflow/prisma/schema.prisma` — **full DB model** (Organization with billing/branding, PendingInvite with eventId, EventAssignment, VendorApplication, SubscriptionPlan/Status enums)
- `eventflow/src/lib/plans.ts` — plan catalog with real Stripe price IDs
- `eventflow/src/lib/db.ts`, `src/lib/auth.ts`, `src/lib/stripe.ts`, `src/lib/invites.ts`, `src/lib/email.ts`
- `eventflow/src/middleware.ts` — RBAC enforcement for `/dashboard`, `/checkin`, `/admin`

### Billing (Phase 3, currently failing build)
- `eventflow/src/app/dashboard/billing/page.tsx` — plan picker UI
- `eventflow/src/app/api/billing/checkout/route.ts` — Stripe Checkout creation **(failing build here)**
- `eventflow/src/app/api/billing/portal/route.ts` — Customer Portal link
- `eventflow/src/server/billing.ts` — webhook handler logic
- `eventflow/src/app/api/webhooks/stripe/route.ts` — Stripe event router

### Multi-tenant routes
- `eventflow/src/app/o/[orgSlug]/page.tsx` — org public page
- `eventflow/src/app/o/[orgSlug]/events/[slug]/page.tsx` — event landing
- `eventflow/src/app/events/[slug]/page.tsx` — legacy redirect to org-scoped URL

### Admin / team / invites
- `eventflow/src/app/admin/page.tsx`
- `eventflow/src/app/admin/orgs/new/page.tsx` + `actions.ts`
- `eventflow/src/app/admin/invites/page.tsx` + `actions.ts`
- `eventflow/src/app/dashboard/team/page.tsx` + `actions.ts` + `invite/page.tsx`
- `eventflow/src/app/invite/[token]/page.tsx`
- `eventflow/src/app/api/invite/accept/route.ts`
- `eventflow/src/app/dashboard/settings/page.tsx` + `actions.ts`

### Vendor flow
- `eventflow/src/app/o/[orgSlug]/events/[slug]/vendors/page.tsx`
- `eventflow/src/app/dashboard/events/[id]/vendors/page.tsx` + `actions.ts`
- `eventflow/src/server/vendors.ts`

### Check-in
- `eventflow/src/app/checkin/page.tsx` — event picker (assignment-filtered)
- `eventflow/src/app/checkin/[eventId]/page.tsx`
- `eventflow/src/components/CheckinScanner.tsx`
- `eventflow/src/app/api/checkin/route.ts`
- `eventflow/src/app/api/checkin/manual/route.ts`
- `eventflow/src/app/api/checkin/attendees/route.ts`

### Branding helpers
- `eventflow/src/components/OrgBrandStyle.tsx` — CSS variable injector
- `eventflow/src/components/OrgNameSlugFields.tsx` — auto-slug input

### Files just rebranded
`src/app/layout.tsx`, `src/app/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/billing/page.tsx`, `src/app/checkin/page.tsx`, `src/app/dashboard/settings/page.tsx`, `src/app/dashboard/team/page.tsx`, `src/app/invite/[token]/page.tsx`, `src/app/signup/page.tsx`, `src/lib/invites.ts`, `src/lib/email.ts`, `src/app/dashboard/events/[id]/vendors/actions.ts`, `src/server/worker.ts`, `src/app/api/registrations/[id]/ics/route.ts`, `src/app/api/auth/signup/route.ts`.

### Existing deliverables (need re-branding to "Your Events App")
- `Build an Event Registration Platform MVP/AITS-Events-APP-User-Guide.docx`
- `Build an Event Registration Platform MVP/AITS-Events-APP-Features-Overview.docx` (v1)
- `Build an Event Registration Platform MVP/AITS-Events-APP-Features-Overview-v2.docx`

## Resume Cue for Next Session

The user is mid-debugging a failed Railway deploy. Their last instruction was to run `git status` in PowerShell to determine whether `prisma/schema.prisma` is uncommitted.

**Possible next user inputs:**
- "git status shows prisma/schema.prisma is modified" → tell them to `git add -A && git commit -m "Phase 3 schema" && git push`
- "nothing to commit" → tell them to do an empty commit to force a rebuild: `git commit --allow-empty -m "Force rebuild" && git push`
- "I pushed it" → check Railway status via MCP tool, then if still failing pull build logs

After the deploy succeeds, the next user-facing steps in priority order:
1. Manually configure DNS + Resend + Stripe webhook for `yourevents.app` cutover (5 manual steps)
2. Regenerate the `.docx` deliverables with the new brand
3. Then either Phase 4 (custom domains) or remaining roadmap items
