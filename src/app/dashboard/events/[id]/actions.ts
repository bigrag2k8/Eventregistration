"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

async function authorizeEvent(eventId: string) {
  const session = requireRole(["ORGANIZER", "ADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: session.orgId, deletedAt: null },
  });
  if (!event) throw new Error("Forbidden");
  return { session, event };
}

export async function publishAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { event } = await authorizeEvent(eventId);
  const hasTicketTypes = await prisma.ticketType.count({ where: { eventId: event.id } });
  if (!hasTicketTypes) throw new Error("Add at least one ticket type before publishing");
  await prisma.event.update({
    where: { id: event.id },
    data: { status: "PUBLISHED", publishedAt: event.publishedAt ?? new Date() },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
  revalidatePath("/");
}

export async function unpublishAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { event } = await authorizeEvent(eventId);
  await prisma.event.update({ where: { id: event.id }, data: { status: "DRAFT" } });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath("/");
}

export async function deleteAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { event } = await authorizeEvent(eventId);
  await prisma.event.update({ where: { id: event.id }, data: { deletedAt: new Date(), status: "CANCELLED" } });
  redirect("/dashboard");
}

const basicsSchema = z.object({
  name: z.string().min(2).max(200),
  shortDescription: z.string().max(160).optional(),
  description: z.string().min(10),
  startAt: z.string(),
  endAt: z.string(),
  capacity: z.string().optional(),
  contactEmail: z.string().optional(),
  refundPolicy: z.string().optional(),
});

export async function updateBasicsAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { event } = await authorizeEvent(eventId);
  const data = basicsSchema.parse(Object.fromEntries(formData.entries()));
  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);
  if (endAt <= startAt) throw new Error("End must be after start");

  await prisma.event.update({
    where: { id: event.id },
    data: {
      name: data.name,
      shortDescription: data.shortDescription || null,
      description: data.description,
      startAt,
      endAt,
      capacity: data.capacity ? parseInt(data.capacity) : null,
      contactEmail: data.contactEmail || null,
      refundPolicy: data.refundPolicy || null,
    },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
}

const ttSchema = z.object({
  name: z.string().min(1).max(120),
  price: z.string().default("0"),
  quantity: z.string().optional(),
});

export async function addTicketTypeAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { event } = await authorizeEvent(eventId);
  const data = ttSchema.parse(Object.fromEntries(formData.entries()));
  const priceCents = Math.round(parseFloat(data.price || "0") * 100);
  const qty = data.quantity ? parseInt(data.quantity) : null;
  const existing = await prisma.ticketType.count({ where: { eventId: event.id } });
  await prisma.ticketType.create({
    data: {
      eventId: event.id,
      name: data.name,
      kind: priceCents === 0 ? "FREE" : "GENERAL",
      priceCents,
      quantityTotal: qty,
      sortOrder: existing,
    },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
}

export async function deleteTicketTypeAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const ticketTypeId = String(formData.get("ticketTypeId"));
  const { event } = await authorizeEvent(eventId);
  const tt = await prisma.ticketType.findFirst({ where: { id: ticketTypeId, eventId: event.id } });
  if (!tt) throw new Error("Not found");
  if (tt.quantitySold > 0) throw new Error("Ticket type has registrations — cannot delete");
  await prisma.ticketType.delete({ where: { id: tt.id } });
  revalidatePath(`/dashboard/events/${event.id}`);
}
