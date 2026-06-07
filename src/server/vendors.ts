import { prisma } from "@/lib/db";
import { issueTickets } from "@/server/tickets";
import { sendConfirmationEmail } from "@/lib/email";

/**
 * Returns the per-event "Vendor Booth" ticket type, creating it on first use.
 * It's hidden from the public list and uses the app's quoted price at registration time.
 */
export async function getOrCreateVendorTicketType(eventId: string) {
  const existing = await prisma.ticketType.findFirst({
    where: { eventId, isVendorTier: true, isHidden: true, name: "Vendor Booth" },
  });
  if (existing) return existing;

  const count = await prisma.ticketType.count({ where: { eventId } });
  return prisma.ticketType.create({
    data: {
      eventId,
      name: "Vendor Booth",
      kind: "CUSTOM",
      priceCents: 0,
      isVendorTier: true,
      isHidden: true,
      sortOrder: count,
    },
  });
}

/**
 * Finalize a vendor application after payment succeeds (or for free packages).
 * Uses VendorApplication.quotedPriceCents as the source of truth for the amount charged.
 */
export async function finalizeVendor(appId: string) {
  const app = await prisma.vendorApplication.findUnique({ where: { id: appId } });
  if (!app) return;
  if (app.status === "PAID") return;

  const tt = await getOrCreateVendorTicketType(app.eventId);
  const priceCents = app.quotedPriceCents ?? 0;

  const reg = await prisma.registration.create({
    data: {
      eventId: app.eventId,
      ticketTypeId: tt.id,
      firstName: app.contactFirstName,
      lastName: app.contactLastName,
      email: app.email,
      phone: app.phone,
      company: app.companyName,
      quantity: 1,
      subtotalCents: priceCents,
      totalCents: priceCents,
      currency: "USD",
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });

  await prisma.ticketType.update({
    where: { id: tt.id },
    data: { quantitySold: { increment: 1 } },
  });

  await prisma.vendorApplication.update({
    where: { id: app.id },
    data: { status: "PAID", paidAt: new Date(), registrationId: reg.id, ticketTypeId: tt.id },
  });

  try { await issueTickets(reg.id); } catch (e) { console.error("[vendor] issueTickets failed:", e); }
  try { await sendConfirmationEmail(reg.id); } catch (e) { console.error("[vendor] confirmation email failed:", e); }
}
