import { defineConfig } from "vitest/config";
import path from "node:path";

// DB-backed integration tests. They run against a REAL, DISPOSABLE Postgres
// pointed at by TEST_DATABASE_URL (never a dev/prod DB — see tests/integration/
// setup.ts for the guard). Run with `npm run test:integration`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // The app's prisma client reads DATABASE_URL — point it at the test DB before
    // any module loads. Resolved at config time from TEST_DATABASE_URL.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
    // One shared DB — run files sequentially so they can't clobber each other.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
