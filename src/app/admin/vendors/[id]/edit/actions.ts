"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  vendorId: z.string().min(1),
  companyName: z.string().min(1, "Company name is required").max(200),
  contactFirstName: z.string().min(1, "First name is required").max(80),
  contactLastName: z.string().min(1, "Last name is required").max(80),
  email: z.string().email("Valid email is required").max(200),
  phone: z.string().min(7, "Phone number is required").max(40),
  website: z.string().url().optional().or(z.literal("")),
  addressLine1: z.string().min(1, "Street address is required").max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(1, "State / province is required").max(100),
  zipCode: z.string().min(1, "ZIP / postal code is required").max(20),
  country: z.string().min(1, "Country is required").max(100),
  productCategory: z.string().min(1, "Product category is required").max(120),
  boothPreference: z.string().max(200).optional(),
  description: z.string().min(1, "Description is required").max(4000),
  additionalRequests: z.string().max(2000).optional(),
});

export async function updateVendorAction(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.role !== "SUPERADMIN") throw new Error("Forbidden");

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0] ?? "validation";
    const vendorId = String(formData.get("vendorId") ?? "");
    redirect(`/admin/vendors/${vendorId}/edit?error=${encodeURIComponent(String(first))}`);
  }
  const data = parsed.data;

  const target = await prisma.vendorApplication.findUnique({
    where: { id: data.vendorId },
    include: { event: { select: { organizationId: true } } },
  });
  if (!target) redirect("/admin/vendors?error=not_found");

  // Email-per-event uniqueness — if changing the email, make sure another
  // application for this event doesn't already use it.
  if (data.email !== target.email) {
    const collision = await prisma.vendorApplication.findFirst({
      where: { eventId: target.eventId, email: data.email, id: { not: target.id } },
    });
    if (collision) {
      redirect(`/admin/vendors/${target.id}/edit?error=email_in_use`);
    }
  }

  await prisma.vendorApplication.update({
    where: { id: target.id },
    data: {
      companyName: data.companyName,
      contactFirstName: data.contactFirstName,
      contactLastName: data.contactLastName,
      email: data.email,
      phone: data.phone,
      website: data.website || null,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 || null,
      city: data.city,
      state: data.state,
      zipCode: data.zipCode,
      country: data.country,
      productCategory: data.productCategory || null,
      boothPreference: data.boothPreference || null,
      description: data.description,
      additionalRequests: data.additionalRequests || null,
    },
  });

  await audit({
    organizationId: target.event.organizationId,
    userId: session.sub,
    action: "vendor.update",
    targetType: "VendorApplication",
    targetId: target.id,
    metadata: {
      changed: {
        companyName: target.companyName !== data.companyName ? { from: target.companyName, to: data.companyName } : undefined,
        contactFirstName: target.contactFirstName !== data.contactFirstName ? { from: target.contactFirstName, to: data.contactFirstName } : undefined,
        contactLastName: target.contactLastName !== data.contactLastName ? { from: target.contactLastName, to: data.contactLastName } : undefined,
        email: target.email !== data.email ? { from: target.email, to: data.email } : undefined,
        phone: target.phone !== data.phone ? { from: target.phone, to: data.phone } : undefined,
        addressLine1: target.addressLine1 !== data.addressLine1 ? { from: target.addressLine1, to: data.addressLine1 } : undefined,
        city: target.city !== data.city ? { from: target.city, to: data.city } : undefined,
        state: target.state !== data.state ? { from: target.state, to: data.state } : undefined,
        zipCode: target.zipCode !== data.zipCode ? { from: target.zipCode, to: data.zipCode } : undefined,
        country: target.country !== data.country ? { from: target.country, to: data.country } : undefined,
      },
    },
  });

  revalidatePath("/admin/vendors");
  redirect(`/admin/vendors?updated=${encodeURIComponent(data.companyName)}`);
}
