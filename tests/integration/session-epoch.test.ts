import { describe, it, expect, beforeEach, vi } from "vitest";

// getSession() is wrapped in React.cache() via a typeof-guard; null out `cache`
// so the guard falls back to identity and getSession is callable as a plain
// async function in tests (and re-reads on every call, no per-render memo).
vi.mock("react", async (orig) => ({ ...(await orig() as object), cache: undefined }));

// Drive the session cookie getSession reads. vi.hoisted so the mock factory can
// reference the mutable token safely.
const cookie = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => (cookie.token ? { value: cookie.token } : undefined) }),
}));

import { prisma } from "@/lib/db";
import { signSession, getSession } from "@/lib/auth";

let n = 0;
async function seedUser(role: string, sessionVersion: number) {
  n += 1;
  return prisma.user.create({
    data: { email: `epoch-${n}-${Date.now()}@test.local`, role: role as any, sessionVersion },
  });
}

describe("session epoch invalidation against the DB (NEW-02)", () => {
  beforeEach(() => { cookie.token = undefined; });

  it("rejects a session signed before a sessionVersion bump (the password-reset case)", async () => {
    const user = await seedUser("ORGANIZER", 1);
    cookie.token = await signSession({ sub: user.id, role: "ORGANIZER", email: user.email, ver: 1 });

    // Valid while the epoch matches.
    expect(await getSession()).toMatchObject({ sub: user.id, ver: 1 });

    // Bump the epoch — exactly what reset-password does.
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: 2 } });

    // The old token is now stale and must be rejected.
    expect(await getSession()).toBeNull();
  });

  it("accepts a session freshly signed at the new epoch", async () => {
    const user = await seedUser("ADMIN", 5);
    cookie.token = await signSession({ sub: user.id, role: "ADMIN", email: user.email, ver: 5 });
    expect(await getSession()).toMatchObject({ sub: user.id, ver: 5 });
  });

  it("treats a legacy token with no ver claim as epoch 1 (no forced logout on deploy)", async () => {
    const user = await seedUser("STAFF", 1);
    cookie.token = await signSession({ sub: user.id, role: "STAFF", email: user.email }); // no ver
    expect(await getSession()).toMatchObject({ sub: user.id });
  });

  it("rejects a soft-deleted user's otherwise-valid session", async () => {
    const user = await seedUser("ORGANIZER", 1);
    cookie.token = await signSession({ sub: user.id, role: "ORGANIZER", email: user.email, ver: 1 });
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    expect(await getSession()).toBeNull();
  });
});
