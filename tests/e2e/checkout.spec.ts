import { test, expect } from "@playwright/test";
import { ORG, EVENT } from "./constants";

// Completing a checkout needs live Stripe, so this smoke test asserts the
// money-facing UI up to the Stripe boundary: the registration page renders the
// event and its SERVER-priced tickets (the "prices never come from the client"
// invariant, made visible). Full payment is out of scope for CI.
test.describe("checkout entry", () => {
  test("registration page shows the event and server-priced tickets", async ({ page }) => {
    await page.goto(`/o/${ORG.slug}/events/${EVENT.slug}/register`);
    await expect(page.getByText(EVENT.name).first()).toBeVisible();
    await expect(page.getByText(EVENT.ticketName).first()).toBeVisible();
    await expect(page.getByText(EVENT.ticketPrice).first()).toBeVisible();
  });
});
