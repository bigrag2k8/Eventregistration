# EventFlow — Email Templates

All transactional emails are HTML + plain-text fallback. Rendered server-side in
`src/lib/email.ts` and dispatched via Resend.

## Template Catalogue

| Kind                | Trigger                                     | Variables                                |
|---------------------|---------------------------------------------|------------------------------------------|
| CONFIRMATION        | Registration becomes CONFIRMED              | event, reg, tickets, qr attachments       |
| REMINDER_30D        | Worker, 30 days before event                | event, reg                                |
| REMINDER_7D         | Worker, 7 days before                       | event, reg                                |
| REMINDER_1D         | Worker, 1 day before                        | event, reg                                |
| REMINDER_1H         | Worker, 1 hour before                       | event, reg                                |
| CANCELLATION        | Registration cancelled                      | event, reg, reason                        |
| REFUND              | Refund processed                            | event, reg, payment                       |
| WAITLIST_PROMOTED   | Worker promotes attendee                    | event, waitlist, magic-link               |
| ABANDONED_CART      | Worker, abandoned > 1h                      | event, draft, recovery link               |
| ORGANIZER_BLAST     | Organizer sends segment campaign            | campaign, recipient                       |
| POST_EVENT          | Worker, 24h after event                     | event, reg, survey link                   |

## Confirmation (key blocks)

- Hero: "🎉 You're registered: {Event Name}"
- Event card: name, date/time (local TZ), location with directions link, host org
- Order summary table: ticket × qty, discount, tax, fee, total
- Attached QR PNGs (one per ticket)
- "Add to Calendar" CTA → `/api/registrations/:id/ics`
- Refund policy, cancel instructions
- Footer: org branding, unsubscribe (for marketing), GDPR notice

## Reminder

- "Your event is coming up in {30 days | 7 days | tomorrow | 1 hour}"
- Event summary card
- Map link
- "View ticket" CTA

## Waitlist promoted

- "A spot just opened up!"
- 24-hour magic checkout link (expires)
- Total to pay, ticket type held
- "Decline" link to release the seat

## Abandoned cart

- "Still interested in {Event Name}?"
- Time-limited deep link to the registration form with previous selections pre-filled
- "Reserve my seat" button

## Plain-text fallback

Each template includes a plain-text version with the essential info and links — bots, screen readers, and ancient mail clients are happy.

## Brand customization

The HTML template reads `event.organization.name` and the org's logo URL for letterhead. Per-event overrides can be added under `events.emailFooter` in Phase 2.
