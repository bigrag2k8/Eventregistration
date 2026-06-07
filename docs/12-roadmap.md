# EventFlow — Development Roadmap

## MVP — 8 weeks (current scope)

| Week | Milestones                                                              |
|------|-------------------------------------------------------------------------|
| 1    | Repo scaffold, Prisma schema, auth, DB migrations, seed.                |
| 2    | Public event listing + landing page + Google Maps embed.                |
| 3    | Multi-step registration form, validation, custom questions.             |
| 4    | Stripe Checkout, webhook handler, refunds, receipts.                    |
| 5    | QR generation, mobile check-in PWA, manual search.                       |
| 6    | Organizer dashboard: events CRUD, ticket types, custom Qs, exports.     |
| 7    | Promo codes, referrals, abandoned-cart recovery, reminder emails.       |
| 8    | Waitlist + capacity controls, audit log, polish, accessibility, deploy. |

### MVP exit criteria

- Free + paid events round-trip end-to-end (form → email → check-in).
- Organizer can self-serve event creation in <10 minutes.
- All security items in `01-architecture.md` checked.
- Lighthouse mobile score ≥ 90 on event landing pages.
- 60% test coverage on `src/server/*`.

## Phase 2 — Months 3-5: Scale & Polish

- **Stripe Connect** — per-organizer payouts, marketplace fees.
- **Mobile wallets** — Apple Wallet `.pkpass` + Google Wallet objects.
- **Custom branding** — per-org theme tokens, custom domain (CNAME + SSL).
- **Multi-session events** — sessions/tracks, per-session capacity, attendee schedules.
- **Recurring events** — series with parent/child instances.
- **Team & roles UI** — invite organizers/staff with scoped access.
- **Email designer** — visual builder + saved templates per org.
- **Newsletter integrations** — Mailchimp, ConvertKit, Constant Contact.
- **Webhook outbox** — outbound webhooks for integrations.
- **Mobile organizer app** — React Native (Expo) wrapping the dashboard + scanner.
- **Offline check-in** — IndexedDB queue + sync.
- **Multilingual** — `next-intl`, RTL support.
- **A/B testing** — landing-page variant testing built in.

## Phase 3 — Months 6+: Platform

- **Public API + OAuth** — for partner integrations.
- **Marketplace discovery** — algorithmic feed, categories, geo browse.
- **Affiliate program** — built-in revenue share for referrers.
- **Enterprise SSO** — SAML + SCIM.
- **Multi-tenant org hierarchy** — chapters, regions, parent/child orgs.
- **Advanced analytics** — cohort retention, LTV, attribution.
- **AI assistant** — auto-fill event copy, suggest pricing, recommend send times.
- **Native mobile attendee app** — wallet, recommendations, push reminders.
- **In-person POS** — sell tickets at the door with card reader.
- **On-demand video** — virtual events with embedded streaming.
- **Live polls & Q&A** — engagement tools during sessions.
- **Data warehouse export** — daily Snowflake/BigQuery dumps.

## Technical debt to plan for

- Move email rendering to React Email (compiled HTML, easier theming).
- Replace cron-style worker with BullMQ jobs (already pulled in as a dep).
- Add database read replicas for analytics queries.
- Migrate to Edge runtime where compatible (event listings, geo).
- Introduce feature flags (PostHog Flags or LaunchDarkly).
