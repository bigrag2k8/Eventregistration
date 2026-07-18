import { test, expect } from "@playwright/test";
import { ORGANIZER } from "./constants";

// Identity flows. Sign-in is driven through the real UI (the core login path);
// sign-up is smoke-tested at both the page-render and endpoint level (its 12+
// field form is exercised via the API so a single label rename doesn't make the
// whole flow flaky, while the page render catches the form breaking).
test.describe("auth flows", () => {
  test("a user can sign in through the password form and reach the dashboard", async ({ page }) => {
    await page.goto("/signin");
    await page.locator('input[type="email"]').fill(ORGANIZER.email);
    await page.locator('input[type="password"]').fill(ORGANIZER.password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("the sign-up page renders its account form", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
    await expect(page.locator("#su-email")).toBeVisible();
    await expect(page.locator("#su-password")).toBeVisible();
  });

  test("the sign-up endpoint creates a new organization + account", async ({ request }) => {
    const stamp = Date.now();
    const res = await request.post("/api/auth/signup", {
      data: {
        email: `e2e+${stamp}@example.com`,
        password: "password123",
        firstName: "E2E",
        lastName: "Tester",
        orgName: `E2E Org ${stamp}`,
        orgSlug: `e2e-org-${stamp}`,
        contactPhone: "555-123-4567",
        addressLine1: "1 Test St",
        city: "Testville",
        state: "CA",
        zipCode: "94103",
        country: "US",
      },
    });
    expect(res.ok(), `sign-up failed (${res.status()}): ${await res.text()}`).toBeTruthy();
  });
});
