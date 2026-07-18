import { describe, it, expect, vi } from "vitest";

// actions.ts imports prisma (@/lib/db) and resend at module scope; stub them
// so this file loads without a real DB connection or RESEND_API_KEY.
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("resend", () => ({ Resend: class {} }));

describe("marketing/actions.ts export surface (F-01 regression)", () => {
  it("does not export marketingAudience — a caller-org-id-accepting function must never be a server action", async () => {
    const actions = await import("@/app/dashboard/marketing/actions");
    expect(actions).not.toHaveProperty("marketingAudience");
  });

  it("still exports the audience helper, but from a plain (non-\"use server\") module", async () => {
    const audience = await import("@/app/dashboard/marketing/audience");
    expect(typeof audience.marketingAudience).toBe("function");
  });
});
