import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { JwtPayload } from "@/lib/auth";

/**
 * Call from any dashboard page that should be blocked until the org has picked a plan.
 * If the org has planSelected=false, redirects to /dashboard/billing.
 * SUPERADMIN bypasses the gate (they can always access their own dashboard).
 */
export async function requirePlanSelected(session: JwtPayload | null) {
  if (!session?.orgId) return null;
  // Don't gate SUPERADMIN — they manage the platform itself
  if (session.role === "SUPERADMIN") return null;
  const org = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: { planSelected: true },
  });
  if (org && !org.planSelected) {
    redirect("/dashboard/billing?welcome=1");
  }
  return org;
}
