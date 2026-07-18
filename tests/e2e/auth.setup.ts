import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { STORAGE_STATE, ORGANIZER } from "./constants";

// Authenticate ONCE via the real sign-in endpoint and persist the session
// cookie as storageState, so the authenticated specs (organizer.spec.ts) start
// already logged in without re-driving the login form each time. This also
// smoke-tests /api/auth/signin itself.
setup("sign in as the seeded organizer", async ({ request }) => {
  const res = await request.post("/api/auth/signin", {
    data: { email: ORGANIZER.email, password: ORGANIZER.password },
  });
  expect(res.ok(), `sign-in failed (${res.status()}): ${await res.text()}`).toBeTruthy();

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await request.storageState({ path: STORAGE_STATE });
});
