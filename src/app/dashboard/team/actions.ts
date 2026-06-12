"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/invites";
import { audit } from "@/lib/audit";

async function authorizeOrg() {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization linked to your account");
  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) throw new Error("Organization not found");
  return { session, org };
}

const inviteSchema = z.object({
  email: z.string().email(),
  invitedFirstName: z.string().max(80).optional(),
  invitedLastName: z.string().max(80).optional(),
  role: z.enum(["ORGANIZER", "STAFF", "VOLUNTEER"]),
  eventId: z.string().optional(), // empty string = org-wide
  roleDescription: z.string().max(2000).optional(),
  message: z.string().max(2000).optional(),
});

export async function inviteTeamMemberAction(formData: FormData) {
  const { session, org } = await authorizeOrg();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/dashboard/team/invite?error=validation");
  const data = parsed.data;

  // Check for existing member with this email
  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser?.organizationId === org.id) {
    redirect("/dashboard/team/invite?error=already_member");
  }
  if (existingUser) {
    redirect("/dashboard/team/invite?error=exists_elsewhere");
  }

  // Check for existing pending invite
  const existingInvite = await prisma.pendingInvite.findFirst({
    where: { organizationId: org.id, email: data.email, status: "PENDING" },
  });
  if (existingInvite) {
    redirect("/dashboard/team/invite?error=invite_pending");
  }

  // If event scoping was requested, validate it belongs to this org
  let scopedEventId: string | null = null;
  if (data.eventId) {
    const event = await prisma.event.findFirst({
      where: { id: data.eventId, organizationId: org.id, deletedAt: null },
    });
    if (!event) throw new Error("Selected event not found in this organization");
    scopedEventId = event.id;
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.pendingInvite.create({
    data: {
      token,
      email: data.email,
      invitedFirstName: data.invitedFirstName || null,
      invitedLastName: data.invitedLastName || null,
      organizationId: org.id,
      eventId: scopedEventId,
      role: data.role,
      roleDescription: data.roleDescription || null,
      invitedBy: session.sub,
      message: data.message || null,
      expiresAt,
    },
  });

  await audit({
    organizationId: org.id, eventId: scopedEventId, userId: session.sub,
    action: "team.invite", targetType: "PendingInvite", targetId: token,
    metadata: { email: data.email, role: data.role, eventScoped: !!scopedEventId },
  });

  const inviter = await prisma.user.findUnique({ where: { id: session.sub } });
  const inviterName = inviter ? `${inviter.firstName ?? ""} ${inviter.lastName ?? ""}`.trim() : undefined;
  const toName = [data.invitedFirstName, data.invitedLastName].filter(Boolean).join(" ") || undefined;

  await sendInviteEmail({
    toEmail: data.email,
    toName,
    orgName: org.name,
    token,
    inviterName,
    message: data.message ?? null,
    expiresAt,
    role: data.role,
    roleDescription: data.roleDescription ?? null,
  });

  redirect("/dashboard/team?invited=" + encodeURIComponent(data.email));
}

export async function resendTeamInviteAction(formData: FormData) {
  const { session, org } = await authorizeOrg();
  const id = String(formData.get("inviteId"));

  const invite = await prisma.pendingInvite.findFirst({
    where: { id, organizationId: org.id, status: "PENDING" },
    include: { organization: true },
  });
  if (!invite) throw new Error("Invite not found or not pending");

  const newToken = crypto.randomBytes(24).toString("base64url");
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.pendingInvite.update({
    where: { id }, data: { token: newToken, expiresAt: newExpiry },
  });

  const inviter = await prisma.user.findUnique({ where: { id: session.sub } });
  const inviterName = inviter ? `${inviter.firstName ?? ""} ${inviter.lastName ?? ""}`.trim() : undefined;
  const toName = [invite.invitedFirstName, invite.invitedLastName].filter(Boolean).join(" ") || undefined;

  await sendInviteEmail({
    toEmail: invite.email,
    toName,
    orgName: invite.organization.name,
    token: newToken,
    inviterName,
    message: invite.message,
    expiresAt: newExpiry,
    role: invite.role,
    roleDescription: invite.roleDescription,
  });

  revalidatePath("/dashboard/team");
}

export async function revokeTeamInviteAction(formData: FormData) {
  const { org } = await authorizeOrg();
  const id = String(formData.get("inviteId"));
  await prisma.pendingInvite.updateMany({
    where: { id, organizationId: org.id, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  revalidatePath("/dashboard/team");
}

export async function removeMemberAction(formData: FormData) {
  const { session, org } = await authorizeOrg();
  const userId = String(formData.get("userId"));

  if (userId === session.sub) {
    redirect("/dashboard/team?error=remove_self");
  }

  const target = await prisma.user.findFirst({ where: { id: userId, organizationId: org.id } });
  // Detach the user from this org; don't delete the user (they may have history)
  await prisma.user.updateMany({
    where: { id: userId, organizationId: org.id },
    data: { organizationId: null, role: "ATTENDEE" },
  });

  await audit({
    organizationId: org.id, userId: session.sub,
    action: "team.remove", targetType: "User", targetId: userId,
    metadata: { email: target?.email, removedRole: target?.role },
  });

  revalidatePath("/dashboard/team");
}
