"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { audit } from "@/lib/audit";

async function authorize(eventId: string) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: eventId, ...orgScope(session), deletedAt: null },
  });
  if (!event) throw new Error("Forbidden");
  return { session, event };
}

const createSchema = z.object({
  code: z.string().min(2).max(40),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.string(),
  usageLimit: z.string().optional(),
  expiresAt: z.string().optional(),
});

export async function createPromoCodeAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { session, event } = await authorize(eventId);
  const basePath = `/dashboard/events/${event.id}/promo-codes`;

  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${basePath}?error=validation`);
  const d = parsed.data;

  // Normalize to uppercase; codes are matched case-insensitively at checkout but
  // stored consistently so the @@unique([eventId, code]) does what organizers expect.
  const code = d.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) redirect(`${basePath}?error=bad_code`);

  const num = parseFloat(d.value);
  if (!isFinite(num) || num <= 0) redirect(`${basePath}?error=bad_value`);

  let percentage: number | null = null;
  let amountCents: number | null = null;
  if (d.discountType === "PERCENTAGE") {
    if (num < 1 || num > 100) redirect(`${basePath}?error=bad_percent`);
    percentage = num;
  } else {
    amountCents = Math.round(num * 100);
  }

  const usageLimit = d.usageLimit && d.usageLimit.trim() ? Math.max(1, parseInt(d.usageLimit, 10)) : null;
  // Expiry entered in the event's timezone, mirroring the presale field.
  const expiresAt = d.expiresAt && d.expiresAt.trim() ? fromZonedTime(d.expiresAt, event.timezone) : null;

  try {
    await prisma.promoCode.create({
      data: {
        eventId: event.id,
        code,
        discountType: d.discountType,
        percentage,
        amountCents,
        usageLimit,
        expiresAt,
        isActive: true,
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002") redirect(`${basePath}?error=dupe_code`);
    throw e;
  }

  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "promo_code.create", targetType: "PromoCode", targetId: code,
    metadata: { code, discountType: d.discountType, percentage, amountCents, usageLimit },
  });

  revalidatePath(basePath);
  revalidatePath(`/dashboard/events/${event.id}`);
}

export async function togglePromoCodeAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const id = String(formData.get("promoCodeId"));
  const { event } = await authorize(eventId);
  const basePath = `/dashboard/events/${event.id}/promo-codes`;

  const promo = await prisma.promoCode.findFirst({ where: { id, eventId: event.id } });
  if (!promo) redirect(`${basePath}?error=not_found`);

  await prisma.promoCode.update({ where: { id: promo.id }, data: { isActive: !promo.isActive } });
  revalidatePath(basePath);
}

export async function deletePromoCodeAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const id = String(formData.get("promoCodeId"));
  const { event } = await authorize(eventId);
  const basePath = `/dashboard/events/${event.id}/promo-codes`;

  const promo = await prisma.promoCode.findFirst({ where: { id, eventId: event.id } });
  if (!promo) redirect(`${basePath}?error=not_found`);
  // A code that's already been redeemed is part of order history — deactivate it
  // instead of deleting so the registrations keep their link.
  if (promo.usageCount > 0) redirect(`${basePath}?error=in_use`);

  await prisma.promoCode.delete({ where: { id: promo.id } });
  revalidatePath(basePath);
}
