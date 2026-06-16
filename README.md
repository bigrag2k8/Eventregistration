# EventFlow — Event Registration Platform MVP

A production-ready event registration platform for free and paid events. Modern, mobile-first, secure, and scalable.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Node.js
- **Database**: PostgreSQL 16 + Prisma ORM
- **Auth**: JWT (HTTP-only cookies) + bcrypt
- **Payments**: Stripe (Checkout, Payment Intents, Webhooks)
- **Email**: Resend (with React Email templates)
- **QR**: `qrcode` + signed JWT payload
- **Storage**: S3-compatible (R2, AWS S3) for banners/photos
- **Maps**: Google Maps Embed + Places Autocomplete
- **Deployment**: Docker, docker-compose, Vercel/Railway-ready

## Quick Start

```bash
cp .env.example .env
# Set a strong POSTGRES_PASSWORD in .env, and make DATABASE_URL match
# (postgresql://eventflow:<password>@db:5432/eventflow)
docker compose up -d        # Postgres + Redis (local development ONLY)
npm install
npx prisma migrate dev
npm run seed
npm run dev
```

Open http://localhost:3000

> **`docker-compose.yml` is for local development only — never deploy it to
> staging or production.** Production runs on managed Railway Postgres/Redis with
> their own credentials. The compose Postgres password has no default and must be
> supplied via your git-ignored `.env` (`POSTGRES_PASSWORD`).

## Project Structure

```
eventflow/
├── docs/                       # Architecture, ERD, API, roadmap, workflows
├── prisma/
│   ├── schema.prisma           # Full DB schema
│   └── seed.ts                 # Sample data
├── src/
│   ├── app/                    # Next.js App Router (pages + API)
│   ├── components/             # UI components
│   ├── lib/                    # Stripe, email, QR, auth utilities
│   └── server/                 # Server-side services
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Documentation

See `docs/` for full architecture, ERD, API reference, deployment instructions, and the Phase 2/3 roadmap.

## Roles

- **Attendee** — browse, register, manage tickets
- **Organizer** — create events, manage sales, export reports
- **Staff** — check-in via QR scanner
- **Admin** — platform-wide controls (Phase 2)
