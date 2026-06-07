"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
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

async function uniqueSlug(base: string) {
  let slug = base || `event-${Date.now()}`;
  let n = 0;
  while (await prisma.event.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export async function createEventAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization linked");

  const raw = Object.fromEntries(formData.entries());
  const data = schema.parse(raw);

  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);
  if (endAt <= startAt) throw new Error("End time must be after start time");

  const slug = await uniqueSlug(slugify(data.name));
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
      startAt,
      endAt,
      timezone: data.timezone,
      capacity,
      contactEmail: data.contactEmail || null,
      refundPolicy: data.refundPolicy || null,
      vendorRegistrationEnabled: data.vendorRegistrationEnabled === "1",
      vendorApplicationNotes: data.vendorApplicationNotes || null,
      defaultVendorPriceCents: Math.round(parseFloat(data.defaultVendorPrice || "0") * 100),
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
