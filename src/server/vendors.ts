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
 *
 * MUST be idempotent and race-safe:
 *  - The page auto-refreshes every few seconds while confirming, and the
 *    Stripe webhook also calls this on `checkout.session.completed`. Both
 *    can land within the same second.
 *  - The Registration table has a unique constraint on (eventId, email),
 *    so a concurrent INSERT will fail with P2002. We catch that and look
 *    up the existing row instead of erroring.
 */
export async function finalizeVendor(appId: string) {
  const app = await prisma.vendorApplication.findUnique({ where: { id: appId } });
  if (!app) return;
  if (app.status === "PAID") return; // fast path

  const tt = await getOrCreateVendorTicketType(app.eventId);
  const priceCents = app.quotedPriceCents ?? 0;

  // 1. Create or reuse the Registration row.
  let reg = await (async () => {
    try {
      return await prisma.registration.create({
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
    } catch (e: any) {
      // P2002 = unique constraint. Could be:
      //   - A parallel call to finalizeVendor already created it
      //   - The vendor's email was already used for a previous registration
      // Either way, find the existing row and use it.
      if (e?.code === "P2002") {
        const existing = await prisma.registration.findUnique({
          where: { eventId_email: { eventId: app.eventId, email: app.email } },
        });
        if (!existing) throw e; // shouldn't happen
        // If the row existed but wasn't confirmed yet (e.g. abandoned attempt),
        // promote it to CONFIRMED so the vendor pass issues.
        if (existing.status !== "CONFIRMED") {
          return prisma.registration.update({
            where: { id: existing.id },
            data: {
              status: "CONFIRMED",
              confirmedAt: new Date(),
              ticketTypeId: tt.id,
              subtotalCents: priceCents,
              totalCents: priceCents,
              firstName: app.contactFirstName,
              lastName: app.contactLastName,
              phone: app.phone,
              company: app.companyName,
            },
          });
        }
        return existing;
      }
      throw e;
    }
  })();

  // 2. Bump the vendor ticket type's sold count (only once, by atomically
  //    flipping the VendorApplication row).
  // 3. Mark the application PAID. updateMany + where status != PAID gives
  //    us atomic single-flip semantics: only ONE concurrent call wins.
  const updated = await prisma.vendorApplication.updateMany({
    where: { id: app.id, status: { not: "PAID" } },
    data: { status: "PAID", paidAt: new Date(), registrationId: reg.id, ticketTypeId: tt.id },
  });

  if (updated.count === 1) {
    // We were the winning concurrent call — do the side effects once.
    await prisma.ticketType.update({
      where: { id: tt.id },
      data: { quantitySold: { increment: 1 } },
    });
    try { await issueTickets(reg.id); } catch (e) { console.error("[vendor] issueTickets failed:", e); }
    try { await sendConfirmationEmail(reg.id); } catch (e) { console.error("[vendor] confirmation email failed:", e); }
  }
}
