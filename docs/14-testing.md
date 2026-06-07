# EventFlow — Testing Strategy

## Layers

- **Unit** — `vitest` for `src/server/*` and `src/lib/*` (pricing, auth, QR).
- **Integration** — `vitest` + `@testcontainers/postgresql` for service tests against real DB.
- **API** — `supertest` against Next.js route handlers.
- **E2E** — Playwright walking the attendee + organizer happy paths end-to-end against the Docker compose stack.
- **Load** — k6 script for the registration flow on the day of an event.

## Critical paths covered

1. Free registration round-trip.
2. Paid registration via Stripe (test mode) → webhook → ticket issuance → email.
3. Refund flow.
4. QR check-in: valid, already-used, invalid.
5. Capacity sold-out → waitlist promotion.
6. Promo code validation and stacking edge cases.
7. Custom question validation.
8. Export CSV/XLSX/PDF round-trip.
9. Rate limit triggers.

## Sample unit test (`pricing`)

```ts
import { describe, it, expect } from "vitest";
import { computeTotals } from "@/server/pricing";

describe("computeTotals", () => {
  it("applies 20% promo code", async () => {
    const event = stubEvent({ ticketTypes: [tt(10000)], promoCodes: [pc("OFF20", "PERCENTAGE", 20)] });
    const t = await computeTotals({ event, ticketTypeId: event.ticketTypes[0].id, quantity: 1, promoCode: "OFF20" });
    expect(t).toMatchObject({ subtotal: 10000, discount: 2000 });
  });
});
```

## CI

Single GitHub Actions workflow:

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: pw, POSTGRES_DB: eventflow }
        ports: ["5432:5432"]
      redis: { image: redis:7, ports: ["6379:6379"] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx prisma migrate deploy
        env: { DATABASE_URL: postgresql://postgres:pw@localhost:5432/eventflow }
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps && npx playwright test
```
