# EventFlow — Admin Dashboard Design

## Goals

- Executive snapshot in <3 seconds (top of page).
- Drill into any event in 1 click.
- Manage attendees from a single, fast searchable table.
- Export anything in three formats: CSV, XLSX, PDF.

## Information architecture

```
/dashboard
├── Overview           — KPI cards, revenue chart, recent activity
├── Events             — list + filter + create
│   └── [id]
│       ├── Details
│       ├── Tickets
│       ├── Questions
│       ├── Registrations  ← search, filter, bulk actions
│       ├── Marketing       ← promo, referrals, campaigns
│       ├── Analytics       ← funnel, segmentation
│       ├── Check-In        ← link to scanner + live counter
│       └── Settings
├── Registrations      — org-wide attendee search
├── Marketing          — org-wide email campaigns
├── Team               — invite organizer/staff
└── Settings           — org profile, payouts, branding
```

## KPI cards (top of Overview)

| Metric              | Source                                                    |
|---------------------|-----------------------------------------------------------|
| Revenue (30 d)      | `sum(Payment.amount where SUCCEEDED, last 30 d)`          |
| Registrations (30 d)| `count(Registration where CONFIRMED, last 30 d)`          |
| Tickets sold        | `sum(TicketType.quantitySold for org events)`             |
| Available tickets   | `sum(quantityTotal - quantitySold)`                        |
| Check-in rate       | `checkIns / confirmed tickets * 100`                       |
| Conversion rate     | `confirmed / event page views (from PostHog)`              |
| Refund requests     | `count(RefundRequest where status='OPEN')`                 |

## Registrations management

Table columns:
- Attendee name (sortable)
- Email
- Event
- Ticket type
- Quantity
- Total
- Status badge (CONFIRMED / PENDING / REFUNDED / CHECKED-IN)
- Created at
- Actions (View · Edit · Resend · Cancel · Refund)

Filters:
- Status (multi)
- Event (multi)
- Date range
- Ticket type
- Has checked in?
- Free-text search across name/email/company

Bulk actions:
- Resend confirmation
- Export selected (CSV / XLSX / PDF)
- Cancel
- Send custom email

## Exports

- **CSV** — flat with one row per registration, custom question answers as columns.
- **XLSX** — three sheets (Summary, Registrations, By Ticket Type) with formulas in Summary.
- **PDF** — branded attendee list, useful for door staff or board reports.

## Marketing tools (per event)

- **Promo codes** — create, set type (%/$), limit, expiry. Live "usage / limit" bar.
- **Referrals** — generate trackable links, leaderboard table sorted by conversions.
- **Email campaigns** — segment by status / ticket type, schedule or send now.
- **Abandoned cart recovery** — list of `AbandonedCart` rows with "Send reminder" / "Recover" actions and aggregate recovery-rate stat.

## Analytics

- **Funnel** — Visits → Started reg → Completed reg → Checked in.
- **Time series** — registrations and revenue per day.
- **Segments** — by ticket type, referral source, geography.
- **Cohort** — repeat attendees across events.

## Permissions (RBAC)

| Capability                       | Attendee | Staff | Organizer | Admin |
|----------------------------------|:--------:|:-----:|:---------:|:-----:|
| View own registrations           | ✓        | ✓     | ✓         | ✓     |
| Scan QR / check-in               |          | ✓     | ✓         | ✓     |
| Create/edit events               |          |       | ✓         | ✓     |
| Issue refunds                    |          |       | ✓         | ✓     |
| Export registrations             |          |       | ✓         | ✓     |
| Manage team / billing            |          |       |           | ✓     |
| Platform-wide controls           |          |       |           | ✓     |
