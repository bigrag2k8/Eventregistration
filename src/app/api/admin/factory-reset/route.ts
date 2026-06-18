import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { isProtectedOwner } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { notifyOps } from "@/lib/alert";

/**
 * DANGER: factory-resets the platform.
 *
 * Wipes:
 *   - All events (cascades tickets, registrations, payments, vendor apps,
 *     ticket types, custom questions/answers, check-ins, email logs,
 *     promo codes, referral links/clicks, waitlist, abandoned carts,
 *     event assignments, speakers, media, tags, locations)
 *   - All pending invites
 *   - All audit logs
 *   - All sessions (except the calling SUPERADMIN's)
 *   - All users except the calling SUPERADMIN
 *   - All organizations except the calling SUPERADMIN's own org
 *
 * Keeps:
 *   - The calling SUPERADMIN's User row (so login still works)
 *   - The calling SUPERADMIN's Organization (branding, Stripe Connect, sub plan)
 *   - The Plan / price-id mapping (it lives in code, not DB)
 *
 * Confirmation: client must POST { confirm: "WIPE EVERYTHING" }
 */
export async function POST(req: Request) {
  const session = requireRole(["SUPERADMIN"], await getSession());
  // Owner-only: restrict the platform wipe to the protected OWNER_EMAIL account.
  // Not every SUPERADMIN can fire it — this is the most destructive operation.
  if (!isProtectedOwner(session.email)) {
    return NextResponse.json({ error: "Only the platform owner can factory-reset." }, { status: 403 });
  }
  // Rate limit (3/hour per user) so a hijacked session can't loop the wipe.
  const ip = clientIp(req);
  const rl = await rateLimit(`factory-reset:${session.sub}`, 3, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many factory-reset attempts. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "WIPE EVERYTHING") {
    return NextResponse.json(
      { error: "Confirmation phrase did not match. Type WIPE EVERYTHING exactly." },
      { status: 400 },
    );
  }

  // Identify what to keep
  const me = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!me) return NextResponse.json({ error: "Calling user not found" }, { status: 500 });
  const keepUserId = me.id;
  const keepOrgId = me.organizationId; // may be null

  // Durable forensics: the in-DB audit log is itself deleted by the wipe (and
  // again on any re-run), so email an ops alert BEFORE wiping — an external
  // record that survives the reset. Non-throwing if OPS_ALERT_EMAIL is unset.
  await notifyOps(
    "Platform factory reset triggered",
    `A factory reset ("WIPE EVERYTHING") was initiated by ${session.email} (user ${session.sub}) from ${ip} at ${new Date().toISOString()}. ` +
      `All events, users, organizations, invites, audit logs, and other sessions are being deleted, keeping only that account and its organization.`,
  );

  // Run all deletes in a single transaction so it either fully wipes or rolls back
  const result = await prisma.$transaction(async (tx) => {
    // Sessions — drop everyone except the caller's
    const sessionsDeleted = await tx.session.deleteMany({
      where: { userId: { not: keepUserId } },
    });

    // Events — cascade handles tickets, regs, payments, vendor apps, ticket types,
    // check-ins, email campaigns/logs, promo codes, referral links/clicks,
    // waitlist, abandoned carts, event assignments, speakers, media, tags, locations.
    const eventsDeleted = await tx.event.deleteMany({});

    // Pending invites
    const invitesDeleted = await tx.pendingInvite.deleteMany({});

    // Audit logs
    const auditDeleted = await tx.auditLog.deleteMany({});

    // Users — keep only the caller
    const usersDeleted = await tx.user.deleteMany({
      where: { id: { not: keepUserId } },
    });

    // Organizations — keep only the caller's (if any)
    const orgsDeleted = await tx.organization.deleteMany({
      where: keepOrgId ? { id: { not: keepOrgId } } : {},
    });

    return {
      events: eventsDeleted.count,
      pendingInvites: invitesDeleted.count,
      auditLogs: auditDeleted.count,
      sessions: sessionsDeleted.count,
      users: usersDeleted.count,
      organizations: orgsDeleted.count,
    };
  });

  // After the wipe is committed, write a single audit log entry so there's a record.
  if (keepOrgId) {
    await prisma.auditLog.create({
      data: {
        organizationId: keepOrgId,
        userId: keepUserId,
        action: "platform.factory_reset",
        targetType: "Platform",
        metadata: result as any,
      },
    });
  }

  return NextResponse.json({ ok: true, deleted: result });
}
