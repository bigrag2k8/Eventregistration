import crypto from "crypto";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { signTicketToken } from "@/lib/auth";

/**
 * Idempotently issues one Ticket row per quantity unit on a CONFIRMED Registration.
 * Generates a signed JWT QR token and stores its SHA-256 hash for fast lookup.
 *
 * Does NOT touch ticketType.quantitySold: seats are reserved atomically when the
 * registration is created (see reserveSeats in the registration/vendor flows),
 * so incrementing here would double-count.
 */
export async function issueTickets(registrationId: string) {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tickets: true, ticketType: true, event: { select: { endAt: true } } },
  });
  if (!reg) throw new Error("Registration not found");
  if (reg.status !== "CONFIRMED") throw new Error("Registration is not confirmed");
  if (reg.tickets.length >= reg.quantity) return reg.tickets;

  const needed = reg.quantity - reg.tickets.length;
  const created = [];
  for (let i = 0; i < needed; i++) {
    const ticketId = crypto.randomUUID();
    const token = await signTicketToken({
      ticketId,
      registrationId: reg.id,
      eventId: reg.eventId,
      ticketTypeId: reg.ticketTypeId,
    }, reg.event.endAt);
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const t = await prisma.ticket.create({
      data: {
        id: ticketId,
        registrationId: reg.id,
        attendeeName: `${reg.firstName} ${reg.lastName}`,
        attendeeEmail: reg.email,
        qrToken: token,
        qrCodeHash: hash,
      },
    });
    created.push(t);
  }

  return created;
}

/**
 * Re-sign a CONFIRMED registration's QR tokens with the CURRENT signing key and
 * refresh their stored hash, keeping each Ticket row (and any existing check-in)
 * intact. Use to recover tickets after a QR_SECRET rotation (which invalidates
 * tokens signed with the old key) or to hand an attendee a fresh copy. If the
 * registration somehow has no tickets yet, it issues them.
 */
export async function reissueTickets(registrationId: string) {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tickets: true, event: { select: { endAt: true } } },
  });
  if (!reg) throw new Error("Registration not found");
  if (reg.status !== "CONFIRMED") throw new Error("Only confirmed registrations have tickets");
  if (reg.tickets.length === 0) return issueTickets(registrationId);

  const updated = [];
  for (const t of reg.tickets) {
    const token = await signTicketToken(
      { ticketId: t.id, registrationId: reg.id, eventId: reg.eventId, ticketTypeId: reg.ticketTypeId },
      reg.event.endAt,
    );
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    updated.push(await prisma.ticket.update({
      where: { id: t.id },
      data: { qrToken: token, qrCodeHash: hash },
    }));
  }
  return updated;
}

/**
 * Release reserved seats back to a ticket type — call when a held registration
 * leaves the held state (abandoned, cancelled, deleted, or fully refunded).
 * Clamped at zero so an accounting slip can never push availability negative.
 * Accepts a Prisma client or an interactive-transaction client.
 */
export async function releaseSeats(
  client: { $executeRaw: typeof prisma.$executeRaw },
  ticketTypeId: string,
  quantity: number,
) {
  await client.$executeRaw`
    UPDATE ticket_types
    SET "quantitySold" = GREATEST("quantitySold" - ${quantity}, 0)
    WHERE id = ${ticketTypeId}
  `;
}

/**
 * Release a promo-code use claimed at registration creation. Call from the
 * same places as releaseSeats, when the registration carried a promoCodeId.
 * Clamped at zero like releaseSeats.
 */
export async function releasePromoUse(
  client: { $executeRaw: typeof prisma.$executeRaw },
  promoCodeId: string | null,
) {
  if (!promoCodeId) return;
  await client.$executeRaw`
    UPDATE promo_codes
    SET "usageCount" = GREATEST("usageCount" - 1, 0)
    WHERE id = ${promoCodeId}
  `;
}

export async function renderQrPngDataUrl(token: string) {
  return QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: 320 });
}
