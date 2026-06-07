# EventFlow — User Workflows

## Workflow 1: Attendee Registers for a Paid Event

```
[Attendee]
   │
   ▼
1. Browse events  ─────────►  /events
   │
   ▼
2. View landing page          /events/[slug]
   │ (sees banner, speakers, tickets, map)
   ▼
3. Click "Register Now"
   │
   ▼
4. Select ticket type + qty   /events/[slug]/register
   │
   ▼
5. Enter required fields
   (first/last/email/phone/company + custom Qs)
   │
   ▼
6. Apply promo code (optional)
   │
   ▼
7. Review order summary
   (subtotal + tax + processing fee = total)
   │
   ▼
8. Click "Pay & Register"
   │ ─► POST /api/checkout/session
   │
   ▼
9. Redirect to Stripe Checkout (hosted)
   │
   ▼
10. Submit card / Apple Pay / Google Pay
    │
    ▼
11. Stripe redirects back     /events/[slug]/success?session_id=…
    │
    │  Server-side: webhook `checkout.session.completed` fires
    │  → flips Registration → CONFIRMED
    │  → issues QR codes
    │  → enqueues confirmation email
    │
    ▼
12. Attendee sees success page with QR + "Add to Calendar"
    │
    ▼
13. Email arrives with:
    - QR code(s)
    - .ics calendar invite
    - Directions link
    - Refund/cancel policy
    - "Manage my registration" link (magic-link token)
```

## Workflow 2: Free Event Registration

```
1-6. Same as above (no tax/fees if all-free)
   │
   ▼
7. Click "Register" (no Stripe step)
   │ ─► POST /api/registrations (creates CONFIRMED immediately)
   │
   ▼
8. Email + QR sent immediately
```

## Workflow 3: Organizer Creates an Event

```
1. Sign in              /signin
   │
   ▼
2. Dashboard            /dashboard
   │
   ▼
3. Click "Create event"
   │
   ▼
4. Step 1: Basics       Name, description, dates, category, tags
   │
   ▼
5. Step 2: Location     Google Places autocomplete → lat/lng + Place ID
   │
   ▼
6. Step 3: Speakers     Photo, bio, contact
   │
   ▼
7. Step 4: Media        Banner upload, gallery, optional promo video URL
   │
   ▼
8. Step 5: Tickets      Add ticket types, pricing, capacity, sale windows
   │
   ▼
9. Step 6: Custom Qs    Add registration questions
   │
   ▼
10. Step 7: Settings    Refund policy, processing fee passthrough, tax %
    │
    ▼
11. Preview → Publish   /events/[slug] becomes live
```

## Workflow 4: Check-In at the Door

```
1. Staff opens scanner            /checkin/[event_id]
   │ (signed in via short-lived token from organizer)
   │
   ▼
2. Camera activates
   │
   ▼
3. Attendee shows QR (printed or wallet)
   │
   ▼
4. POST /api/checkin {token}
   │
   ▼
5. Server:
   - verify JWT signature
   - look up ticket
   - check_ins row exists?  → 409 ALREADY_USED (red)
   - ticket invalid?         → 404 INVALID (red)
   - else insert check_ins   → 200 OK (green)
   │
   ▼
6. UI flashes color + plays sound
   │
   ▼
7. Dashboard counter updates in real time (Pusher channel)
```

## Workflow 5: Waitlist Promotion

```
Event sells out
   │
   ▼
Attendee A joins waitlist (position 1)
   │
   ▼
Another attendee cancels (refund issued)
   │
   ▼
Background job sees Event has open seat
   │
   ▼
Promote A → send "Your spot opened!" email
   │ token-gated checkout link expires in 24h
   │
   ▼
A pays → CONFIRMED
   │
   OR ignores → token expires → next person promoted
```

## Workflow 6: Refund

```
1. Attendee clicks "Request refund" in confirmation email
   │ (magic-link auth)
   │
   ▼
2. Refund request form (full or partial reason)
   │
   ▼
3. Organizer reviews in dashboard → approve / deny
   │
   ▼
4. On approve: Stripe refund API call (full or partial amount)
   │
   ▼
5. Stripe webhook `charge.refunded` → update Registration.status
   │
   ▼
6. Email "Your refund has been processed"
   │
   ▼
7. Ticket invalidated; QR fails at check-in
```
