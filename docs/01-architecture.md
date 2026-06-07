# EventFlow — System Architecture

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENT TIER                              │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────────┐   │
│  │ Public Event  │  │  Organizer    │  │  Check-In Scanner  │   │
│  │   Site (SSR)  │  │  Dashboard    │  │  (PWA, mobile)     │   │
│  └───────┬───────┘  └───────┬───────┘  └─────────┬──────────┘   │
└──────────┼──────────────────┼─────────────────────┼─────────────┘
           │                  │                     │
           └──────────────────┼─────────────────────┘
                              ▼
           ┌──────────────────────────────────────┐
           │   Next.js Edge / Node Runtime         │
           │  ┌────────────────────────────────┐  │
           │  │  App Router (RSC + Client)     │  │
           │  │  API Routes (REST)             │  │
           │  │  Middleware (auth, rate-limit) │  │
           │  └────────────────────────────────┘  │
           └──────┬───────────┬──────────┬────────┘
                  │           │          │
       ┌──────────▼──┐  ┌─────▼─────┐  ┌─▼──────────┐
       │ PostgreSQL  │  │  Redis    │  │  Object    │
       │ (Prisma)    │  │ (cache,   │  │  Storage   │
       │             │  │  rate-    │  │  (R2/S3)   │
       │             │  │  limit,   │  │            │
       │             │  │  queues)  │  │            │
       └─────────────┘  └───────────┘  └────────────┘
                  │
        ┌─────────┼─────────┬──────────┬───────────┐
        ▼         ▼         ▼          ▼           ▼
   ┌────────┐ ┌──────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │ Stripe │ │Resend│ │ Google │ │  QR    │ │Sentry/ │
   │        │ │      │ │  Maps  │ │ Codes  │ │PostHog │
   └────────┘ └──────┘ └────────┘ └────────┘ └────────┘
```

## Layers

### 1. Presentation Layer
- **Public site** — server-rendered event listings and landing pages (SEO-friendly).
- **Organizer dashboard** — client-side React with server actions for mutations.
- **Check-in scanner** — Progressive Web App; uses `getUserMedia` for camera, works offline with IndexedDB queue.

### 2. Application Layer (Next.js)
- App Router pages handle UI.
- API routes (`/api/*`) handle REST endpoints for mobile clients and integrations.
- Server Actions handle form submissions inside the dashboard.
- Middleware enforces auth (JWT cookie), rate limiting, and CSRF.

### 3. Service Layer (`src/server/`)
Pure functions and classes grouped by domain:
- `events.service.ts`
- `registrations.service.ts`
- `tickets.service.ts`
- `payments.service.ts`
- `checkin.service.ts`
- `email.service.ts`
- `qr.service.ts`
- `waitlist.service.ts`
- `referrals.service.ts`

### 4. Data Layer
- **PostgreSQL 16** — single source of truth via Prisma.
- **Redis** — rate-limiting, idempotency keys, abandoned-cart tracking, queue backing.
- **Object storage** — banner images, speaker photos, gallery, receipts.

### 5. External Integrations
| Service       | Purpose                                |
|---------------|----------------------------------------|
| Stripe        | Card / Apple Pay / Google Pay, refunds |
| Resend        | Transactional email + scheduled blasts |
| Google Maps   | Embed + Places autocomplete            |
| Twilio (P2)   | SMS reminders                          |
| Sentry        | Error tracking                         |
| PostHog       | Product analytics                      |

## Request Flows

### Attendee registration (paid)
1. `GET /events/:slug` → SSR landing page.
2. User selects tickets → `POST /api/cart` creates a pending Registration in DB with `status=PENDING` and 15-min TTL.
3. Frontend → `POST /api/checkout/session` creates Stripe Checkout Session.
4. Stripe redirects user back to `/events/:slug/success?session_id=…`.
5. **Stripe webhook** `checkout.session.completed` flips Registration to `CONFIRMED`, issues QR codes, enqueues confirmation email.
6. Resend delivers email with QR + .ics attachment.

### Check-in
1. Staff scans QR → frontend decodes JWT.
2. `POST /api/checkin` validates signature + DB lookup.
3. Returns `{ status: CHECKED_IN | ALREADY_USED | INVALID }`.
4. Updates `checkins` row, broadcasts via Pusher channel for real-time dashboard.

## Security

| Concern              | Mitigation                                                  |
|----------------------|-------------------------------------------------------------|
| Auth                 | JWT in `HttpOnly; Secure; SameSite=Lax` cookies             |
| Passwords            | bcrypt @ cost 12                                            |
| PCI                  | Stripe-hosted Checkout — no card data ever touches our box  |
| CSRF                 | Double-submit cookie + same-site enforcement                |
| Rate limiting        | Redis token bucket (`/api/auth/*`, `/api/checkin`)          |
| Input validation     | Zod schemas at every API boundary                           |
| File uploads         | Pre-signed S3 URLs, content-type whitelist, max 10 MB       |
| SQL injection        | Prisma parameterized queries only                           |
| QR fraud             | Signed JWT payload, single-use enforced at DB layer          |
| Audit logging        | `audit_logs` table on every mutation by organizer/staff     |
| GDPR                 | Export & delete endpoints, soft-delete with 30-day purge     |

## Scaling Considerations

- All Next.js routes are stateless → horizontally scalable behind a load balancer.
- Prisma uses pgBouncer-friendly connection pooling.
- Long jobs (email blasts, waitlist promotion) run via BullMQ workers on Redis.
- Static assets served from CDN.
- Read replicas wired in via `DATABASE_URL_REPLICA` for the dashboard's analytics queries.

## Observability

- **Sentry** for client + server errors.
- **PostHog** for funnel analytics (event view → cart → purchase).
- **Pino** structured logs shipped to your provider of choice (Datadog/Loki).
- **Health endpoint** `/api/health` checks DB + Redis + Stripe ping.
