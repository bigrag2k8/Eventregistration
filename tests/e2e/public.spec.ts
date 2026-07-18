import { test, expect } from "@playwright/test";
import { ORG, EVENT } from "./constants";

// Anonymous, public-facing surfaces. These are what an attendee sees before any
// login — the highest-traffic pages, and the ones a silent rewrite would break
// most visibly.
test.describe("public pages", () => {
  test("homepage loads with brand chrome", async ({ page }) => {
    const resp = await page.goto("/");
    expect(resp?.status(), "homepage HTTP status").toBeLessThan(400);
    // Brand home link in the header (wraps the logo).
    await expect(page.getByRole("link", { name: /your events home/i })).toBeVisible();
  });

  test("public event page shows the event and server-rendered ticket pricing", async ({ page }) => {
    await page.goto(`/o/${ORG.slug}/events/${EVENT.slug}`);
    await expect(page.getByRole("heading", { name: EVENT.name })).toBeVisible();
    await expect(page.getByText(EVENT.ticketName).first()).toBeVisible();
    await expect(page.getByText(EVENT.ticketPrice).first()).toBeVisible();
  });

  test("sign-in page renders the password form", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
