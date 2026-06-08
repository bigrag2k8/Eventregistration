"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/invites";

const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "checkin", "dashboard", "events",
  "o", "vendor", "vendors", "signin", "signup", "signout", "static",
  "_next", "favicon.ico", "robots.txt", "sitemap.xml", "invite",
]);

const schema = z.object({
  orgName: z.string().min(2).max(120),
  orgSlug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(60),
  contactFirstName: z.string().max(80).optional(),
  contactLastName: z.string().max(80).optional(),
  contactEmail: z.string().email(),
  message: z.string().max(2000).optional(),
});

export async function createOrgAndInviteAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") throw new Error("Forbidden");

  const data = schema.parse(Object.fromEntries(formData.entries()));

  if (RESERVED_SLUGS.has(data.orgSlug)) {
    throw new Error(`"${data.orgSlug}" is a reserved slug. Pick another.`);
  }

  const existingOrg = await prisma.organization.findUnique({ where: { slug: data.orgSlug } });
  if (existingOrg) throw new Error(`Slug "${data.orgSlug}" is already taken.`);

  // Create org + invite token in one transaction
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { org } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: data.orgName, slug: data.orgSlug, contactEmail: data.contactEmail },
    });
    await tx.pendingInvite.create({
      data: {
        token,
        email: data.contactEmail,
        organizationId: org.id,
        role: "ORGANIZER",
        invitedBy: session.sub,
        message: data.message || null,
        expiresAt,
      },
    });
    return { org };
  });

  // Get inviter name for the email
  const inviter = await prisma.user.findUnique({ where: { id: session.sub } });
  const inviterName = inviter ? `${inviter.firstName ?? ""} ${inviter.lastName ?? ""}`.trim() : undefined;

  await sendInviteEmail({
    toEmail: data.contactEmail,
    toName: [data.contactFirstName, data.contactLastName].filter(Boolean).join(" ") || undefined,
    orgName: org.name,
    token,
    inviterName,
    message: data.message ?? null,
    expiresAt,
  });

  redirect(`/admin/invites?created=${org.slug}`);
}
