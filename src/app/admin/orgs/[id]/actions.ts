"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { OVERRIDABLE_LIMITS, parseOverrides, PlanOverrides } from "@/lib/plans";

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
