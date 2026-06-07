import { prisma } from "@/lib/db";
import { issueTickets } from "@/server/tickets";
import { sendConfirmationEmail } from "@/lib/email";

/**
 * Finalize a vendor application after payment succeeds (or for free packages).
 * - Creates a Registration row tied to the vendor's chosen ticket type
 * - Increments quantitySold
 * - Issues QR ticket(s)
 * - Sends the standard confirmation email
 */
export async function finalizeVendor(appId: string) {
  const app = await prisma.vendorApplication.findUnique({
    where: { id: appId },
    include: { ticketType: true },
  });
  if (!app || !app.ticketType) return;
  if (app.status === "PAID") return;

  const reg = await prisma.registration.create({
    data: {
      eventId: app.eventId,
      ticketTypeId: app.ticketTypeId!,
      firstName: app.contactFirstName,
      lastName: app.contactLastName,
      email: app.email,
      phone: app.phone,
      company: app.companyName,
      quantity: 1,
      subtotalCents: app.ticketType.priceCents,
      totalCents: app.ticketType.priceCents,
      currency: app.ticketType.currency,
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });

  await prisma.ticketType.update({
    where: { id: app.ticketTypeId! },
    data: { quantitySold: { increment: 1 } },
  });

  await prisma.vendorApplication.update({
    where: { id: app.id },
    data: { status: "PAID", paidAt: new Date(), registrationId: reg.id },
  });

  try { await issueTickets(reg.id); } catch (e) { console.error("[vendor] issueTickets failed:", e); }
  try { await sendConfirmationEmail(reg.id); } catch (e) { console.error("[vendor] confirmation email failed:", e); }
}
