import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end SMOKE suite (QUAL-02). Drives a real browser against a built app +
 * a disposable seeded Postgres, so a silent UI/flow rewrite of the core money +
 * identity journeys (public event → register/pricing, sign-in, dashboard,
 * create-event, check-in) fails CI instead of shipping green.
 *
 * Local:  `npm run test:e2e`  — runs against `next dev` (auto-started).
 * CI:     builds, seeds, then runs against `next start` (see .github/workflows/ci.yml).
 * A failing test captures a screenshot + trace + video (see `use` below).
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // Signs in the seeded organizer once and saves the session as storageState.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // In CI the app is already built (npm run build) — just serve it in prod
    // mode. Locally, spin up the dev server and reuse one if it's already up.
    command: process.env.CI ? `npx next start -p ${PORT}` : `npm run dev -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
