"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/invites";

async function requireSuperAdmin() {
  const s = await getSession();
  if (!s || s.role !== "SUPERADMIN") throw new Error("Forbidden");
  return s;
}

export async function revokeInviteAction(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("inviteId"));
  await prisma.pendingInvite.update({
    where: { id },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  revalidatePath("/admin/invites");
}

export async function resendInviteAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("inviteId"));

  const invite = await prisma.pendingInvite.findUnique({
    where: { id }, include: { organization: true },
  });
  if (!invite) throw new Error("Invite not found");
  if (invite.status !== "PENDING") throw new Error("Invite is not pending");

  // Generate a fresh token + expiry so old link is invalidated
  const newToken = crypto.randomBytes(24).toString("base64url");
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.pendingInvite.update({
    where: { id }, data: { token: newToken, expiresAt: newExpiry },
  });

  const inviter = await prisma.user.findUnique({ where: { id: session.sub } });
  const inviterName = inviter ? `${inviter.firstName ?? ""} ${inviter.lastName ?? ""}`.trim() : undefined;

  await sendInviteEmail({
    toEmail: invite.email,
    orgName: invite.organization.name,
    token: newToken,
    inviterName,
    message: invite.message,
    expiresAt: newExpiry,
  });

  revalidatePath("/admin/invites");
}
