import { describe, it, expect, vi } from "vitest";

// auth.ts imports next/headers at module load (cookies() is only called inside
// getSession/setSessionCookie, which these tests don't exercise). Stub it so the
// module loads in a plain Node environment.
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { SignJWT } from "jose";
import {
  signSession, verifySession, signTicketToken, verifyTicketToken,
  signReviewToken, verifyReviewTokenResult,
} from "@/lib/auth";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("session tokens — sessionVersion epoch (NEW-02)", () => {
  it("round-trips the ver claim so reset-invalidation can compare it", async () => {
    const token = await signSession({ sub: "u1", role: "ORGANIZER", email: "a@b.com", orgId: "o1", ver: 5 });
    const payload = await verifySession(token);
    expect(payload).toMatchObject({ sub: "u1", role: "ORGANIZER", email: "a@b.com", orgId: "o1", ver: 5 });
  });

  it("leaves ver undefined when not supplied (legacy/pre-deploy tokens)", async () => {
    const token = await signSession({ sub: "u2", role: "ATTENDEE", email: "c@d.com" });
    const payload = await verifySession(token);
    expect(payload?.ver).toBeUndefined();
    // getSession treats this as epoch 1, so old tokens are not force-invalidated.
  });

  it("returns null for a tampered or garbage token", async () => {
    expect(await verifySession("not.a.jwt")).toBeNull();
    const token = await signSession({ sub: "u3", role: "STAFF", email: "e@f.com", ver: 1 });
    // Flip a character in the signature segment → signature no longer verifies.
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "b" : "a");
    expect(await verifySession(tampered)).toBeNull();
  });
});

describe("QR ticket tokens — expiry (NEW-01) and isolation (SEC-02)", () => {
  const ticket = { ticketId: "t1", registrationId: "r1", eventId: "e1", ticketTypeId: "tt1" };

  it("verifies a ticket whose event ends in the future", async () => {
    const token = await signTicketToken(ticket, new Date(Date.now() + DAY));
    expect(await verifyTicketToken(token)).toMatchObject(ticket);
  });

  it("rejects a ticket past its event-end + 7 day expiry", async () => {
    // Event ended 8 days ago → exp = (end + 7d) = ~1 day ago → expired.
    const token = await signTicketToken(ticket, new Date(Date.now() - 8 * DAY));
    expect(await verifyTicketToken(token)).toBeNull();
  });

  it("verifies a ticket signed with the 30-day fallback (no end time)", async () => {
    const token = await signTicketToken(ticket);
    expect(await verifyTicketToken(token)).toMatchObject(ticket);
  });

  it("does not cross-verify session and ticket tokens (separate issuers/keys)", async () => {
    const session = await signSession({ sub: "u1", role: "ATTENDEE", email: "a@b.com", ver: 1 });
    const ticketTok = await signTicketToken(ticket, new Date(Date.now() + DAY));
    // A ticket token must not validate as a session, nor vice versa.
    expect(await verifySession(ticketTok)).toBeNull();
    expect(await verifyTicketToken(session)).toBeNull();
  });
});

describe("review tokens — expired vs invalid must be distinguishable", () => {
  it("round-trips a valid review token", async () => {
    const token = await signReviewToken({ registrationId: "reg_1" });
    const { claim, reason } = await verifyReviewTokenResult(token);
    expect(claim).toEqual({ registrationId: "reg_1" });
    expect(reason).toBeUndefined();
  });

  it("reports a WRONG-KEY signature as invalid, NOT expired", async () => {
    // The real incident: the worker signed with a different secret than the web
    // verified with, and the catch-all reported it as "expired" — so a signing
    // mismatch looked like routine housekeeping for its entire lifetime.
    const foreign = new TextEncoder().encode("a-totally-different-signing-key-32bytes!");
    const forged = await new SignJWT({ registrationId: "reg_1", typ: "review" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("eventflow-review")
      .setExpirationTime("60d")
      .sign(foreign);

    const { claim, reason } = await verifyReviewTokenResult(forged);
    expect(claim).toBeNull();
    expect(reason).toBe("invalid");
    expect(reason).not.toBe("expired");
  });

  it("reports a genuinely lapsed token as expired", async () => {
    const token = await signReviewToken({ registrationId: "reg_1" }); // 60d ttl
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.now() + 61 * DAY));
      const { claim, reason } = await verifyReviewTokenResult(token);
      expect(claim).toBeNull();
      expect(reason).toBe("expired");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a session token presented as a review token (wrong typ/issuer)", async () => {
    const session = await signSession({ sub: "u1", role: "ATTENDEE", email: "a@b.com" });
    const { claim, reason } = await verifyReviewTokenResult(session);
    expect(claim).toBeNull();
    expect(reason).toBe("invalid");
  });
});
