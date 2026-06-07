import crypto from "crypto";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { signTicketToken } from "@/lib/auth";

/**
 * Idempotently issues one Ticket row per quantity unit on a CONFIRMED Registration.
 * Generates a signed JWT QR token and stores its SHA-256 hash for fast lookup.
 */
export async function issueTickets(registrationId: string) {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { tickets: true, ticketType: true },
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
    });
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

  // increment sold count
  await prisma.ticketType.update({
    where: { id: reg.ticketTypeId },
    data: { quantitySold: { increment: needed } },
  });

  return created;
}

export async function renderQrPngDataUrl(token: string) {
  return QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: 320 });
}
