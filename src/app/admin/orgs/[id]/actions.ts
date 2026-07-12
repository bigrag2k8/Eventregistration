"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { OVERRIDABLE_LIMITS, parseOverrides, PlanOverrides } from "@/lib/plans";
import { resyncOrgSubscription } from "@/server/billing";
import { isProtectedOwner } from "@/lib/owner";
import { notifyOps } from "@/lib/alert";
import { stripe } from "@/lib/stripe";

const PLAN_KEYS = ["FREE", "SINGLE_EVENT", "STARTER", "PRO", "ENTERPRISE"] as const;
const STATUS_KEYS = ["NONE", "ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INCOMPLETE"] as const;

const overrideMode = z.enum(["default", "unlimited", "custom"]);

const schema = z.object({
  orgId: z.string().min(1),
  subscriptionPlan: z.enum(PLAN_KEYS),
  subscriptionStatus: z.enum(STATUS_KEYS),
  singleEventCredits: z.coerce.number().int().min(0).max(100_000),
  monthlyEventLimit_mode: overrideMode,
  monthlyEventLimit_value: z.string().optional(),
  registrationLimitPerEvent_mode: overrideMode,
  registrationLimitPerEvent_value: z.string().optional(),
  emailCampaignsPerEvent_mode: overrideMode,
  emailCampaignsPerEvent_value: z.string().optional(),
});

/** Translate the per-limit (mode, value) pairs into a PlanOverrides object. */
function buildOverrides(data: Record<string, unknown>): PlanOverrides {
  const out: PlanOverrides = {};
  for (const key of OVERRIDABLE_LIMITS) {
    const mode = data[`${key}_mode`];
    if (mode === "unlimited") {
      out[key] = null;
      continue;
    }
    if (mode === "custom") {
      const raw = String(data[`${key}_value`] ?? "").trim();
      const n = Number(raw);
      if (raw !== "" && Number.isFinite(n) && n >= 0) out[key] = Math.floor(n);
      // blank/invalid custom value → fall through to plan default (no override)
    }
    // mode === "default" → no override
  }
  return out;
}

/**
 * SUPERADMIN-only: set an org's plan, subscription status, single-event credits,
 * and per-org limit overrides. Overrides flow through effectivePlan(), so they
 * take effect everywhere plan limits are enforced (event creation, registration
 * caps, email-broadcast limits) and on the org's own billing page.
 */
export async function editOrgSubscriptionAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("Forbidden");

  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const orgId = String(formData.get("orgId") ?? "");
    redirect(`/admin/orgs/${orgId}?error=validation`);
  }
  const data = parsed.data;

  const org = await prisma.organization.findUnique({ where: { id: data.orgId } });
  if (!org || org.deletedAt) redirect("/admin?error=org_not_found");

  const overrides = buildOverrides(raw);
  const hasOverrides = Object.keys(overrides).length > 0;

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      subscriptionPlan: data.subscriptionPlan,
      subscriptionStatus: data.subscriptionStatus,
      singleEventCredits: data.singleEventCredits,
      // Clear the column to SQL NULL when there are no overrides left.
      planOverrides: hasOverrides ? (overrides as Prisma.InputJsonValue) : Prisma.DbNull,
      // An admin assigning a plan has, by definition, made a plan selection.
      planSelected: true,
    },
  });

  await audit({
    organizationId: org.id,
    userId: session.sub,
    action: "org.subscription_update",
    targetType: "Organization",
    targetId: org.id,
    metadata: {
      before: {
        plan: org.subscriptionPlan,
        status: org.subscriptionStatus,
        credits: org.singleEventCredits,
        overrides: parseOverrides(org.planOverrides),
      },
      after: {
        plan: data.subscriptionPlan,
        status: data.subscriptionStatus,
        credits: data.singleEventCredits,
        overrides,
      },
    },
  });

  redirect(`/admin/orgs/${org.id}?saved=1`);
}

/**
 * SUPERADMIN-only: clear an org's Stripe Connect link so it can re-onboard from
 * scratch. Use when the stored connected account is orphaned — e.g. it was
 * created under a different Stripe platform/sandbox and the current key can no
 * longer access it. This only nulls our local references; it does NOT delete the
 * Stripe account. The org's next "Connect with Stripe" creates a fresh account.
 */
export async function resetConnectAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("Forbidden");

  const orgId = String(formData.get("orgId") ?? "");
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org || org.deletedAt) redirect("/admin?error=org_not_found");

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      stripeAccountId: null,
      stripeAccountChargesEnabled: false,
      stripeAccountPayoutsEnabled: false,
      stripeAccountDetailsSubmitted: false,
      stripeAccountStatus: "not_started",
    },
  });

  await audit({
    organizationId: org.id,
    userId: session.sub,
    action: "org.connect_reset",
    targetType: "Organization",
    targetId: org.id,
    metadata: { clearedAccountId: org.stripeAccountId },
  });

  redirect(`/admin/orgs/${org.id}?connect_reset=1`);
}

/**
 * SUPERADMIN-only: re-pull an org's subscription from Stripe and re-sync its
 * plan/status. Use when the stored status drifted from Stripe (e.g. an org left
 * stuck INCOMPLETE by an out-of-order webhook). Reads the live subscription, so
 * it self-heals to whatever Stripe currently reports.
 */
export async function resyncSubscriptionAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("Forbidden");

  const orgId = String(formData.get("orgId") ?? "");
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org || org.deletedAt) redirect("/admin?error=org_not_found");

  const res = await resyncOrgSubscription(orgId);

  await audit({
    organizationId: orgId,
    userId: session.sub,
    action: "org.subscription_resync",
    targetType: "Organization",
    targetId: orgId,
    metadata: { result: res },
  });

  redirect(
    `/admin/orgs/${orgId}?${res.ok ? `resynced=${res.status ?? "ok"}` : `error=resync_${res.reason === "no_subscription" ? "no_subscription" : "failed"}`}`,
  );
}

/**
 * SUPERADMIN-only: permanently delete an organization and everything tied to it.
 *
 * Wipes:
 *   - All this org's events, and via cascade their registrations, tickets,
 *     payments, vendor applications, ticket types, custom questions/answers,
 *     check-ins, promo codes, referral links/clicks, waitlist, abandoned carts,
 *     email campaigns/logs, event assignments, speakers, media, tags, locations.
 *   - All this org's pending invites (cascade).
 *   - All team members of this org (ORGANIZER / STAFF / VOLUNTEER / ADMIN
 *     accounts whose organizationId matches), and via their User cascade their
 *     sessions, magic links, MFA secrets, password resets.
 *
 * Spared on purpose:
 *   - Any SUPERADMIN whose organizationId pointed here — they keep their User
 *     row but get detached (organizationId nulls out via SetNull). Avoids
 *     accidentally nuking platform admin access.
 *   - Attendee Users — they may have registered for events at other orgs too,
 *     so we don't touch their accounts. Their registrations to THIS org's
 *     events still cascade with the events.
 *   - Audit logs, billing invoices, and disputes referencing this org — their
 *     organizationId nulls via SetNull so the historical record survives.
 *
 * Safeguards:
 *   - Caller can't delete their own org (would self-lockout).
 *   - The protected owner's org can never be deleted via this path — that's
 *     what the factory reset (owner-only) is for.
 *
 * Confirmation: the form must POST `confirmName` equal to the org name.
 */
const deleteOrgSchema = z.object({
  orgId: z.string().min(1),
  confirmName: z.string().min(1),
});

export async function deleteOrgAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("Forbidden");

  const parsed = deleteOrgSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const orgId = String(formData.get("orgId") ?? "");
    redirect(`/admin/orgs/${orgId}?error=delete_validation`);
  }
  const { orgId, confirmName } = parsed.data;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { _count: { select: { events: true, members: true } } },
  });
  if (!org || org.deletedAt) redirect("/admin?error=org_not_found");

  // The confirm phrase must match the org name exactly (case-insensitive, trimmed)
  // so a misclick on a different org can't accidentally wipe data.
  if (confirmName.trim().toLowerCase() !== org.name.trim().toLowerCase()) {
    redirect(`/admin/orgs/${org.id}?error=delete_name_mismatch`);
  }

  // Self-lockout guard: an admin who is a member of this org would delete
  // their own account along with everything else.
  if (session.orgId === org.id) {
    redirect(`/admin/orgs/${org.id}?error=delete_own_org`);
  }

  // Owner-protected org guard: if any member of this org is a protected owner
  // (OWNER_EMAIL), refuse. The owner's org can only be wiped via the factory
  // reset, which is owner-only and has its own confirmation flow.
  const ownerMember = await prisma.user.findFirst({
    where: { organizationId: org.id, deletedAt: null },
    select: { email: true },
  });
  if (ownerMember && isProtectedOwner(ownerMember.email)) {
    redirect(`/admin/orgs/${org.id}?error=delete_owner_org`);
  }
  // Also check across all members (the first one might not be the owner)
  const members = await prisma.user.findMany({
    where: { organizationId: org.id, deletedAt: null },
    select: { email: true, role: true, id: true },
  });
  if (members.some((m) => isProtectedOwner(m.email))) {
    redirect(`/admin/orgs/${org.id}?error=delete_owner_org`);
  }

  // Durable forensic alert BEFORE the destructive transaction (the in-DB audit
  // log entry is written after, but ops-email survives even if the post-commit
  // audit write fails).
  await notifyOps(
    `Organization deleted: ${org.name}`,
    `SUPERADMIN ${session.email} (user ${session.sub}) deleted organization "${org.name}" (id ${org.id}, slug ${org.slug}) at ${new Date().toISOString()}. ` +
      `Cascaded ${org._count.events} event(s), ${org._count.members} member(s). All events, registrations, payments, and team accounts for this org are gone.`,
  );

  const teamRoles = ["ORGANIZER", "STAFF", "VOLUNTEER", "ADMIN"] as const;

  const result = await prisma.$transaction(async (tx) => {
    // Delete team members. SUPERADMINs in this org are intentionally left to
    // SetNull (defensive), and ATTENDEE users in this org are left alone.
    const teamDeleted = await tx.user.deleteMany({
      where: {
        organizationId: org.id,
        role: { in: teamRoles as unknown as ("ORGANIZER" | "STAFF" | "VOLUNTEER" | "ADMIN")[] },
      },
    });

    // Delete the org. Cascades: events (and via them, every event child),
    // pending invites. SetNull on the rest (SUPERADMINs detach, audit logs
    // detach, billing invoices/disputes detach).
    await tx.organization.delete({ where: { id: org.id } });

    return {
      teamMembersDeleted: teamDeleted.count,
      eventsAtDelete: org._count.events,
      membersAtDelete: org._count.members,
    };
  });

  // Org-less audit log entry — AuditLog.organizationId is optional (and is set
  // null on cascade); we write this AFTER commit so an audit failure can't roll
  // back the delete.
  await audit({
    userId: session.sub,
    action: "org.deleted",
    targetType: "Organization",
    targetId: org.id,
    metadata: {
      name: org.name,
      slug: org.slug,
      deletedBy: session.email,
      ...result,
    },
  });

  redirect(`/admin?org_deleted=${encodeURIComponent(org.name)}`);
}

/**
 * SUPERADMIN-only: toggle whether this org's events pass Stripe's card-
 * processing fee through to the attendee. Default off (organizer absorbs via
 * the platform fee). When on, every paid registration adds a clearly-labeled
 * "Payment processing fee" line at checkout. The 5% platform fee is unaffected.
 */
const passProcessingFeeSchema = z.object({
  orgId: z.string().min(1),
  passProcessingFee: z.string().optional(), // checkbox: "1" if checked, absent otherwise
});

export async function setOrgPassProcessingFeeAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("Forbidden");

  const parsed = passProcessingFeeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const orgId = String(formData.get("orgId") ?? "");
    redirect(`/admin/orgs/${orgId}?error=validation`);
  }
  const { orgId, passProcessingFee } = parsed.data;
  const value = passProcessingFee === "1";

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org || org.deletedAt) redirect("/admin?error=org_not_found");

  await prisma.organization.update({
    where: { id: org.id },
    data: { passProcessingFee: value },
  });

  await audit({
    organizationId: org.id,
    userId: session.sub,
    action: "org.pass_processing_fee_set",
    targetType: "Organization",
    targetId: org.id,
    metadata: { before: org.passProcessingFee, after: value, by: session.email },
  });

  redirect(`/admin/orgs/${org.id}?saved=1`);
}

/**
 * SUPERADMIN-only: graduate an org to fast (daily) Stripe payouts. Flips
 * fastPayoutsEnabled and pushes the daily schedule to Stripe. New orgs are HELD by
 * default (manual payouts, released per-event by the worker 1 day after each event);
 * the worker also auto-graduates an org after 5 clean events. Use this to promote
 * a trusted org early. See docs/Payout-Hold-Phase0.md.
 */
export async function setOrgFastPayoutsAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("Forbidden");

  const orgId = String(formData.get("orgId") ?? "");
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org || org.deletedAt) redirect("/admin?error=org_not_found");
  if (org.fastPayoutsEnabled) redirect(`/admin/orgs/${org.id}?saved=1`); // already fast

  // Push the daily schedule to Stripe if the org has a connected account. (If it
  // hasn't onboarded yet, the flag alone makes onboarding pick "daily".)
  if (org.stripeAccountId) {
    try {
      await stripe.accounts.update(org.stripeAccountId, {
        settings: { payouts: { schedule: { interval: "daily" } } },
      });
    } catch (e: any) {
      console.error("[admin] fast-payouts stripe update failed:", e?.message);
      redirect(`/admin/orgs/${org.id}?error=stripe_update_failed`);
    }
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { fastPayoutsEnabled: true },
  });

  await audit({
    organizationId: org.id,
    userId: session.sub,
    action: "payout.fast_enabled",
    targetType: "Organization",
    targetId: org.id,
    metadata: { by: session.email, manual: true },
  });

  redirect(`/admin/orgs/${org.id}?saved=1`);
}

/**
 * SUPERADMIN-only: the reverse of setOrgFastPayoutsAction — put an org back on
 * HELD payouts. Flips fastPayoutsEnabled off and switches their Stripe payout
 * schedule to "manual", so from this moment ticket funds accumulate in their
 * Stripe balance and the worker releases them per-event after each event ends.
 *
 * Notes:
 *  - Money already paid out to their bank (e.g. while they were on daily) cannot
 *    be clawed back; the hold protects sales from now on.
 *  - Events that already ended are stamped payoutReleasedAt so the worker doesn't
 *    chase pre-hold history it can never reconcile.
 */
export async function setOrgHoldPayoutsAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("Forbidden");

  const orgId = String(formData.get("orgId") ?? "");
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org || org.deletedAt) redirect("/admin?error=org_not_found");
  if (!org.fastPayoutsEnabled) redirect(`/admin/orgs/${org.id}?saved=1`); // already held

  if (org.stripeAccountId) {
    try {
      await stripe.accounts.update(org.stripeAccountId, {
        settings: { payouts: { schedule: { interval: "manual" } } },
      });
    } catch (e: any) {
      console.error("[admin] hold-payouts stripe update failed:", e?.message);
      redirect(`/admin/orgs/${org.id}?error=stripe_update_failed`);
    }
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { fastPayoutsEnabled: false },
  });

  // Housekeeping: pre-hold events that already ended were paid via the old daily
  // schedule — mark them released so the worker only manages events from here on.
  const stamped = await prisma.event.updateMany({
    where: { organizationId: org.id, endAt: { lt: new Date() }, payoutReleasedAt: null },
    data: { payoutReleasedAt: new Date() },
  });

  await audit({
    organizationId: org.id,
    userId: session.sub,
    action: "payout.hold_enabled",
    targetType: "Organization",
    targetId: org.id,
    metadata: { by: session.email, priorEventsStamped: stamped.count },
  });

  redirect(`/admin/orgs/${org.id}?saved=1`);
}
