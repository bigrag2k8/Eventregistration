"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";

async function authorizeEvent(eventId: string) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizationId: session.orgId, deletedAt: null },
  });
  if (!event) throw new Error("Forbidden");
  return { session, event };
}

export async function publishAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { session, event } = await authorizeEvent(eventId);
  const hasTicketTypes = await prisma.ticketType.count({ where: { eventId: event.id } });
  if (!hasTicketTypes) throw new Error("Add at least one ticket type before publishing");
  await prisma.event.update({
    where: { id: event.id },
    data: { status: "PUBLISHED", publishedAt: event.publishedAt ?? new Date() },
  });
  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "event.publish", targetType: "Event", targetId: event.id,
    metadata: { name: event.name, slug: event.slug },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
  revalidatePath("/");
}

export async function unpublishAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { session, event } = await authorizeEvent(eventId);
  await prisma.event.update({ where: { id: event.id }, data: { status: "DRAFT" } });
  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "event.unpublish", targetType: "Event", targetId: event.id,
    metadata: { name: event.name },
  });
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath("/");
}

export async function deleteAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const { session, event } = await authorizeEvent(eventId);
  await prisma.event.update({ where: { id: event.id }, data: { deletedAt: new Date(), status: "CANCELLED" } });
  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "event.delete", targetType: "Event", targetId: event.id,
    metadata: { name: event.name, slug: event.slug },
  });
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
  vendorRegistrationEnabled: z.string().optional(),
  vendorApplicationNotes: z.string().optional(),
  defaultVendorPrice: z.string().optional(),
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
      vendorRegistrationEnabled: data.vendorRegistrationEnabled === "1",
      vendorApplicationNotes: data.vendorApplicationNotes || null,
      defaultVendorPriceCents: data.defaultVendorPrice !== undefined
        ? Math.round(parseFloat(data.defaultVendorPrice || "0") * 100)
        : event.defaultVendorPriceCents,
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

/**
 * Soft-cancel a registration: status -> CANCELLED, invalidate tickets,
 * decrement ticketType.quantitySold so the seat opens back up.
 * Keeps the row for audit trail. Use deleteRegistrationAction for hard removal.
 */
export async function cancelRegistrationAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const registrationId = String(formData.get("registrationId"));
  const { session, event } = await authorizeEvent(eventId);

  const reg = await prisma.registration.findFirst({
    where: { id: registrationId, eventId: event.id },
  });
  if (!reg) throw new Error("Registration not found");
  if (reg.status === "CANCELLED") return;

  await prisma.$transaction([
    prisma.registration.update({
      where: { id: reg.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "organizer_cancel" },
    }),
    prisma.ticket.updateMany({
      where: { registrationId: reg.id },
      data: { isValid: false, invalidatedAt: new Date(), invalidReason: "registration_cancelled" },
    }),
    prisma.ticketType.update({
      where: { id: reg.ticketTypeId },
      data: { quantitySold: { decrement: reg.quantity } },
    }),
  ]);

  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "registration.cancel", targetType: "Registration", targetId: reg.id,
    metadata: { attendee: `${reg.firstName} ${reg.lastName}`, email: reg.email, quantity: reg.quantity },
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
}

/**
 * Hard-delete a registration (and its tickets + check-ins via cascade).
 * Use for test data cleanup. Decrements quantitySold so the seat reopens.
 */
export async function deleteRegistrationAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const registrationId = String(formData.get("registrationId"));
  const { session, event } = await authorizeEvent(eventId);

  const reg = await prisma.registration.findFirst({
    where: { id: registrationId, eventId: event.id },
  });
  if (!reg) throw new Error("Registration not found");

  // Only decrement if it was counting against the sold count
  const wasActive = reg.status !== "CANCELLED";

  await prisma.$transaction([
    prisma.registration.delete({ where: { id: reg.id } }),
    ...(wasActive
      ? [prisma.ticketType.update({
          where: { id: reg.ticketTypeId },
          data: { quantitySold: { decrement: reg.quantity } },
        })]
      : []),
  ]);

  await audit({
    organizationId: event.organizationId, eventId: event.id, userId: session.sub,
    action: "registration.delete", targetType: "Registration", targetId: reg.id,
    metadata: { attendee: `${reg.firstName} ${reg.lastName}`, email: reg.email, quantity: reg.quantity },
  });

  revalidatePath(`/dashboard/events/${event.id}/registrations`);
  revalidatePath(`/dashboard/events/${event.id}`);
  revalidatePath(`/events/${event.slug}`);
}
