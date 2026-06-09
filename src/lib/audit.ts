import { prisma } from "@/lib/db";

interface AuditOpts {
  organizationId?: string | null;
  eventId?: string | null;
  userId?: string | null;
  action: string;                 // e.g. "event.publish", "registration.cancel"
  targetType?: string;            // "Event", "Registration", "VendorApplication", "User", "Organization"
  targetId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string | null;
}

/**
 * Append an audit log entry. Safe to call from anywhere — failures are swallowed
 * so a logging hiccup doesn't break the user's action.
 */
export async function audit(opts: AuditOpts) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: opts.organizationId ?? null,
        eventId: opts.eventId ?? null,
        userId: opts.userId ?? null,
        action: opts.action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        metadata: (opts.metadata ?? {}) as any,
        ipAddress: opts.ipAddress ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write log:", opts.action, e);
  }
}
