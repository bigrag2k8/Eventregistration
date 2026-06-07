# EventFlow — API Reference

All endpoints return JSON. Auth uses an HTTP-only cookie session (`eventflow_session`).
Rate limits are enforced via Redis (sliding window).

## Authentication

| Method | Path                    | Auth | Description                       |
|--------|-------------------------|------|-----------------------------------|
| POST   | `/api/auth/signup`      | —    | Create account, set session cookie|
| POST   | `/api/auth/signin`      | —    | Login                              |
| POST   | `/api/auth/signout`     | ✓    | Clear session                      |
| POST   | `/api/auth/verify-email`| —    | Confirm email via token            |
| POST   | `/api/auth/forgot`      | —    | Send password reset link           |
| POST   | `/api/auth/reset`       | —    | Reset password with token          |

## Events

| Method | Path                            | Auth      | Description                  |
|--------|---------------------------------|-----------|------------------------------|
| GET    | `/api/events`                   | —         | List published events (paginated) |
| POST   | `/api/events`                   | Organizer | Create draft event           |
| GET    | `/api/events/:id`               | —         | Get event detail             |
| PATCH  | `/api/events/:id`               | Organizer | Update event                 |
| DELETE | `/api/events/:id`               | Organizer | Soft delete                  |
| POST   | `/api/events/:id/publish`       | Organizer | Publish                       |
| POST   | `/api/events/:id/unpublish`     | Organizer | Unpublish                     |
| GET    | `/api/events/:id/registrations` | Organizer | List event registrations     |
| GET    | `/api/events/:id/analytics`     | Organizer | Dashboard metrics            |
| GET    | `/api/events/:id/export.csv`    | Organizer | Export attendees CSV         |
| GET    | `/api/events/:id/export.xlsx`   | Organizer | Export attendees Excel       |
| GET    | `/api/events/:id/export.pdf`    | Organizer | Export attendees PDF         |

## Ticket Types

| Method | Path                                       | Auth      |
|--------|--------------------------------------------|-----------|
| POST   | `/api/events/:id/ticket-types`             | Organizer |
| PATCH  | `/api/events/:id/ticket-types/:ttId`       | Organizer |
| DELETE | `/api/events/:id/ticket-types/:ttId`       | Organizer |

## Custom Questions

| Method | Path                                      | Auth      |
|--------|-------------------------------------------|-----------|
| POST   | `/api/events/:id/questions`               | Organizer |
| PATCH  | `/api/events/:id/questions/:qId`          | Organizer |
| DELETE | `/api/events/:id/questions/:qId`          | Organizer |

## Registrations & Checkout

| Method | Path                                       | Auth      |
|--------|--------------------------------------------|-----------|
| POST   | `/api/registrations`                       | —         |
| GET    | `/api/registrations/:id`                   | Owner/Org |
| PATCH  | `/api/registrations/:id`                   | Owner/Org |
| DELETE | `/api/registrations/:id`                   | Owner/Org |
| POST   | `/api/registrations/:id/resend`            | Organizer |
| POST   | `/api/registrations/:id/refund`            | Organizer |
| GET    | `/api/registrations/:id/ics`               | —         |
| POST   | `/api/checkout/session`                    | —         |
| POST   | `/api/webhooks/stripe`                     | Stripe    |

## Check-In

| Method | Path                  | Auth         | Description           |
|--------|-----------------------|--------------|-----------------------|
| POST   | `/api/checkin`        | Staff+       | Scan ticket           |
| POST   | `/api/checkin/manual` | Staff+       | Manual check-in by id |
| GET    | `/api/checkin/search` | Staff+       | Attendee search       |
| GET    | `/api/checkin/stream` | Staff+ (SSE) | Real-time counter     |

## Promo Codes

| Method | Path                                     | Auth      |
|--------|------------------------------------------|-----------|
| POST   | `/api/events/:id/promo-codes`            | Organizer |
| PATCH  | `/api/events/:id/promo-codes/:codeId`    | Organizer |
| DELETE | `/api/events/:id/promo-codes/:codeId`    | Organizer |
| POST   | `/api/events/:id/promo-codes/validate`   | —         |

## Referrals

| Method | Path                                 | Auth      |
|--------|--------------------------------------|-----------|
| POST   | `/api/events/:id/referrals`          | Organizer |
| GET    | `/api/events/:id/referrals`          | Organizer |
| GET    | `/r/:code`                           | —         |  *(307 → event page, increments clicks)* |

## Waitlist

| Method | Path                                | Auth     |
|--------|-------------------------------------|----------|
| POST   | `/api/events/:id/waitlist`          | —        |
| GET    | `/api/events/:id/waitlist`          | Organizer|
| POST   | `/api/waitlist/:id/promote`         | Organizer|

## Email Campaigns

| Method | Path                              | Auth      |
|--------|-----------------------------------|-----------|
| POST   | `/api/events/:id/campaigns`       | Organizer |
| POST   | `/api/campaigns/:id/send`         | Organizer |

## Uploads

| Method | Path                  | Auth      |
|--------|-----------------------|-----------|
| POST   | `/api/uploads/sign`   | Organizer | Returns pre-signed S3 PUT URL |

## Health

| Method | Path           | Auth |
|--------|----------------|------|
| GET    | `/api/health`  | —    |

## Sample: Create Registration (free event)

```http
POST /api/registrations
Content-Type: application/json

{
  "eventId": "evt_123",
  "ticketTypeId": "tt_abc",
  "quantity": 1,
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+1-555-0100",
  "company": "Acme",
  "answers": [
    { "questionId": "q_456", "answer": "M" }
  ]
}
```

Response:
```json
{ "id": "reg_789", "status": "CONFIRMED" }
```

## Sample: Stripe Checkout (paid)

```http
POST /api/checkout/session
{ "registrationId": "reg_789" }
```
Returns `{ "url": "https://checkout.stripe.com/c/pay/..." }`.

Stripe webhook `checkout.session.completed` flips the registration to `CONFIRMED`,
issues QR tickets, and queues the confirmation email.

## Error Format

```json
{ "error": "Human-readable message", "details": { "fieldErrors": {...} } }
```
Standard codes: `400` bad payload, `401` unauth, `403` forbidden, `404` not found,
`409` conflict (duplicate, sold out, already used), `429` rate-limited, `5xx` server.
