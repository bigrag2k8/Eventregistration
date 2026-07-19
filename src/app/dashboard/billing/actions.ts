"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

/**
 * Activate the org on the Free plan. Used the first time a new signup picks Free
 * instead of paying. Sets planSelected=true so the dashboard unlocks.
 */
export async function activateFreePlanAction() {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization linked");

  // F-07: never locally flip an org to FREE while it still has a live Stripe
  // subscription — that would stop granting premium here while Stripe keeps
  // charging them. Send them to Billing to cancel/manage first.
  const org = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: { subscriptionStatus: true },
  });
  if (org && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(org.subscriptionStatus)) {
    redirect("/dashboard/billing");
  }

  await prisma.organization.update({
    where: { id: session.orgId },
    data: {
      planSelected: true,
      subscriptionPlan: "FREE",
      subscriptionStatus: "NONE",
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/billing");
  redirect("/dashboard?activated=free");
}
