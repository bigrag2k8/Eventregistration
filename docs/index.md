# EventFlow — Documentation Index

| #  | Doc                                  | What's inside                              |
|----|--------------------------------------|--------------------------------------------|
| 01 | [Architecture](./01-architecture.md) | Full stack diagram, layers, scaling notes   |
| 02 | [Database ERD](./02-database-erd.md) | Mermaid ERD + table summary                 |
| 03 | [User Workflows](./03-user-workflows.md) | Attendee, organizer, staff, refund, waitlist |
| 04 | [Wireframes](./04-wireframes.md)     | ASCII wireframes per major page             |
| 05 | [API Reference](./05-api-reference.md) | Every REST endpoint, payloads, errors      |
| 06 | [Email Templates](./06-email-templates.md) | Catalogue, contents, branding             |
| 07 | [Stripe Workflow](./07-stripe-workflow.md) | Checkout, webhooks, refunds, Connect      |
| 08 | [QR Workflow](./08-qr-workflow.md)   | JWT format, issuance, validation, fraud     |
| 09 | [UI Page Designs](./09-ui-pages.md)  | Page inventory, components, accessibility   |
| 10 | [Admin Dashboard](./10-admin-dashboard.md) | KPIs, registration table, exports, RBAC |
| 11 | [Deployment](./11-deployment.md)     | Vercel / Railway / Docker options           |
| 12 | [Roadmap](./12-roadmap.md)           | 8-week MVP, Phase 2, Phase 3                 |
| 13 | [Security](./13-security.md)         | Auth, PCI, GDPR, headers, incident response  |
| 14 | [Testing](./14-testing.md)           | Unit, integration, E2E, load, CI            |

Code lives in:

```
prisma/      — DB schema + seed
src/app/     — Next.js routes (UI + API)
src/server/  — Server-side services (pricing, tickets, worker)
src/lib/     — Shared utilities (db, auth, stripe, email, rate-limit)
src/components/ — React components
```
