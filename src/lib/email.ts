import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { renderQrPngDataUrl } from "@/server/tickets";
import { formatInTimeZone } from "date-fns-tz";

const FROM = process.env.EMAIL_FROM ?? "EventFlow <hello@eventflow.app>";

// Lazy init — avoids throwing during Next.js build/page-data collection when
// RESEND_API_KEY is not set. Throws clearly at first send if still missing.
let _resend: Resend | null = null;
function resend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set — cannot send email");
  _resend = new Resend(key);
  return _resend;
}

export async function sendConfirmationEmail(registrationId: string) {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: { include: { location: true } }, ticketType: true, tickets: true },
  });
  if (!reg) return;

  const qrAttachments = await Promise.all(
    reg.tickets.map(async (t, i) => ({
      filename: `ticket-${i + 1}.png`,
      content: (await renderQrPngDataUrl(t.qrToken)).split(",")[1],
    }))
  );

  const html = renderConfirmation(reg);
  const result = await resend().emails.send({
    from: FROM,
    to: reg.email,
    subject: `You're registered: ${reg.event.name}`,
    html,
    attachments: qrAttachments,
  });

  await prisma.emailLog.create({
    data: {
      registrationId: reg.id,
      toEmail: reg.email,
      kind: "CONFIRMATION",
      subject: `You're registered: ${reg.event.name}`,
      status: result.data?.id ? "SENT" : "FAILED",
      providerId: result.data?.id ?? null,
      sentAt: new Date(),
    },
  });
}

function renderConfirmation(reg: any) {
  const e = reg.event;
  const when = formatInTimeZone(e.startAt, e.timezone, "EEEE, MMMM d 'at' h:mm a zzz");
  const loc = e.location ? `${e.location.venueName ?? ""} ${e.location.addressLine1}, ${e.location.city}` : "";
  const totalFmt = (reg.totalCents / 100).toFixed(2);
  return `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      <h1 style="margin:0 0 8px;color:#1947c8">You're registered 🎉</h1>
      <p style="color:#475569">Hi ${reg.firstName}, thanks for signing up.</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid #e2e8f0;border-radius:8px">
        <tr><td style="padding:16px">
          <strong style="font-size:18px">${e.name}</strong><br>
          <span style="color:#475569">📅 ${when}</span><br>
          ${loc ? `<span style="color:#475569">📍 ${loc}</span>` : ""}
        </td></tr>
      </table>

      <h3 style="margin-top:24px">Order summary</h3>
      <table width="100%" cellpadding="6" cellspacing="0">
        <tr><td>${reg.ticketType.name} × ${reg.quantity}</td><td align="right">$${(reg.subtotalCents/100).toFixed(2)}</td></tr>
        ${reg.discountCents>0?`<tr><td>Discount</td><td align="right">-$${(reg.discountCents/100).toFixed(2)}</td></tr>`:""}
        ${reg.taxCents>0?`<tr><td>Tax</td><td align="right">$${(reg.taxCents/100).toFixed(2)}</td></tr>`:""}
        ${reg.feeCents>0?`<tr><td>Processing fee</td><td align="right">$${(reg.feeCents/100).toFixed(2)}</td></tr>`:""}
        <tr><td style="border-top:1px solid #e2e8f0;padding-top:8px"><strong>Total</strong></td>
            <td align="right" style="border-top:1px solid #e2e8f0;padding-top:8px"><strong>$${totalFmt}</strong></td></tr>
      </table>

      <p style="margin-top:24px">Your QR ticket${reg.tickets.length>1?"s are":" is"} attached. Show it at the door — it's scanned for entry.</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/api/registrations/${reg.id}/ics"
         style="display:inline-block;background:#205aea;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;margin-top:8px">
         Add to Calendar
      </a>

      ${e.refundPolicy ? `<p style="color:#64748b;font-size:12px;margin-top:24px"><strong>Refund policy:</strong> ${e.refundPolicy}</p>`:""}
    </td></tr>
  </table>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">EventFlow · ${e.organization?.name ?? ""}</p>
</body></html>`;
}

export async function sendReminderEmail(registrationId: string, kind: "REMINDER_30D"|"REMINDER_7D"|"REMINDER_1D"|"REMINDER_1H") {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId }, include: { event: true },
  });
  if (!reg) return;
  const labels = { REMINDER_30D: "30 days", REMINDER_7D: "1 week", REMINDER_1D: "tomorrow", REMINDER_1H: "1 hour" };
  const result = await resend().emails.send({
    from: FROM,
    to: reg.email,
    subject: `Reminder: ${reg.event.name} is in ${labels[kind]}`,
    html: `<p>Hi ${reg.firstName}, your event is coming up in ${labels[kind]}. See you there!</p>
           <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/events/${reg.event.slug}">View event</a></p>`,
  });
  await prisma.emailLog.create({
    data: { registrationId: reg.id, toEmail: reg.email, kind, subject: `Reminder: ${reg.event.name}`, status: "SENT", providerId: result.data?.id, sentAt: new Date() },
  });
}
