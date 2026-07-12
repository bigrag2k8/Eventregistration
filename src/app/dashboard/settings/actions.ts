"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { stripe, stripeConfigured } from "@/lib/stripe";

const schema = z.object({
  name: z.string().min(2).max(120),
  tagline: z.string().max(160).optional(),
  aboutBlurb: z.string().max(4000).optional(),
  brandColor: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  bannerUrl: z.string().url().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().min(7, "Phone number is required").max(40),
  // Checkboxes: present in FormData ("on") only when checked, absent otherwise.
  showTeamPhones: z.string().optional(),
  showPrivateEvents: z.string().optional(),
  addressLine1: z.string().min(1, "Street address is required").max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(1, "State / province is required").max(100),
  zipCode: z.string().min(1, "ZIP / postal code is required").max(20),
  country: z.string().min(1, "Country is required").max(100),
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

  // Snapshot the BEFORE state so we know whether name/website/email/phone
  // changed and need to be synced to the connected Stripe account.
  const before = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: {
      name: true, website: true, contactEmail: true, contactPhone: true,
      stripeAccountId: true,
    },
  });

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
      contactPhone: data.contactPhone,
      // Unchecked checkboxes are absent from FormData → treat as false/true default.
      showTeamPhones: data.showTeamPhones === "on",
      showPrivateEvents: data.showPrivateEvents === "on",
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 || null,
      city: data.city,
      state: data.state,
      zipCode: data.zipCode,
      country: data.country,
      // Per-org custom email sender removed — all mail uses the platform sender
      // (events@yourevents.app). Clear any stale value a prior save left behind
      // so it can never override the verified sender.
      fromEmail: null,
      fromName: null,
    },
  });

  // Sync to the connected Stripe account so the org's business name on the
  // Stripe Checkout merchant header (and dashboard) matches what's saved
  // here. Best-effort: if Stripe rejects (account not yet onboarded, missing
  // capability, etc.) we log and move on — the org save itself already
  // succeeded, and the next save will retry.
  if (
    before?.stripeAccountId &&
    stripeConfigured &&
    (
      before.name !== data.name ||
      before.website !== (data.website || null) ||
      before.contactEmail !== (data.contactEmail || null) ||
      before.contactPhone !== data.contactPhone
    )
  ) {
    try {
      // business_profile.name is what powers the merchant header on Stripe
      // Checkout (the line above "by [account holder]"). The Stripe Express
      // dashboard display name follows the same field automatically.
      await stripe.accounts.update(before.stripeAccountId, {
        business_profile: {
          name: data.name,
          url: data.website || undefined,
          support_email: data.contactEmail || undefined,
          support_phone: data.contactPhone || undefined,
        },
      });
    } catch (e) {
      console.warn("[settings] Stripe profile sync failed", e);
    }
  }

  // Revalidate everything that uses the org's branding
  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (org) {
    revalidatePath(`/o/${org.slug}`);
    revalidatePath(`/o/${org.slug}/events`, "layout");
  }
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings?saved=1");
}
