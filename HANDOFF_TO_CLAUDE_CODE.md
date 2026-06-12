# Handoff to Claude Code — Your Events App

Two parts:

1. **Setup steps** — install Claude Code + VSCode extensions
2. **Handoff prompt** — paste this as the first message in a fresh Claude Code session

---

## Part 1 — Setup

### 1.1 Pull the latest from GitHub

```
cd "C:\Users\Daddy\Documents\Claude\Projects\Build an Event Registration Platform MVP\eventflow"
git pull
```

This gets you `CLAUDE.md`, `.env.example`, `.vscode/`, this file, and everything else built so far.

### 1.2 Install Claude Code

Requires Node.js 18+. In PowerShell:

```
npm install -g @anthropic-ai/claude-code
claude --version
```

### 1.3 Open in VSCode + install recommended extensions

```
code .
```

VSCode will prompt to install the recommended extensions from `.vscode/extensions.json` (Claude Code, Prisma, Tailwind IntelliSense, ESLint, Prettier, Stripe, Docker, etc.). Click **Install All**.

### 1.4 Local env

```
copy .env.example .env.local
```

Open `.env.local` and fill in values from Railway → EventReg → web service → Variables. At minimum:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Railway Postgres public connection string, OR local postgres |
| `REDIS_URL` | Railway Redis public URL, OR `redis://localhost:6379` |
| `JWT_SECRET` | Same literal value you set in Railway (must match prod) |
| `JWT_ISSUER` | `yourevents` |
| `SESSION_COOKIE_NAME` | `eventflow_session` |
| `STRIPE_SECRET_KEY` | https://dashboard.stripe.com/test/apikeys |
| `STRIPE_PUBLISHABLE_KEY` | same page |
| `STRIPE_WEBHOOK_SECRET` | from `stripe listen` (see 1.6) |
| `RESEND_API_KEY` | https://resend.com/api-keys |
| `EMAIL_FROM` | `events@yourevents.app` |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard top of page |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Cloudinary → Settings → Upload presets |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Google Cloud Console |

### 1.5 Boot the app

```
npm install
npx prisma generate
npm run dev
```

App on http://localhost:3000.

### 1.6 Stripe CLI for local webhooks

```
winget install stripe.stripe-cli
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The `whsec_...` it prints goes into `.env.local` as `STRIPE_WEBHOOK_SECRET`.

### 1.7 Start Claude Code

From the same folder:

```
claude
```

First run prompts you to authenticate in browser. Claude Code auto-loads `CLAUDE.md` on every start — you don't need to re-paste conventions.

### 1.8 Paste the handoff prompt (one time, first message)

Copy everything between the two horizontal rules in Part 2 below and paste as your first message. After this, every future session just needs you to type what you want to build.

---

## Part 2 — Handoff prompt

Paste the block below into Claude Code as your first message.

---

You are picking up an in-flight project. `CLAUDE.md` at the repo root has the full conventions — read it before any work.

**Project at a glance:** Your Events App, a multi-tenant event registration SaaS at `www.yourevents.app`. Eventbrite competitor. Multi-org with attendees, organizers, vendors, staff/volunteers, and a platform admin role.

**Where things stand right now:**
- Repo: `bigrag2k8/Eventregistration` (main branch), Railway project `EventReg` auto-deploys from main, custom domain `www.yourevents.app` live
- Stripe Connect Phase A (Express onboarding with deferred KYC, business_type=individual, MCC 7922, daily payouts) AND Phase B (attendee + vendor checkouts via Destination Charges with 3.5% application_fee_amount, refunds with reverse_transfer + refund_application_fee, paid ticket types blocked when org not Connect-ready) are shipped
- Cloudinary banner uploads working (direct browser→CDN), Cloudinary env vars set in Railway and in the Dockerfile build stage as ARGs
- JWT_SECRET on Railway is a stable literal (not `${{secret()}}` — that would log everyone out on each deploy)
- Self-serve signup with live slug availability check at `/api/auth/check-slug`
- Plan-selected gate locks new orgs to `/dashboard/billing` until they pick FREE or paid; FREE activation works on first-time billing page
- KYC banner only fires when actual paid revenue is waiting (free events do not trigger it)
- Private event toggle on Event (hides from homepage + org public page; direct link still works)
- Factory reset endpoint on `/admin` (SUPERADMIN-only, "WIPE EVERYTHING" confirmation phrase)
- Audit log UI at `/dashboard/audit`
- Reminder-email worker deployed on Railway as service `worker`
- "Changes saved" emerald banner on event manage form; date-order errors render as inline red banners instead of the Next.js crash page

**Pending / good candidates for next work** (don't start any of these without my OK):
- KYC reminder emails (first-paid-ticket-sold; balance ≥ $100; T-7d before event)
- Sales tax + processing fee toggles wired into checkout math (schema has `Event.taxRatePct` + `Event.passProcessingFee`, currently ignored)
- Group ticket type kind (schema has `TicketTypeKind.GROUP`, registration math doesn't)
- Custom questions UI (schemas `CustomQuestion` and `CustomAnswer` exist)
- Photo gallery + speaker management UI (schemas exist)
- Promo codes UI

**Working style I expect:**
- Be concise. No "Let me…" preambles. No recaps after every change.
- Read files before editing. Always.
- Edit directly with Edit/Write — don't dump diffs in chat for me to copy-paste.
- I push to GitHub from my own Windows terminal — you don't have credentials. After committing locally, give me the exact 2–3 lines to run.
- Schema changes: edit `prisma/schema.prisma`. The Railway container runs `prisma db push --accept-data-loss` at boot — no migration file needed.
- Use TodoWrite for any multi-step work.
- No emojis in code or files unless I ask.

**First action when you start:**
1. Run `git status` and `git log -8 --oneline` so you see HEAD
2. Skim `prisma/schema.prisma` for the data model
3. Ask me what I want to work on. Don't pick from the pending list unprompted.

Now wait for my next message.

---
