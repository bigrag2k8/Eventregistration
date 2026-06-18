import { beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";

// Hard guard: integration tests must run against an explicit, disposable test DB.
// vitest.integration.config.ts maps DATABASE_URL <- TEST_DATABASE_URL; if that
// isn't set, the app's prisma client would have no URL — fail loudly rather than
// risk pointing at a real database.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Integration tests need a disposable Postgres.\n" +
      "  Local: docker run -d --rm -e POSTGRES_PASSWORD=test -e POSTGRES_DB=eventflow_test -p 5433:5432 postgres:16-alpine\n" +
      "  then: TEST_DATABASE_URL=postgresql://postgres:test@localhost:5433/eventflow_test npx prisma migrate deploy\n" +
      "  and:  TEST_DATABASE_URL=... npm run test:integration",
  );
}

// Clean slate before each test. Truncating the org/user/event roots cascades to
// every dependent table (ticket types, registrations, tickets, sessions, etc.).
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "organizations","users","events" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
