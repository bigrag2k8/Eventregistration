# PostgreSQL Backup & Restore Drill — Runbook

Non-destructive procedure to prove the production database can actually be
restored, and to record RPO/RTO. (A Word copy is generated at
`docs/Backup-Restore-Runbook.docx`, which is gitignored — this Markdown is the
version-controlled source of truth.)

| | |
|---|---|
| **System** | Railway Postgres 16 (service `Postgres`) backing the EventReg web + worker services |
| **Backups in place** | Yes — Railway managed backups + pgBackRest confirmed running on the Postgres volume (2026-07-19) |
| **Gap this closes** | A backup you have never restored is not a backup. This drill proves recoverability end-to-end and measures RPO/RTO. |
| **Safety** | Non-destructive. Reads from prod only (`pg_dump`); restores into a **throwaway** local database. Production is never modified. |
| **Run cadence** | Now (first drill), then quarterly and after any major schema/infra change. |

---

## 1. Two terms you are measuring

- **RPO (Recovery Point Objective)** — how much data you would lose in a disaster.
  It equals the age of the most recent backup. If Railway backs up daily,
  worst-case RPO ≈ 24h.
- **RTO (Recovery Time Objective)** — how long it takes to get back online. It
  equals the wall-clock time of the restore procedure below. You will time it.

The goal is a concrete, written answer to: *"If the database died right now, how
much would we lose (RPO) and how long to recover (RTO)?"*

---

## 2. Prerequisites (one-time)

- **Docker Desktop** installed and running (used for a throwaway Postgres 16 and
  for version-matched `pg_dump` / `pg_restore` — no local Postgres install needed).
- **Node + the repo** checked out (for the schema check in Step C.2).
  Repo path: `C:\Users\Daddy\Documents\Projects\yourevents-app`.
- **The production PUBLIC connection string.** In Railway → project → Postgres
  service → Variables, copy `DATABASE_PUBLIC_URL` (it points at the public TCP
  proxy, e.g. `…proxy.rlwy.net:PORT`). The internal `DATABASE_URL` only works from
  inside Railway, not your laptop.
- **Terminal:** use Git Bash. Commands below are bash. Run them from the repo folder.

---

## 3. Step A — Confirm a backup exists

Before restoring anything, confirm the source exists and note its age (that age
is your current RPO).

1. Railway → project → Postgres service → **Backups** tab.
2. Confirm there is at least one recent backup. Note the timestamp of the newest one.
3. **Record:** newest backup timestamp and the backup frequency (daily / weekly).
   Newest-backup age = **RPO**.

---

## 4. Step B — The restore drill (copy/paste)

Set your connection string once (paste the `DATABASE_PUBLIC_URL` from Step 2).
Everything else is copy/paste.

```bash
# Record the start time — RTO is measured from here.
echo "Drill start: $(date -u)"

# Prod PUBLIC url from Railway → Postgres → Variables → DATABASE_PUBLIC_URL
PROD_URL='postgresql://postgres:PASSWORD@HOST.proxy.rlwy.net:PORT/railway'
```

### 4.1  Take a fresh logical dump FROM prod (read-only, safe)

```bash
docker run --rm -v "$(pwd):/work" postgres:16-alpine \
  pg_dump "$PROD_URL" -Fc -f /work/prod-$(date +%Y%m%d-%H%M).dump

ls -lh prod-*.dump      # confirm the file exists and size > 0
```

Capture prod row counts now, to compare after the restore (**read-only**):

```bash
docker run --rm postgres:16-alpine psql "$PROD_URL" -At -c \
  "select 'orgs',count(*) from organizations union all \
   select 'events',count(*) from events union all \
   select 'registrations',count(*) from registrations union all \
   select 'payments',count(*) from payments union all \
   select 'users',count(*) from users order by 1;"
```

### 4.2  Spin up a THROWAWAY Postgres (never touches prod)

```bash
docker rm -f pg-restore-test 2>/dev/null
docker run -d --name pg-restore-test \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=restore \
  -p 5544:5432 postgres:16-alpine

until docker exec pg-restore-test pg_isready -U postgres; do sleep 1; done
```

### 4.3  Restore the dump into the throwaway

```bash
DUMP=$(ls -t prod-*.dump | head -1)
docker cp "$DUMP" pg-restore-test:/tmp/prod.dump
docker exec pg-restore-test pg_restore --no-owner --no-acl \
  -d "postgresql://postgres:test@localhost:5432/restore" /tmp/prod.dump
```

Ownership/extension `NOTICE` lines are normal and harmless. What matters is that
it finishes without an `ERROR` that aborts the restore.

---

## 5. Step C — What success looks like

Run these checks. All four (5.1, 5.2 required; 5.3 optional) must pass.

### 5.1  Row counts match prod

```bash
docker exec pg-restore-test psql \
  "postgresql://postgres:test@localhost:5432/restore" -At -c \
  "select 'orgs',count(*) from organizations union all \
   select 'events',count(*) from events union all \
   select 'registrations',count(*) from registrations union all \
   select 'payments',count(*) from payments union all \
   select 'users',count(*) from users order by 1;"
```

**Success:** the restored counts equal the prod counts from 4.1 — or are just
slightly lower. A small gap is **expected and fine**: it's the handful of rows
written to prod between the dump and now. That gap is a live illustration of your RPO.

### 5.2  Schema and every migration are present

From the repo folder, point Prisma at the restored DB:

```bash
DATABASE_URL="postgresql://postgres:test@localhost:5544/restore" \
  npx prisma migrate status
```

**Success:** it prints **"Database schema is up to date!"** and lists all
migrations as applied. A drift or missing-migration message = **FAIL**.

### 5.3  (Gold standard) The app boots against the restored data

Optional but the most convincing proof. In the repo, run the app against the
restored DB with throwaway secrets:

```bash
DATABASE_URL="postgresql://postgres:test@localhost:5544/restore" \
JWT_SECRET=drill-only-not-real-secret-0123456789 \
QR_SECRET=drill-only-not-real-secret-9876543210 \
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  npm run build && npm run start
```

**Success:** the app boots, the homepage loads, and an existing event page shows
real restored data. Then stop it with `Ctrl+C`.

### 5.4  Success checklist

| Check | Pass condition |
|---|---|
| Dump created (4.1) | `prod-*.dump` exists, size > 0 |
| Restore ran (4.3) | `pg_restore` finished, no aborting `ERROR` |
| Row counts (5.1) | Match prod (small negative delta OK = RPO) |
| Schema (5.2) | "Database schema is up to date!" |
| App boots (5.3, optional) | Homepage + an event render restored data |

---

## 6. Step D — Record RPO/RTO, then clean up

```bash
echo "Drill end: $(date -u)"   # (end - start) = RTO

# Tear down the throwaway DB and DELETE the dump (it contains attendee PII).
docker rm -f pg-restore-test
shred -u "$DUMP" 2>/dev/null || rm -f "$DUMP"
```

> ⚠ **The dump file contains real attendee PII** (names, emails). Keep it on your
> machine only, never commit it, and delete it when the drill ends (the command
> above does this).

### 6.1  Fill this in each drill

| Field | This drill |
|---|---|
| Date / performed by | |
| Newest backup age (RPO) | |
| Dump size / dump time | |
| Restore time (RTO) | |
| Row counts matched? | |
| Schema up to date? | |
| Result (PASS / FAIL + notes) | |

---

## 7. Optional — test Railway's actual backup pipeline

Step B proves your data is dumpable and restorable (logical recovery). To also
validate Railway's scheduled-backup pipeline specifically — the thing that fires
in a real disaster — do this once if your Railway plan supports it:

- Railway → Postgres → Backups → pick the latest backup → **Restore to a NEW
  service** (NOT in place over prod).
- Point a scratch app or `psql` at that new service and run the same checks from
  Section 5 (row counts, `prisma migrate status`).
- Delete the temporary service afterward.

> **Never** restore a backup in place over the production database as a "test" —
> that overwrites live data. Always restore to a new/throwaway target.

---

## 8. If a step fails

| Symptom | Likely cause / action |
|---|---|
| `pg_dump`: connection refused / timeout | Using internal `DATABASE_URL` instead of `DATABASE_PUBLIC_URL`, or wrong port. Recopy the public URL from Railway. |
| `pg_dump` version mismatch | Server newer than client. Bump the image tag (`postgres:17-alpine`, etc.) to match the server major version. |
| `pg_restore`: role/owner does not exist | Expected — that's why `--no-owner --no-acl` is used. Safe to ignore. |
| Row counts far below prod | Restore aborted early — re-read the `pg_restore` output for the first `ERROR` and resolve it. Do **not** trust the backup until this passes. |
| `prisma migrate status` shows drift | The backup predates a migration, or the dump is partial. Investigate before relying on it for DR. |
