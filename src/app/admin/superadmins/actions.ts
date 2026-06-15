"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isProtectedOwner } from "@/lib/owner";

const BASE = "/admin/superadmins";

async function requireSuperadmin() {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");
  return session;
}

/** Promote an existing user to SUPERADMIN by email. */
export async function grantSuperadminAction(formData: FormData) {
  const session = await requireSuperadmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect(`${BASE}?error=no_email`);

  // Case-insensitive lookup — the user must already have an account (created via
  // signup, invite, or an attendee magic-link sign-in).
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
  });
  if (!user) redirect(`${BASE}?error=not_found`);
  if (user.role === "SUPERADMIN") redirect(`${BASE}?error=already`);

  await prisma.user.update({ where: { id: user.id }, data: { role: "SUPERADMIN" } });
  await audit({
    userId: session.sub, action: "superadmin.grant", targetType: "User", targetId: user.id,
    metadata: { email: user.email, grantedBy: session.email },
  });

  revalidatePath(BASE);
  redirect(`${BASE}?granted=1`);
}

/** Demote a SUPERADMIN back to a normal role, with lockout guards. */
export async function revokeSuperadminAction(formData: FormData) {
  const session = await requireSuperadmin();
  const userId = String(formData.get("userId") ?? "");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect(`${BASE}?error=not_found`);

  // Guards, in order of importance:
  // 1. The protected owner (OWNER_EMAIL) can never be demoted.
  if (isProtectedOwner(user.email)) redirect(`${BASE}?error=owner_protected`);
  // 2. You can't demote yourself (avoids accidental self-lockout; ask another
  //    superadmin to do it).
  if (user.id === session.sub) redirect(`${BASE}?error=cant_self`);
  // 3. Never remove the last superadmin (would lock everyone out of /admin).
  const count = await prisma.user.count({ where: { role: "SUPERADMIN", deletedAt: null } });
  if (count <= 1) redirect(`${BASE}?error=last_one`);

  // Demote to ORGANIZER if they belong to an org, otherwise ATTENDEE.
  const newRole = user.organizationId ? "ORGANIZER" : "ATTENDEE";
  await prisma.user.update({ where: { id: user.id }, data: { role: newRole } });
  await audit({
    userId: session.sub, action: "superadmin.revoke", targetType: "User", targetId: user.id,
    metadata: { email: user.email, newRole, revokedBy: session.email },
  });

  revalidatePath(BASE);
  redirect(`${BASE}?revoked=1`);
}
