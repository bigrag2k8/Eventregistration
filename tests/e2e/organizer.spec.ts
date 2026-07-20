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

  test("the create-event format gate opens the standard wizard", async ({ page }) => {
    await page.goto("/dashboard/events/new");
    await expect(page.getByRole("heading", { name: /create event/i })).toBeVisible();
    // The page now opens with a format chooser (Standard vs Conference).
    await expect(page.getByRole("heading", { name: /what are you creating/i })).toBeVisible();
    // Picking Standard mounts the existing wizard; the name field lives in a
    // later (hidden) step, so assert it's in the DOM rather than currently visible.
    await page.getByRole("button", { name: /standard event/i }).click();
    await expect(page.locator('form input[name="name"]')).toBeAttached();
  });

  test("the create-event format gate opens the conference wizard", async ({ page }) => {
    await page.goto("/dashboard/events/new");
    await page.getByRole("button", { name: /^conference/i }).click();
    // The conference wizard serializes its pass/session builders into hidden
    // JSON inputs; their presence confirms the separate wizard mounted.
    await expect(page.locator('form input[name="passes"]')).toBeAttached();
    await expect(page.locator('form input[name="sessions"]')).toBeAttached();
  });

  test("the check-in scanner opens from the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    // An organizer sees a "Check-in" link per event (staff/volunteers see
    // "Open scanner"); both route to /checkin/<eventId>.
    await page.getByRole("link", { name: /^check-in$/i }).first().click();
    await expect(page).toHaveURL(/\/checkin\//);
  });
});
