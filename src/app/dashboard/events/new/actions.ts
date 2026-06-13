"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(2).max(200),
  shortDescription: z.string().max(160).optional(),
  description: z.string().min(10),
  category: z.string().optional(),
  tags: z.string().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  timezone: z.string().default("UTC"),
  isVirtual: z.string().optional(),
  venueName: z.string().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default("US"),
  virtualUrl: z.string().optional(),
  ticketName: z.string().min(1),
  ticketPrice: z.string().default("0"),
  ticketQuantity: z.string().optional(),
  ticketMaxPerOrder: z.string().optional(),
  capacity: z.string().optional(),
  contactEmail: z.string().optional(),
  refundPolicy: z.string().optional(),
  vendorRegistrationEnabled: z.string().optional(),
  vendorApplicationNotes: z.string().optional(),
  defaultVendorPrice: z.string().optional(),
  bannerUrl: z.string().url().optional().or(z.literal("")),
  isPrivate: z.string().optional(),
  // "free" (basic, capped) or "single_event" (premium — spends one credit).
  tier: z.enum(["free", "single_event"]).default("free"),
  action: z.string().default("draft"),
});

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function uniqueSlug(base: string, organizationId: string) {
  let slug = base || `event-${Date.now()}`;
  let n = 0;
  while (await prisma.event.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
  })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export async function createEventAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization linked");

  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) redirect("/dashboard/events/new?error=validation");
  const data = parsed.data;

  // The form sends wall-clock strings (datetime-local, no offset) that mean
  // "this time in the event's timezone". Convert to the correct UTC instant
  // with the selected timezone — not the server's — before storing.
  const startAt = fromZonedTime(data.startAt, data.timezone);
  const endAt = fromZonedTime(data.endAt, data.timezone);
  // Friendly inline error instead of a server-side exception page
  if (endAt <= startAt) {
    redirect("/dashboard/events/new?error=date_order");
  }

  const org = await prisma.organization.findUnique({ where: { id: session.orgId } });
  if (!org) throw new Error("Organization not found");

  // Free + Single Event model: every org runs unlimited FREE events; a PREMIUM
  // event spends one single-event credit. Claim the credit up front with a
  // conditional decrement so an event is never marked premium without a paid
  // credit, and two concurrent submits can't spend the same credit twice.
  let isPremium = false;
  if (data.tier === "single_event") {
    const claimed = await prisma.organization.updateMany({
      where: { id: org.id, singleEventCredits: { gt: 0 } },
      data: { singleEventCredits: { decrement: 1 } },
    });
    if (claimed.count === 0) redirect("/dashboard/events/new?error=no_credits");
    isPremium = true;
  }

  const slug = await uniqueSlug(slugify(data.name), session.orgId);
  const isVirtual = data.isVirtual === "1";
  const priceCents = Math.round(parseFloat(data.ticketPrice || "0") * 100);
  const ticketKind = priceCents === 0 ? "FREE" : "GENERAL";
  const ticketQty = data.ticketQuantity ? parseInt(data.ticketQuantity) : null;
  const maxPerOrder = data.ticketMaxPerOrder ? parseInt(data.ticketMaxPerOrder) : 10;
  const capacity = data.capacity ? parseInt(data.capacity) : null;
  const publish = data.action === "publish";

  const tagList = (data.tags ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const hasAddress = data.addressLine1 && data.city;

  const event = await prisma.event.create({
    data: {
      slug,
      name: data.name,
      shortDescription: data.shortDescription,
      description: data.description,
      category: data.category || null,
      status: publish ? "PUBLISHED" : "DRAFT",
      isPremium,
      startAt,
      endAt,
      timezone: data.timezone,
      capacity,
      contactEmail: data.contactEmail || null,
      refundPolicy: data.refundPolicy || null,
      // Vendor flow is a premium feature — free events can't enable it.
      vendorRegistrationEnabled: isPremium && data.vendorRegistrationEnabled === "1",
      isPrivate: data.isPrivate === "1",
      vendorApplicationNotes: data.vendorApplicationNotes || null,
      defaultVendorPriceCents: Math.round(parseFloat(data.defaultVendorPrice || "0") * 100),
      bannerUrl: data.bannerUrl || null,
      organizationId: session.orgId,
      publishedAt: publish ? new Date() : null,
      location: hasAddress || isVirtual
        ? {
            create: {
              isVirtual,
              virtualUrl: isVirtual ? data.virtualUrl ?? null : null,
              venueName: data.venueName ?? null,
              addressLine1: data.addressLine1 ?? "",
              city: data.city ?? "",
              state: data.state ?? null,
              postalCode: data.postalCode ?? null,
              country: data.country ?? "US",
            },
          }
        : undefined,
      tags: tagList.length ? { create: tagList.map((tag) => ({ tag })) } : undefined,
      ticketTypes: {
        create: {
          name: data.ticketName,
          kind: ticketKind,
          priceCents,
          quantityTotal: ticketQty,
          maxPerOrder,
          sortOrder: 0,
        },
      },
    },
  });

  redirect(`/dashboard/events/${event.id}`);
}
