import { describe, it, expect, vi, beforeEach } from "vitest";

const auditMock = vi.fn();
const notifyOpsMock = vi.fn();
const rateLimitMock = vi.fn();

vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => auditMock(...a) }));
vi.mock("@/lib/alert", () => ({ notifyOps: (...a: unknown[]) => notifyOpsMock(...a) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => rateLimitMock(...a) }));

import { reportTenantViolation } from "@/lib/tenant-violation";

const session = { sub: "user_1", orgId: "org_attacker", email: "a@x.com", role: "ORGANIZER" };
const base = { session, resourceType: "Event", resourceId: "evt_victim", ownerOrgId: "org_victim", route: "test" };

describe("reportTenantViolation", () => {
  beforeEach(() => {
    auditMock.mockReset().mockResolvedValue(undefined);
    notifyOpsMock.mockReset().mockResolvedValue(undefined);
    rateLimitMock.mockReset().mockResolvedValue({ allowed: true, remaining: 0, resetAt: 0 });
  });

  it("always writes an authz.tenant_violation audit row with actor + victim context", async () => {
    await reportTenantViolation(base);
    expect(auditMock).toHaveBeenCalledTimes(1);
    const row = auditMock.mock.calls[0][0];
    expect(row.action).toBe("authz.tenant_violation");
    expect(row.targetId).toBe("evt_victim");
    expect(row.userId).toBe("user_1");
    expect(row.metadata.resourceOwnerOrgId).toBe("org_victim");
    expect(row.metadata.actorOrgId).toBe("org_attacker");
  });

  it("emails ops when the throttle allows it", async () => {
    await reportTenantViolation(base);
    expect(notifyOpsMock).toHaveBeenCalledTimes(1);
  });

  it("skips the email (but still audits) when the per-actor throttle is exhausted", async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt: 0 });
    await reportTenantViolation(base);
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(notifyOpsMock).not.toHaveBeenCalled();
  });

  it("still emails when the throttle backend throws (fail-open on alerting)", async () => {
    rateLimitMock.mockRejectedValue(new Error("redis down"));
    await reportTenantViolation(base);
    expect(notifyOpsMock).toHaveBeenCalledTimes(1);
  });

  it("never throws into the caller's security path even if auditing fails", async () => {
    auditMock.mockRejectedValue(new Error("db down"));
    await expect(reportTenantViolation(base)).resolves.toBeUndefined();
  });
});
