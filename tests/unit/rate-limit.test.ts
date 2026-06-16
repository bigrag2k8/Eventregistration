import { describe, it, expect, vi, beforeEach } from "vitest";

// ioredis is mocked so the in-memory fallback path is exercised deterministically
// (no real Redis, no 2s connect timeouts). The factory returns a class whose
// .incr() rejects, simulating an unreachable Redis.
const incr = vi.fn();
vi.mock("ioredis", () => {
  return {
    default: class FakeRedis {
      on() {}
      incr(...args: unknown[]) {
        return incr(...args);
      }
      expire() {
        return Promise.resolve(1);
      }
    },
  };
});

import { clientIp, rateLimit } from "@/lib/rate-limit";

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/x", { headers });
}

describe("clientIp (SEC-06 trusted-proxy extraction)", () => {
  it("takes the RIGHTMOST X-Forwarded-For entry (the one Railway appended)", () => {
    // Leftmost values are client-controllable; the rightmost is unspoofable.
    const req = reqWith({ "x-forwarded-for": "attacker-ip, 1.2.3.4, proxy-ip" });
    expect(clientIp(req)).toBe("proxy-ip");
  });

  it("handles a single XFF value", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("trims surrounding whitespace", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "a ,  b ,  c " }))).toBe("c");
  });

  it("ignores empty trailing segments", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "1.1.1.1, ," }))).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip when XFF is absent", () => {
    expect(clientIp(reqWith({ "x-real-ip": "5.5.5.5" }))).toBe("5.5.5.5");
  });

  it("prefers XFF over x-real-ip when both are present", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "10.0.0.1", "x-real-ip": "5.5.5.5" }))).toBe("10.0.0.1");
  });

  it("returns 'anon' when no IP headers are present", () => {
    expect(clientIp(reqWith({}))).toBe("anon");
  });

  it("does not let a spoofed leftmost value win (anti-rotation)", () => {
    const a = clientIp(reqWith({ "x-forwarded-for": "1.1.1.1, real" }));
    const b = clientIp(reqWith({ "x-forwarded-for": "2.2.2.2, real" }));
    // An attacker rotating the leftmost entry still maps to the same trusted IP.
    expect(a).toBe("real");
    expect(b).toBe("real");
  });
});

describe("rateLimit (SEC-01 in-memory fallback on Redis outage)", () => {
  beforeEach(() => {
    incr.mockReset();
    incr.mockRejectedValue(new Error("ECONNREFUSED"));
  });

  it("does NOT fail open by default — it throttles via the in-memory fallback", async () => {
    const key = `test:fallback:${Math.random()}`;
    const limit = 3;
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await rateLimit(key, limit, 60));
    // First `limit` calls allowed, the rest blocked — protection survives the outage.
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results[2].remaining).toBe(0);
  });

  it("scopes counters per key", async () => {
    const a = await rateLimit(`test:k:a:${Math.random()}`, 1, 60);
    const b = await rateLimit(`test:k:b:${Math.random()}`, 1, 60);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("fails OPEN only with the explicit opt-in", async () => {
    const key = `test:failopen:${Math.random()}`;
    const r1 = await rateLimit(key, 1, 60, { failOpen: true });
    const r2 = await rateLimit(key, 1, 60, { failOpen: true });
    // Availability wins for non-security throttles when opted in.
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it("uses Redis when it is reachable (count <= limit)", async () => {
    incr.mockResolvedValueOnce(1);
    const r = await rateLimit(`test:redis:${Math.random()}`, 5, 60);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("blocks via Redis when the count exceeds the limit", async () => {
    incr.mockResolvedValueOnce(6);
    const r = await rateLimit(`test:redis:${Math.random()}`, 5, 60);
    expect(r.allowed).toBe(false);
  });
});
