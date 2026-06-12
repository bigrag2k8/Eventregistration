"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(2).max(120),
  tagline: z.string().max(160).optional(),
  aboutBlurb: z.string().max(4000).optional(),
  brandColor: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  bannerUrl: z.string().url().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
  fromEmail: z.string().email().optional().or(z.literal("")),
  fromName: z.string().max(80).optional(),
});

function normalizeColor(c?: string) {
  if (!c) return null;
  const hex = c.startsWith("#") ? c : `#${c}`;
  return hex.toUpperCase();
}

export async function updateOrgSettingsAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization linked");

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/dashboard/settings?error=validation");
  const data = parsed.data;

  await prisma.organization.update({
    where: { id: session.orgId },
    data: {
      name: data.name,
      tagline: data.tagline || null,
      aboutBlurb: data.aboutBlurb || null,
      brandColor: normalizeColor(data.brandColor || undefined),
      logoUrl: data.logoUrl || null,
      bannerUrl: data.bannerUrl || null,
      website: data.website || null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone || null,
      fromEmail: data.fromEmail || null,
      fromName: data.fromName || null,
    },
  });

  // Revalidate everything that uses the org's branding
  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (org) {
    revalidatePath(`/o/${org.slug}`);
    revalidatePath(`/o/${org.slug}/events`, "layout");
  }
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}
