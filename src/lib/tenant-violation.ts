import { audit } from "@/lib/audit";
import { notifyOps } from "@/lib/alert";
import { rateLimit } from "@/lib/rate-limit";

interface TenantViolationOpts {
  /** The authenticated actor (JwtPayload-shaped). */
  session: { sub: string; orgId?: string; email: string; role: string };
  /** The kind of resource that was reached for, e.g. "Event", "Registration". */
  resourceType: string;
  /** The id the actor supplied. */
  resourceId: string;
  /** The org that actually owns the resource (the victim), when known. */
  ownerOrgId?: string | null;
  /** Where the violation was detected, for the alert/audit trail. */
  route: string;
}

/**
 * Record — and alert on — a detected cross-tenant access attempt.
 *
 * Background: tenant isolation here is mostly enforced by folding
 * `organizationId` into a Prisma WHERE (orgScope), which silently returns no
 * rows for a foreign id. That is safe, but it leaves NO trail: the F-01
 * marketing-audience BOLA could not be audited after the fact because nothing
 * logged tenant-boundary reads. This closes that gap for the choke points where
 * the app can actually distinguish a foreign id (resource exists, other org)
 * from a stale/typo id (no such resource).
 *
 * ALWAYS writes an `authz.tenant_violation` audit row (cheap, durable — the
 * forensic record). The email alert is throttled to one per actor per hour so a
 * scanner probing ids can't flood the ops inbox; the audit rows still capture
 * every attempt for later review. Fully non-throwing: a logging/alerting hiccup
 * must never change the security decision (the caller still denies the request).
 */
export async function reportTenantViolation(opts: TenantViolationOpts): Promise<void> {
  try {
    await audit({
      organizationId: opts.session.orgId ?? null,
      userId: opts.session.sub,
      action: "authz.tenant_violation",
      targetType: opts.resourceType,
      targetId: opts.resourceId,
      metadata: {
        route: opts.route,
        actorEmail: opts.session.email,
        actorRole: opts.session.role,
        actorOrgId: opts.session.orgId ?? null,
        resourceOwnerOrgId: opts.ownerOrgId ?? null,
      },
    });

    // Throttle the email (not the audit row). failOpen: this is an alert, not a
    // gate — on a Redis outage we'd rather send a duplicate than miss one.
    let allowed = true;
    try {
      allowed = (await rateLimit(`tenant-violation-alert:${opts.session.sub}`, 1, 3600, { failOpen: true })).allowed;
    } catch {
      allowed = true;
    }
    if (!allowed) return;

    await notifyOps(
      `Cross-tenant access attempt blocked (${opts.resourceType})`,
      `A tenant-isolation violation was detected and the request was DENIED.\n\n` +
        `Actor:      ${opts.session.email} (user ${opts.session.sub}, role ${opts.session.role})\n` +
        `Actor org:  ${opts.session.orgId ?? "—"}\n` +
        `Resource:   ${opts.resourceType} ${opts.resourceId}\n` +
        `Owner org:  ${opts.ownerOrgId ?? "unknown"}\n` +
        `Detected:   ${opts.route}\n\n` +
        `The request was blocked by tenant scoping. Investigate if this repeats, ` +
        `targets many ids, or the actor is unexpected. Further attempts by this ` +
        `actor within the next hour are logged (audit action authz.tenant_violation) ` +
        `but not re-emailed.`,
    );
  } catch (e) {
    // Never let observability throw into the caller's security path.
    console.error("[tenant-violation] failed to record/alert:", opts.route, e);
  }
}
