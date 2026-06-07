# EventFlow — Security & Compliance

## Authentication
- JWT (HS256) signed with `JWT_SECRET` ≥ 32 bytes.
- Stored in `HttpOnly; Secure; SameSite=Lax` cookie.
- 7-day expiry; long-lived refresh tokens stored in `sessions` table for forced logout.
- Passwords hashed with bcrypt cost 12.
- Email verification gated behind a single-use signed token.
- Magic-link self-service for attendees (no password needed).

## Authorization (RBAC)
- Roles: `ATTENDEE`, `STAFF`, `ORGANIZER`, `ADMIN`.
- `requireRole()` helper in every protected API route.
- Middleware enforces auth on `/dashboard/**`, `/checkin/**`, `/api/admin/**`.
- Org isolation: every query filters by `organizationId` from the session.

## PCI Compliance
- Card data never touches our server.
- Stripe-hosted Checkout (SAQ-A scope).
- Webhook signatures validated with `STRIPE_WEBHOOK_SECRET`.

## Input Validation
- Zod schemas on every API route and Server Action input.
- Email duplicate prevention via unique constraint `(event_id, email)`.
- File uploads: pre-signed S3 PUT URLs with allow-listed content types and ≤10MB cap.

## Rate Limiting
- Sliding-window Redis token bucket per IP+endpoint.
- Auth: 20/min sign-in, 10/min sign-up.
- Check-in: 120 scans/min/staff.
- Webhooks excluded (already signed).

## CSRF
- Same-site cookies + state-changing requests require POST with JSON content-type (browsers block cross-origin JSON POST without CORS approval).
- Form submissions inside `/dashboard` use Server Actions with built-in CSRF protection.

## Headers (set in Caddy/Nginx and Next.js)
- `Strict-Transport-Security` (1y, preload).
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Content-Security-Policy` — restrict to self + Stripe, Resend, Google Maps domains.
- `Permissions-Policy: camera=(self), geolocation=()`.

## Audit Logging
- Every mutation by an authenticated staff/organizer/admin writes to `audit_logs`:
  - actor user id, IP, action verb, target type/id, metadata diff.
- Surfaced in admin UI; retained 18 months by default.

## GDPR
- DSR endpoints:
  - `POST /api/users/me/export` — JSON dump of all personal data.
  - `DELETE /api/users/me` — soft-delete + scheduled purge after 30 days.
- Marketing emails always include unsubscribe link → updates `users.emailOptOut`.
- Cookie consent banner (Phase 1 polish) for EU traffic.
- Data residency note in privacy policy.

## Secrets
- `.env` files git-ignored.
- Production secrets stored in platform vault (Vercel/Railway/Doppler).
- Never log secret values; redactor middleware on Pino logger.

## Dependencies
- `npm audit` in CI; Renovate / Dependabot for upgrades.
- Pinned major versions; tested upgrades via PR.

## Backups & Recovery
- Daily encrypted Postgres snapshot to S3 with 30-day retention.
- Quarterly restore drill.
- Stripe is system-of-record for payments — DB loss does not lose financial records.

## Incident response
- `SECURITY.md` discloses email + PGP key.
- 72-hour breach notification policy (GDPR-aligned).
- Pager rotation via PagerDuty (Phase 2 once team > 3).
