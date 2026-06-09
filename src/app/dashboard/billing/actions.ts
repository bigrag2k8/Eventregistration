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
