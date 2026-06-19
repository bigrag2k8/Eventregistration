"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isProtectedOwner, ownerEmails } from "@/lib/owner";
import { generateAdminInviteToken, adminInviteExpiry } from "@/lib/admin-invite";
import { sendAdminInviteEmail, sendAdminInviteOwnerNotice } from "@/lib/invites";

const BASE = "/admin/superadmins";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function requireSuperadmin() {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (session.role !== "SUPERADMIN") redirect("/dashboard");
  return session;
}

// Inviting/revoking brand-new platform admins is restricted to the protected
// OWNER_EMAIL account. Other SUPERADMINs can grant/revoke existing users but
// cannot mint new admins by email.
async function requireOwner() {
  const session = await requireSuperadmin();
  if (!isProtectedOwner(session.email)) redirect(`${BASE}?error=owner_only`);
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

/**
 * Invite a BRAND-NEW platform admin by email. They receive a link, set a strict
 * password, and the account is created as SUPERADMIN (no org). The platform
 * owner(s) are emailed a security notice on every invite. For someone who
 * already has an account, use "Grant SUPERADMIN" instead.
 */
export async function inviteAdminAction(formData: FormData) {
  const session = await requireOwner();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) redirect(`${BASE}?error=no_email`);

  // Already has an account → direct them to the grant flow (don't re-create).
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
  });
  if (existing) redirect(`${BASE}?error=invite_existing_user`);

  // Supersede any still-pending invite for this email.
  await prisma.adminInvite.updateMany({
    where: { email, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  const token = generateAdminInviteToken();
  const expiresAt = adminInviteExpiry();
  const invite = await prisma.adminInvite.create({
    data: { email, token, invitedBy: session.sub, expiresAt },
  });

  await sendAdminInviteEmail({ toEmail: email, token, inviterName: session.email, expiresAt });
  await sendAdminInviteOwnerNotice({
    toEmails: ownerEmails(),
    subject: "Security: a platform admin was invited",
    body: `A platform administrator (SUPERADMIN) invite was created for <strong>${email}</strong> by ${session.email}.`,
  });

  await audit({
    userId: session.sub, action: "admin.invited", targetType: "AdminInvite", targetId: invite.id,
    metadata: { email, invitedBy: session.email },
  });

  revalidatePath(BASE);
  redirect(`${BASE}?invited=1`);
}

/** Revoke a still-pending admin invite. */
export async function revokeAdminInviteAction(formData: FormData) {
  const session = await requireOwner();
  const inviteId = String(formData.get("inviteId") ?? "");

  const invite = await prisma.adminInvite.findUnique({ where: { id: inviteId } });
  if (!invite) redirect(`${BASE}?error=not_found`);
  if (invite.status === "PENDING") {
    await prisma.adminInvite.update({
      where: { id: inviteId }, data: { status: "REVOKED", revokedAt: new Date() },
    });
    await audit({
      userId: session.sub, action: "admin.invite_revoked", targetType: "AdminInvite", targetId: inviteId,
      metadata: { email: invite.email, revokedBy: session.email },
    });
  }

  revalidatePath(BASE);
  redirect(`${BASE}?invite_revoked=1`);
}
