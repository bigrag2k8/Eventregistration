import { test, expect } from "@playwright/test";
import { STORAGE_STATE, EVENT } from "./constants";

// Authenticated organizer surfaces. Runs with the session captured in
// auth.setup.ts, so a redirect back to /signin here means auth broke.
test.use({ storageState: STORAGE_STATE });

test.describe("organizer dashboard", () => {
  test("dashboard loads and lists the org's event", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/); // not bounced to /signin
    await expect(page.getByText(EVENT.name).first()).toBeVisible();
  });

  test("the create-event wizard renders", async ({ page }) => {
    await page.goto("/dashboard/events/new");
    await expect(page.getByRole("heading", { name: /create event/i })).toBeVisible();
    // The form is a multi-step wizard; the name field lives in a later (hidden)
    // step, so assert it's in the DOM rather than currently visible.
    await expect(page.locator('form input[name="name"]')).toBeAttached();
  });

  test("the check-in scanner opens from the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    // An organizer sees a "Check-in" link per event (staff/volunteers see
    // "Open scanner"); both route to /checkin/<eventId>.
    await page.getByRole("link", { name: /^check-in$/i }).first().click();
    await expect(page).toHaveURL(/\/checkin\//);
  });
});
