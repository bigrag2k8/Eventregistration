# EventFlow — QR Code Workflow

## Goals

1. Each attendee gets a unique, fraud-resistant QR per ticket.
2. QR works in Apple Wallet, Google Wallet, paper, and email attachment.
3. Single-use at the door — repeat scans return `ALREADY_USED`.
4. Refunded/invalidated tickets return `INVALID`.

## Token Format

QR payload is a signed JWT (HS256) containing:

```json
{
  "ticketId": "tic_abc123",
  "registrationId": "reg_xyz",
  "eventId": "evt_001",
  "ticketTypeId": "tt_general",
  "iat": 1717000000,
  "iss": "eventflow-qr"
}
```

- Signed with `JWT_SECRET` server-side.
- We also persist `qrCodeHash = SHA256(token)` on the `Ticket` row for O(1) lookup at scan time.

## Generation

When a Registration reaches `CONFIRMED`:

```
issueTickets(registrationId)
  for each unit in quantity:
    ticketId = uuid()
    token = SignJWT(payload).sign(JWT_SECRET)
    hash = sha256(token)
    INSERT Ticket {id: ticketId, qrToken: token, qrCodeHash: hash}
  TicketType.quantitySold += quantity
```

The PNG is rendered on demand via `qrcode` (`renderQrPngDataUrl`). Email attachments embed base64 PNG. The success page also offers a downloadable PNG.

## Mobile Wallet (Phase 2)

- Apple Wallet `.pkpass` generation requires an Apple Developer account + signing certificates.
- Google Wallet uses the Wallet Objects API. Endpoint already accounted for at `/api/tickets/:id/wallet/apple` and `/google`.

## Validation at the Door

```
POST /api/checkin { token, eventId }
  1. verifyTicketToken(token)             // signature check
  2. sha256(token) → lookup Ticket by id+hash
  3. if !ticket.isValid       → 404 INVALID
  4. if registration.status != CONFIRMED → 409 INVALID
  5. if CheckIn row exists    → 409 ALREADY_USED
  6. INSERT CheckIn (unique on ticketId)  → 200 CHECKED_IN
```

Unique constraint on `check_ins.ticket_id` enforces single-use even under racing scans.

## Fraud Prevention

- **Signature** — only our server can mint valid tokens.
- **Bound to event + ticket type** — sharing a QR from event A to event B fails the `eventId` check.
- **Hash lookup** — token must match the exact issued one; mutated tokens won't decode or won't find a row.
- **Replay** — unique constraint prevents the same ticket being checked in twice.
- **Refund** — `isValid` flips to `false`; QR fails validation.
- **Rate limit** — staff endpoints rate-limited (120 scans/min/staff).

## Offline Check-In (Phase 2)

The scanner PWA caches a recent ticket set (hashed) in IndexedDB so a flaky venue Wi-Fi doesn't block the line. Scans are queued and reconciled when connectivity returns; the server resolves conflicts by `scannedAt` ordering.
