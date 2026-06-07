# EventFlow — Deployment

Three supported targets. Pick whichever fits the team.

## Option A — Vercel + managed Postgres (fastest)

1. Push to GitHub.
2. Connect repo to Vercel; framework auto-detected (Next.js).
3. Provision Postgres (Neon / Supabase / Vercel Postgres) → copy `DATABASE_URL`.
4. Provision Redis (Upstash) → copy `REDIS_URL`.
5. Add env vars in Vercel project settings (see `.env.example`).
6. Deploy. First deploy will auto-run `prisma generate && next build`.
7. From a local shell with the production `DATABASE_URL`:
   ```bash
   npx prisma migrate deploy
   npm run seed   # only on initial deploy
   ```
8. Stripe webhook endpoint: `https://<your-domain>/api/webhooks/stripe`.
9. Run the background worker on a separate platform (Railway, Fly.io, or a Vercel Cron / QStash for scheduled jobs).

## Option B — Railway / Fly.io (single platform)

1. `railway init` → connect repo.
2. Add services: Postgres, Redis.
3. Add env vars from `.env.example`.
4. Two services deploy from the same repo: `web` and `worker` (override start command for `worker`: `npx tsx src/server/worker.ts`).
5. After first deploy:
   ```bash
   railway run npx prisma migrate deploy
   railway run npm run seed
   ```
6. Set custom domain + TLS in Railway dashboard.

## Option C — Docker Compose on a VPS

```bash
git clone <repo> && cd eventflow
cp .env.example .env
# edit .env with production secrets

docker compose up -d --build
docker compose exec web npx prisma migrate deploy
docker compose exec web npm run seed   # optional
```

Behind Nginx or Caddy for TLS termination. Sample Caddyfile:

```caddyfile
events.example.com {
  reverse_proxy localhost:3000
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000;includeSubDomains;preload"
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
  }
}
```

## Required environment variables

| Var                          | Notes                                |
|------------------------------|--------------------------------------|
| `DATABASE_URL`               | Postgres connection string           |
| `REDIS_URL`                  | redis:// or rediss://                 |
| `JWT_SECRET`                 | ≥32-byte random                       |
| `STRIPE_SECRET_KEY`          |                                      |
| `STRIPE_WEBHOOK_SECRET`      | Set after creating webhook            |
| `RESEND_API_KEY`             |                                      |
| `EMAIL_FROM`                 | Verified domain in Resend             |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY`| Restrict by HTTP referrer             |
| `NEXT_PUBLIC_APP_URL`        | https://events.example.com            |
| `S3_*`                       | If self-hosting uploads               |
| `SENTRY_DSN`                 | Optional                              |

## Post-deploy checklist

- [ ] `GET /api/health` returns `{ ok: true }`.
- [ ] Stripe test mode webhook delivers and registration confirms.
- [ ] Resend domain is DKIM-verified.
- [ ] Custom domain HTTPS valid (HSTS recommended).
- [ ] Backups: nightly `pg_dump` to S3 (cron or managed snapshot).
- [ ] Error tracking sees a smoke event.
- [ ] Apple Pay domain registered (for Wallet button on Checkout).
- [ ] CDN cache rules: `Cache-Control` on `_next/static/*` (immutable).

## Database migrations

Always:
```bash
npx prisma migrate dev   # local
npx prisma migrate deploy  # prod
```

Never run `prisma db push` in production.
