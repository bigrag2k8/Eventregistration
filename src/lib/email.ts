import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { renderQrPngDataUrl, issueTickets } from "@/server/tickets";
import { signReviewToken } from "@/lib/auth";
import { formatInTimeZone } from "date-fns-tz";

const DEFAULT_FROM = process.env.EMAIL_FROM ?? "Your Events App <events@yourevents.app>";

/**
 * Escape user-supplied values before interpolating into email HTML. Attendee
 * names, event fields, vendor input, etc. come from public forms — unescaped
 * they let anyone inject markup into mail sent from the organizer's domain.
 */
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build the "From" header for transactional emails. ALL mail now sends from the
 * single platform sender (EMAIL_FROM, i.e. events@yourevents.app) — per-org
 * custom senders were removed because each would need its own domain verified in
 * Resend, and an unverified org address silently fails to deliver. The org
 * argument is accepted but ignored so callers don't have to change.
 */
function buildFrom(_org?: { name?: string | null; fromEmail?: string | null; fromName?: string | null } | null) {
  return DEFAULT_FROM;
}

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
    include: {
      event: { include: { location: true, organization: true } },
      ticketType: true,
      tickets: true,
    },
  });
  if (!reg) return;

  // content_id lets the HTML body reference each PNG via <img src="cid:..."/>.
  // That makes the QR part of the body itself, so it survives "Print email" in
  // Gmail/Outlook/Apple Mail. Previously the body only said "ticket attached"
  // and the QR was a separate file — printing the body lost the actual ticket.
  const qrAttachments = await Promise.all(
    reg.tickets.map(async (t, i) => ({
      filename: `ticket-${i + 1}.png`,
      content: (await renderQrPngDataUrl(t.qrToken)).split(",")[1],
      content_id: `ticket-${i + 1}`,
    }))
  );

  const html = renderConfirmation(reg);
  const result = await resend().emails.send({
    from: buildFrom(reg.event.organization),
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

/**
 * Notify an attendee that their event was cancelled. `refunded` controls the
 * money line — true when a full refund was issued (paid ticket), false for a
 * free registration. Sent by the worker's refundCancelledEvents job.
 */
export async function sendEventCancelledEmail(registrationId: string, refunded: boolean) {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: { include: { organization: true } } },
  });
  if (!reg) return;

  const e: any = reg.event;
  const org: any = e.organization ?? {};
  const brand = (typeof org.brandColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(org.brandColor)) ? org.brandColor : "#1F3A8A";
  const orgName = esc(org.name ?? "");
  const logo = org.logoUrl
    ? `<img src="${esc(org.logoUrl)}" alt="${orgName}" style="max-height:48px;max-width:200px;object-fit:contain;margin-bottom:12px"/>`
    : "";
  const reasonBlock = e.cancelReason
    ? `<p style="color:#475569;background:#f8fafc;border-left:3px solid ${brand};padding:8px 12px;border-radius:4px"><strong>Note from the organizer:</strong> ${esc(e.cancelReason)}</p>`
    : "";
  const refundLine = refunded
    ? `<p style="color:#0f766e"><strong>You've been refunded in full.</strong> The entire amount you paid — ticket price and any fees — is on its way back to your original payment method, and typically appears within 5–10 business days.</p>`
    : `<p style="color:#475569">No payment was collected for your registration, so there's nothing to refund.</p>`;

  const subject = `Cancelled: ${e.name}`;
  const html = `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      ${logo}
      <h1 style="margin:0 0 8px;color:${brand}">Event cancelled</h1>
      <p style="color:#475569">Hi ${esc(reg.firstName)}, we're sorry to let you know that <strong>${esc(e.name)}</strong>${orgName ? `, hosted by ${orgName},` : ""} has been cancelled.</p>
      ${reasonBlock}
      ${refundLine}
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Questions? Just reply to this email to reach the organizer.</p>
    </td></tr>
  </table>
</body></html>`;

  const result = await resend().emails.send({
    from: buildFrom(org),
    to: reg.email,
    subject,
    html,
  });

  await prisma.emailLog.create({
    data: {
      registrationId: reg.id,
      toEmail: reg.email,
      kind: "CANCELLATION",
      subject,
      status: result.data?.id ? "SENT" : "FAILED",
      providerId: result.data?.id ?? null,
      sentAt: new Date(),
    },
  });
}

/**
 * Notify an attendee that the event date changed. Their ticket stays valid — the
 * freshly reissued QR is attached (the worker calls reissueTickets first) — and we
 * offer a refund for anyone who can't make the new date. Sent by the worker's
 * processRescheduledEvents job; logged as CONFIRMATION (a re-confirm w/ new date).
 */
export async function sendEventRescheduledEmail(registrationId: string) {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: { include: { location: true, organization: true } }, tickets: true },
  });
  if (!reg) return;

  const e: any = reg.event;
  const org: any = e.organization ?? {};
  const brand = (typeof org.brandColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(org.brandColor)) ? org.brandColor : "#1F3A8A";
  const orgName = esc(org.name ?? "");
  const logo = org.logoUrl
    ? `<img src="${esc(org.logoUrl)}" alt="${orgName}" style="max-height:48px;max-width:200px;object-fit:contain;margin-bottom:12px"/>`
    : "";
  const when = formatInTimeZone(e.startAt, e.timezone, "EEEE, MMMM d 'at' h:mm a zzz");
  const loc = e.location ? esc(`${e.location.venueName ?? ""} ${e.location.addressLine1 ?? ""}, ${e.location.city ?? ""}`) : "";
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  // The refund-request page 404s without ?reg + &key (the accessToken) — match
  // how the confirmation email builds this link.
  const refundUrl = `${base}/o/${esc(org.slug)}/events/${esc(e.slug)}/refund-request?reg=${reg.id}${reg.accessToken ? `&key=${esc(reg.accessToken)}` : ""}`;

  // Guarantee a scannable ticket exists before we build the email. issueTickets
  // is idempotent (creates only what's missing), so this self-heals any
  // CONFIRMED reg that reached here without a ticket — e.g. a bundle
  // finalization where issueTickets had failed. Then read the current set.
  let tickets: any[] = reg.tickets;
  if (reg.status === "CONFIRMED" && tickets.length < reg.quantity) {
    try {
      await issueTickets(reg.id);
      tickets = await prisma.ticket.findMany({ where: { registrationId: reg.id } });
    } catch (err) {
      console.error(`[reschedule] issueTickets failed for ${reg.id}`, err);
    }
  }

  const qrAttachments = await Promise.all(
    tickets.map(async (t: any, i: number) => ({
      filename: `ticket-${i + 1}.png`,
      content: (await renderQrPngDataUrl(t.qrToken)).split(",")[1],
      content_id: `ticket-${i + 1}`,
    })),
  );
  // Show the QR INLINE in the body (cid: ref) — not just as a loose file
  // attachment — so it's visible at a glance and survives "Print email",
  // matching the confirmation email.
  const qrBlock = tickets.length
    ? `<div style="margin-top:16px">
         <p style="color:#475569;margin:0 0 10px">Your updated ticket${tickets.length > 1 ? "s" : ""} — scan the QR at the door:</p>
         ${tickets.map((_t: any, i: number) => `<img src="cid:ticket-${i + 1}" alt="Ticket ${i + 1} QR code" width="220" height="220" style="display:block;border:0;width:220px;height:220px;margin-bottom:12px"/>`).join("")}
       </div>`
    : "";

  const subject = `New date: ${e.name}`;
  const html = `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      ${logo}
      <h1 style="margin:0 0 8px;color:${brand}">The date has changed 📅</h1>
      <p style="color:#475569">Hi ${esc(reg.firstName)}, <strong>${esc(e.name)}</strong> has been rescheduled. Your registration is still valid — nothing to do.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border:1px solid #e2e8f0;border-radius:8px">
        <tr><td style="padding:16px">
          <div style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.05em">New date</div>
          <strong style="font-size:18px;color:${brand}">📅 ${when}</strong><br>
          ${loc ? `<span style="color:#475569">📍 ${loc}</span>` : ""}
        </td></tr>
      </table>
      ${qrBlock}
      <p style="color:#475569;margin-top:16px">Can&rsquo;t make the new date? <a href="${refundUrl}" style="color:${brand};font-weight:600">Request a full refund</a>.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Questions? Just reply to this email to reach the organizer.</p>
    </td></tr>
  </table>
</body></html>`;

  const result = await resend().emails.send({
    from: buildFrom(org),
    to: reg.email,
    subject,
    html,
    attachments: qrAttachments,
  });

  await prisma.emailLog.create({
    data: {
      registrationId: reg.id,
      toEmail: reg.email,
      kind: "CONFIRMATION",
      subject,
      status: result.data?.id ? "SENT" : "FAILED",
      providerId: result.data?.id ?? null,
      sentAt: new Date(),
    },
  });
}

function renderConfirmation(reg: any) {
  const e = reg.event;
  const org = e.organization ?? {};
  const brand = (typeof org.brandColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(org.brandColor))
    ? org.brandColor
    : "#1F3A8A";
  const when = formatInTimeZone(e.startAt, e.timezone, "EEEE, MMMM d 'at' h:mm a zzz");
  const loc = e.location ? esc(`${e.location.venueName ?? ""} ${e.location.addressLine1}, ${e.location.city}`) : "";
  const totalFmt = (reg.totalCents / 100).toFixed(2);
  const orgName = esc(org.name ?? "");
  const logo = org.logoUrl
    ? `<img src="${esc(org.logoUrl)}" alt="${orgName}" style="max-height:48px;max-width:200px;object-fit:contain;margin-bottom:12px"/>`
    : "";

  return `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      ${logo}
      <h1 style="margin:0 0 8px;color:${brand}">You're registered 🎉</h1>
      <p style="color:#475569">Hi ${esc(reg.firstName)}, thanks for signing up.</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid #e2e8f0;border-radius:8px">
        <tr><td style="padding:16px">
          <strong style="font-size:18px">${esc(e.name)}</strong><br>
          <span style="color:#475569">📅 ${when}</span><br>
          ${loc ? `<span style="color:#475569">📍 ${loc}</span>` : ""}
        </td></tr>
      </table>

      <h3 style="margin-top:24px">Order summary</h3>
      <table width="100%" cellpadding="6" cellspacing="0">
        <tr><td>${esc(reg.ticketType.name)} × ${reg.quantity}</td><td align="right">$${(reg.subtotalCents/100).toFixed(2)}</td></tr>
        ${reg.discountCents>0?`<tr><td>Discount</td><td align="right">-$${(reg.discountCents/100).toFixed(2)}</td></tr>`:""}
        ${reg.taxCents>0?`<tr><td>Tax</td><td align="right">$${(reg.taxCents/100).toFixed(2)}</td></tr>`:""}
        ${reg.feeCents>0?`<tr><td>Payment processing fee <span style="color:#94a3b8;font-size:11px">(Stripe)</span></td><td align="right">$${(reg.feeCents/100).toFixed(2)}</td></tr>`:""}
        <tr><td style="border-top:1px solid #e2e8f0;padding-top:8px"><strong>Total</strong></td>
            <td align="right" style="border-top:1px solid #e2e8f0;padding-top:8px"><strong>$${totalFmt}</strong></td></tr>
      </table>

      <h3 style="margin-top:24px;margin-bottom:8px">Your ticket${reg.tickets.length>1?"s":""}</h3>
      <p style="color:#475569;margin:0 0 12px">Show ${reg.tickets.length>1?"each QR code":"this QR code"} at the door — it&rsquo;s scanned for entry. The image${reg.tickets.length>1?"s are":" is"} also attached for offline use.</p>
      <div style="text-align:center;margin:8px 0 16px">
        ${reg.tickets.map((_t: unknown, i: number) => `
          <div style="display:inline-block;margin:6px;border:1px solid #e2e8f0;border-radius:8px;padding:12px;vertical-align:top">
            <img src="cid:ticket-${i + 1}" alt="Ticket ${i + 1} QR code" width="220" height="220" style="display:block;border:0;width:220px;height:220px"/>
            ${reg.tickets.length>1?`<div style="margin-top:6px;color:#475569;font-size:12px">Ticket ${i + 1} of ${reg.tickets.length}</div>`:""}
          </div>
        `).join("")}
      </div>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/api/registrations/${reg.id}/ics${reg.accessToken ? `?key=${reg.accessToken}` : ""}"
         style="display:inline-block;background:${brand};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;margin-top:8px">
         Add to Calendar
      </a>

      <p style="color:#475569;font-size:14px;margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/account/signin" style="color:${brand};font-weight:bold;text-decoration:none">Sign in to your account</a>
        to see all your events, tickets, and waitlists in one place — no password needed.
      </p>
      ${reg.totalCents > 0 ? `<p style="color:#64748b;font-size:12px;margin-top:16px"><a href="${process.env.NEXT_PUBLIC_APP_URL}/o/${org.slug}/events/${e.slug}/refund-request?reg=${reg.id}${reg.accessToken ? `&key=${reg.accessToken}` : ""}" style="color:#64748b">Need a refund? Request one here.</a></p>` : ""}
      ${e.refundPolicy ? `<p style="color:#64748b;font-size:12px;margin-top:8px"><strong>Refund policy:</strong> ${esc(e.refundPolicy)}</p>`:""}
    </td></tr>
  </table>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">${orgName} · Powered by Your Events App</p>
</body></html>`;
}

/**
 * One confirmation for a all-sessions bundle purchase: lists every session with
 * its own QR ticket inline (cid-referenced, same print-safe pattern as the
 * single confirmation email). Sent once by the webhook after payment.
 */
export async function sendBundleConfirmationEmail(bundlePurchaseId: string) {
  const purchase = await prisma.seriesBundlePurchase.findUnique({
    where: { id: bundlePurchaseId },
    include: {
      series: { include: { organization: true } },
      registrations: {
        where: { status: "CONFIRMED" },
        orderBy: { createdAt: "asc" },
        include: { event: { include: { location: true } }, tickets: true },
      },
    },
  });
  if (!purchase || purchase.registrations.length === 0) return;

  const org: any = purchase.series.organization ?? {};
  const brand = (typeof org.brandColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(org.brandColor)) ? org.brandColor : "#1F3A8A";
  const orgName = esc(org.name ?? "");
  const logo = org.logoUrl
    ? `<img src="${esc(org.logoUrl)}" alt="${orgName}" style="max-height:48px;max-width:200px;object-fit:contain;margin-bottom:12px"/>`
    : "";

  // One QR per session, ordered by date; cid ids keyed by index.
  const regsByDate = [...purchase.registrations].sort(
    (a, b) => a.event.startAt.getTime() - b.event.startAt.getTime(),
  );
  // Self-heal: guarantee each confirmed session has its ticket before building
  // the QR blocks, so a finalization where issueTickets had failed can't send a
  // QR-less pass. issueTickets is idempotent.
  for (const reg of regsByDate) {
    if (reg.tickets.length === 0) {
      try {
        await issueTickets(reg.id);
        (reg as any).tickets = await prisma.ticket.findMany({ where: { registrationId: reg.id } });
      } catch (err) {
        console.error(`[bundle] issueTickets (email self-heal) failed for ${reg.id}`, err);
      }
    }
  }
  const attachments: Array<{ filename: string; content: string; content_id: string }> = [];
  const sessionBlocks: string[] = [];
  for (let i = 0; i < regsByDate.length; i++) {
    const reg = regsByDate[i];
    const t = reg.tickets[0];
    const when = formatInTimeZone(reg.event.startAt, reg.event.timezone, "EEEE, MMMM d 'at' h:mm a zzz");
    let qrImg = "";
    if (t) {
      attachments.push({
        filename: `session-${i + 1}.png`,
        content: (await renderQrPngDataUrl(t.qrToken)).split(",")[1],
        content_id: `session-${i + 1}`,
      });
      qrImg = `<img src="cid:session-${i + 1}" alt="Session ${i + 1} QR" width="140" height="140" style="display:block;border:0;width:140px;height:140px"/>`;
    }
    sessionBlocks.push(`
      <tr><td style="padding:12px;border-top:1px solid #e2e8f0">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="top">
            <strong>Session ${i + 1} of ${regsByDate.length}</strong><br>
            <span style="color:#475569">📅 ${when}</span>
          </td>
          <td align="right" width="150">${qrImg}</td>
        </tr></table>
      </td></tr>`);
  }

  const subject = `You're in: ${purchase.series.name} — all ${regsByDate.length} sessions`;
  const html = `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      ${logo}
      <h1 style="margin:0 0 8px;color:${brand}">You're in — the whole series 🎉</h1>
      <p style="color:#475569">Hi ${esc(purchase.firstName)}, your all-sessions pass for <strong>${esc(purchase.series.name)}</strong>${orgName ? ` with ${orgName}` : ""} is confirmed. Total paid: <strong>$${(purchase.totalCents / 100).toFixed(2)}</strong> for ${regsByDate.length} sessions.</p>
      <p style="color:#475569">Each session has its own QR ticket below — show the matching QR at the door.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${sessionBlocks.join("")}</table>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Can't make a session? Reply to this email to reach the organizer.</p>
    </td></tr>
  </table>
</body></html>`;

  const result = await resend().emails.send({
    from: buildFrom(org),
    to: purchase.email,
    subject,
    html,
    attachments,
  });

  await prisma.emailLog.create({
    data: {
      registrationId: regsByDate[0].id,
      toEmail: purchase.email,
      kind: "CONFIRMATION",
      subject,
      status: result.data?.id ? "SENT" : "FAILED",
      providerId: result.data?.id ?? null,
      errorMessage: result.error?.message ?? null,
      sentAt: new Date(),
    },
  });
}

/**
 * Passwordless sign-in link. Uses the platform default sender (no org context —
 * attendee accounts are global). The URL contains the single-use raw token.
 */
export async function sendMagicLinkEmail(email: string, url: string) {
  await resend().emails.send({
    from: DEFAULT_FROM,
    to: email,
    subject: "Your sign-in link for Your Events App",
    html: `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      <h1 style="margin:0 0 8px;color:#1F3A8A">Sign in</h1>
      <p style="color:#475569">Click the button below to sign in to your account. This link expires in 15 minutes and can only be used once.</p>
      <p style="margin:24px 0">
        <a href="${esc(url)}" style="display:inline-block;background:#1F3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Sign in</a>
      </p>
      <p style="color:#64748b;font-size:12px">If the button doesn't work, paste this link into your browser:<br>${esc(url)}</p>
      <p style="color:#64748b;font-size:12px;margin-top:16px">If you didn't request this, you can safely ignore this email.</p>
    </td></tr>
  </table>
</body></html>`,
  });
}

/**
 * Password-reset link for organizers/staff. Platform sender (not org-branded);
 * the URL carries the single-use raw token.
 */
export async function sendPasswordResetEmail(email: string, url: string) {
  await resend().emails.send({
    from: DEFAULT_FROM,
    to: email,
    subject: "Reset your Your Events App password",
    html: `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      <h1 style="margin:0 0 8px;color:#1F3A8A">Reset your password</h1>
      <p style="color:#475569">We received a request to reset your password. Click the button below to choose a new one. This link expires in 15 minutes and can only be used once.</p>
      <p style="margin:24px 0">
        <a href="${esc(url)}" style="display:inline-block;background:#1F3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Reset password</a>
      </p>
      <p style="color:#64748b;font-size:12px">If the button doesn't work, paste this link into your browser:<br>${esc(url)}</p>
      <p style="color:#64748b;font-size:12px;margin-top:16px">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </td></tr>
  </table>
</body></html>`,
  });
}

export async function sendWaitlistPromotionEmail(waitlistId: string) {
  const entry = await prisma.waitlist.findUnique({
    where: { id: waitlistId },
    include: { event: { include: { organization: true } } },
  });
  if (!entry) return;

  const e = entry.event;
  const org = e.organization ?? {};
  const brand = (typeof org.brandColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(org.brandColor))
    ? org.brandColor
    : "#1F3A8A";
  const orgSlug = org.slug ?? "_";
  const tokenParam = entry.magicToken ? `?waitlist=${entry.magicToken}` : "";
  const registerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/o/${orgSlug}/events/${e.slug}/register${tokenParam}`;
  const leaveUrl = entry.leaveToken
    ? `${process.env.NEXT_PUBLIC_APP_URL}/waitlist/leave/${entry.leaveToken}`
    : null;
  const expiresIn = entry.expiresAt
    ? Math.max(1, Math.round((entry.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)))
    : 24;

  try {
    const result = await resend().emails.send({
      from: buildFrom(org),
      to: entry.email,
      subject: `A spot opened up — ${e.name}`,
      html: `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      <h1 style="margin:0 0 8px;color:${brand}">Good news, ${esc(entry.firstName)}!</h1>
      <p style="color:#475569">A spot has opened up for <strong>${esc(e.name)}</strong>. You have approximately <strong>${expiresIn} hours</strong> to register. This seat is reserved for you — clicking the link below bypasses the sold-out screen.</p>
      <p style="margin:24px 0">
        <a href="${registerUrl}" style="display:inline-block;background:${brand};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Claim your spot</a>
      </p>
      ${leaveUrl ? `<p style="color:#64748b;font-size:12px">Changed your mind? <a href="${leaveUrl}" style="color:#64748b">Leave the waitlist</a> so the spot is offered to the next person right away.</p>` : ""}
    </td></tr>
  </table>
</body></html>`,
    });

    await prisma.emailLog.create({
      data: {
        toEmail: entry.email,
        kind: "WAITLIST_PROMOTED",
        subject: `A spot opened up — ${e.name}`,
        status: result.data?.id ? "SENT" : "FAILED",
        providerId: result.data?.id ?? null,
        sentAt: new Date(),
      },
    });
  } catch (err: any) {
    console.error("[waitlist] promotion email failed:", err?.message);
  }
}

/**
 * Notify the organizer that an attendee submitted a refund request. Goes to the
 * event's contact email (falling back to the org's), from the platform sender
 * since it's an internal alert, not a branded customer email.
 */
export async function sendRefundRequestReceivedEmail(refundRequestId: string) {
  const rr = await prisma.refundRequest.findUnique({
    where: { id: refundRequestId },
    include: {
      registration: { select: { firstName: true, lastName: true, email: true, totalCents: true, currency: true } },
      event: { select: { id: true, name: true, contactEmail: true, organization: { select: { contactEmail: true } } } },
    },
  });
  if (!rr) return;

  const to = rr.event.contactEmail ?? rr.event.organization?.contactEmail;
  if (!to) {
    console.warn("[refund-request] no organizer contact email configured for event", rr.event.id);
    return;
  }

  const reg = rr.registration;
  const amount = `$${(reg.totalCents / 100).toFixed(2)}`;
  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/events/${rr.event.id}/refund-requests`;
  const subject = `New refund request — ${rr.event.name}`;

  try {
    const result = await resend().emails.send({
      from: DEFAULT_FROM,
      to,
      subject,
      html: `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      <h1 style="margin:0 0 8px;color:#1F3A8A">New refund request</h1>
      <p style="color:#475569"><strong>${esc(reg.firstName)} ${esc(reg.lastName)}</strong> (${esc(reg.email)}) requested a refund for <strong>${esc(rr.event.name)}</strong>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid #e2e8f0;border-radius:8px">
        <tr><td style="padding:16px">
          <div style="color:#475569">Amount paid: <strong>${amount}</strong></div>
          <div style="color:#475569;margin-top:8px">Reason:</div>
          <div style="margin-top:4px">${esc(rr.reason).replace(/\n/g, "<br>")}</div>
        </td></tr>
      </table>
      <p style="margin:24px 0">
        <a href="${reviewUrl}" style="display:inline-block;background:#1F3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Review request</a>
      </p>
    </td></tr>
  </table>
</body></html>`,
    });

    await prisma.emailLog.create({
      data: {
        registrationId: rr.registrationId,
        toEmail: to,
        kind: "REFUND_REQUEST_RECEIVED",
        subject,
        status: result.data?.id ? "SENT" : "FAILED",
        providerId: result.data?.id ?? null,
        errorMessage: result.error?.message ?? null,
        sentAt: new Date(),
      },
    });
  } catch (e: any) {
    console.error("[refund-request] organizer notify failed:", e?.message);
  }
}

/**
 * Notify every ORGANIZER/ADMIN team member of the org that owns the event that
 * a vendor just submitted an application. Sent from the platform sender since
 * it's an internal alert. Each send is logged independently to EmailLog so
 * delivery is traceable per recipient.
 *
 * Recipient set:
 *   1. Every active (non-deleted) User with role ORGANIZER or ADMIN in the org
 *   2. PLUS the event's contactEmail and the org's contactEmail as fallbacks
 *
 * Addresses are case-insensitively de-duped — if the event's contactEmail is
 * also a team member's email, they get one copy, not two.
 */
export async function sendVendorApplicationReceivedEmail(applicationId: string) {
  const app = await prisma.vendorApplication.findUnique({
    where: { id: applicationId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          contactEmail: true,
          organizationId: true,
          organization: { select: { contactEmail: true, name: true } },
        },
      },
    },
  });
  if (!app) return;

  // Pull every ORGANIZER/ADMIN in the org. We DON'T include STAFF/VOLUNTEER —
  // those roles handle check-in, not vendor approvals.
  const teamMembers = await prisma.user.findMany({
    where: {
      organizationId: app.event.organizationId,
      role: { in: ["ORGANIZER", "ADMIN"] },
      deletedAt: null,
    },
    select: { email: true },
  });

  const seen = new Set<string>();
  const recipients: string[] = [];
  const add = (addr: string | null | undefined) => {
    if (!addr) return;
    const lower = addr.trim().toLowerCase();
    if (!lower || seen.has(lower)) return;
    seen.add(lower);
    recipients.push(addr.trim());
  };

  for (const u of teamMembers) add(u.email);
  add(app.event.contactEmail);
  add(app.event.organization?.contactEmail);

  if (recipients.length === 0) {
    console.warn(
      "[vendor-application] no team members or contact email configured for event",
      app.event.id
    );
    return;
  }

  const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/events/${app.event.id}/vendors`;
  const subject = `New vendor application — ${app.event.name}`;
  const contactName = [app.contactFirstName, app.contactLastName].filter(Boolean).join(" ");

  const html = `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      <h1 style="margin:0 0 8px;color:#1F3A8A">A vendor is waiting for your approval</h1>
      <p style="color:#475569"><strong>${esc(app.companyName)}</strong> just submitted a vendor application for <strong>${esc(app.event.name)}</strong>. Review the details and approve or decline when you have a moment.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid #e2e8f0;border-radius:8px">
        <tr><td style="padding:16px">
          <div style="color:#475569">Company: <strong>${esc(app.companyName)}</strong></div>
          ${contactName ? `<div style="color:#475569;margin-top:8px">Contact: <strong>${esc(contactName)}</strong></div>` : ""}
          <div style="color:#475569;margin-top:8px">Email: <a href="mailto:${esc(app.email)}" style="color:#1F3A8A">${esc(app.email)}</a></div>
          ${app.phone ? `<div style="color:#475569;margin-top:8px">Phone: ${esc(app.phone)}</div>` : ""}
          ${app.productCategory ? `<div style="color:#475569;margin-top:8px">Category: ${esc(app.productCategory)}</div>` : ""}
          ${app.boothPreference ? `<div style="color:#475569;margin-top:8px">Booth preference: ${esc(app.boothPreference)}</div>` : ""}
          ${app.description ? `<div style="color:#475569;margin-top:12px">Description:</div><div style="margin-top:4px">${esc(app.description).replace(/\n/g, "<br>")}</div>` : ""}
        </td></tr>
      </table>
      <p style="margin:24px 0">
        <a href="${reviewUrl}" style="display:inline-block;background:#1F3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Review vendor application</a>
      </p>
      <p style="color:#64748b;font-size:12px;margin-top:16px">You're receiving this because you're listed as an organizer or admin for this event. To stop these emails, turn off &ldquo;Accept vendor applications&rdquo; on the event settings page, or have a fellow organizer remove you from the team.</p>
    </td></tr>
  </table>
</body></html>`;

  // One Resend send per recipient so we get a per-recipient message id and
  // per-recipient EmailLog row. Sends run in parallel but failures are
  // contained — one bounce doesn't take down the rest of the team's notify.
  await Promise.all(
    recipients.map(async (to) => {
      try {
        const result = await resend().emails.send({
          from: DEFAULT_FROM,
          to,
          subject,
          html,
        });

        await prisma.emailLog.create({
          data: {
            registrationId: null,
            toEmail: to,
            kind: "VENDOR_APPLICATION_RECEIVED",
            subject,
            status: result.data?.id ? "SENT" : "FAILED",
            providerId: result.data?.id ?? null,
            errorMessage: result.error?.message ?? null,
            sentAt: new Date(),
          },
        });
      } catch (e: any) {
        console.error(`[vendor-application] notify failed for ${to}:`, e?.message);
        // Still record the attempt so the email log shows what we tried.
        try {
          await prisma.emailLog.create({
            data: {
              registrationId: null,
              toEmail: to,
              kind: "VENDOR_APPLICATION_RECEIVED",
              subject,
              status: "FAILED",
              providerId: null,
              errorMessage: e?.message ?? "send threw",
              sentAt: new Date(),
            },
          });
        } catch {
          // EmailLog write itself failed — nothing actionable here, move on.
        }
      }
    })
  );
}

/**
 * Tell the attendee the outcome of their refund request. Branded (from the org)
 * since it's customer-facing. For approvals, pass the exact refunded amount so
 * the email matches what Stripe actually returned.
 */
export async function sendRefundRequestDecisionEmail(
  refundRequestId: string,
  decision: "approved" | "denied",
  opts?: { refundedCents?: number; full?: boolean },
) {
  const rr = await prisma.refundRequest.findUnique({
    where: { id: refundRequestId },
    include: {
      registration: { select: { firstName: true, email: true, currency: true } },
      event: { select: { name: true, organization: true } },
    },
  });
  if (!rr) return;

  const reg = rr.registration;
  const org = rr.event.organization ?? {};
  const brand = (typeof org.brandColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(org.brandColor))
    ? org.brandColor
    : "#1F3A8A";

  const approved = decision === "approved";
  const subject = approved
    ? `Your refund request was approved — ${rr.event.name}`
    : `Update on your refund request — ${rr.event.name}`;

  // "full" = the whole payment including the platform fee (used when the event
  // was rescheduled — the organizer moved the date, so the attendee doesn't
  // pay the fee). Otherwise the standard net wording.
  const amountLine =
    approved && typeof opts?.refundedCents === "number"
      ? opts?.full
        ? `<p style="color:#475569"><strong>$${(opts.refundedCents / 100).toFixed(2)}</strong> — your full payment, including the platform fee — is being returned to your original payment method. It may take 5&ndash;10 business days to appear.</p>`
        : `<p style="color:#475569"><strong>$${(opts.refundedCents / 100).toFixed(2)}</strong> (your ticket price minus our non-refundable 5% platform fee) is being returned to your original payment method. It may take 5&ndash;10 business days to appear. If a payment processing fee was added to your order at checkout, that fee is charged by Stripe and is non-refundable per Stripe&rsquo;s policy.</p>`
      : approved
        ? `<p style="color:#475569">Your refund is being processed back to your original payment method and may take 5&ndash;10 business days to appear.</p>`
        : "";

  const body = approved
    ? `<h1 style="margin:0 0 8px;color:${brand}">Refund approved</h1>
       <p style="color:#475569">Hi ${esc(reg.firstName)}, your refund request for <strong>${esc(rr.event.name)}</strong> has been approved.</p>
       ${amountLine}`
    : `<h1 style="margin:0 0 8px;color:${brand}">Refund request update</h1>
       <p style="color:#475569">Hi ${esc(reg.firstName)}, after review your refund request for <strong>${esc(rr.event.name)}</strong> was not approved.</p>`;

  const note = rr.reviewNote
    ? `<div style="background:#f1f5f9;border-left:4px solid ${brand};padding:12px 16px;margin:16px 0"><strong>Note from the organizer:</strong><br>${esc(rr.reviewNote).replace(/\n/g, "<br>")}</div>`
    : "";

  try {
    const result = await resend().emails.send({
      from: buildFrom(org),
      to: reg.email,
      subject,
      html: `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      ${body}
      ${note}
      ${approved ? "" : `<p style="color:#64748b;font-size:12px;margin-top:16px">If you have questions, reply to this email to reach the organizer.</p>`}
    </td></tr>
  </table>
</body></html>`,
    });

    await prisma.emailLog.create({
      data: {
        registrationId: rr.registrationId,
        toEmail: reg.email,
        kind: approved ? "REFUND_REQUEST_APPROVED" : "REFUND_REQUEST_DENIED",
        subject,
        status: result.data?.id ? "SENT" : "FAILED",
        providerId: result.data?.id ?? null,
        errorMessage: result.error?.message ?? null,
        sentAt: new Date(),
      },
    });
  } catch (e: any) {
    console.error("[refund-request] attendee notify failed:", e?.message);
  }
}

/**
 * Post-event "How was it?" invite with one-click star rating. Sent by the
 * worker's inviteEventReviews job a few hours after the event ends, to verified
 * registrants. Each star is its own link carrying a signed, single-purpose
 * review token (see signReviewToken) — clicking one opens the review page with
 * that rating pre-filled, no login required. Logged as POST_EVENT.
 *
 * Dedup is handled by the caller (reviewInvitedAt is stamped claim-first before
 * this runs), so a send failure here won't loop.
 *
 * opts.reminder = true sends the single follow-up variant (softer subject/copy);
 * the worker sends at most one reminder per registration (reviewRemindedAt).
 */
export async function sendReviewRequestEmail(registrationId: string, opts?: { reminder?: boolean }) {
  const reminder = opts?.reminder ?? false;
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: { include: { organization: true } } },
  });
  if (!reg) return;

  const e: any = reg.event;
  const org: any = e.organization ?? {};
  const brand = (typeof org.brandColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(org.brandColor)) ? org.brandColor : "#1F3A8A";
  const orgName = esc(org.name ?? "");
  const logo = org.logoUrl
    ? `<img src="${esc(org.logoUrl)}" alt="${orgName}" style="max-height:48px;max-width:200px;object-fit:contain;margin-bottom:12px"/>`
    : "";
  const when = formatInTimeZone(e.startAt, e.timezone, "MMMM d, yyyy");

  const token = await signReviewToken({ registrationId: reg.id });
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const link = (rating: number) => `${base}/review/${token}?rating=${rating}`;

  // One <a> per star. Email clients don't run JS, so each star is a distinct URL
  // that pre-selects that rating on the landing page.
  const stars = [1, 2, 3, 4, 5]
    .map((n) => `<a href="${link(n)}" style="text-decoration:none;color:#EF9F27;font-size:34px;line-height:1;padding:0 3px" aria-label="${n} star${n > 1 ? "s" : ""}">&#9733;</a>`)
    .join("");

  const subject = reminder ? `Quick favor — how was ${e.name}?` : `How was ${e.name}?`;
  const intro = reminder
    ? `Hi ${esc(reg.firstName)}, just one gentle nudge — if you have two seconds, tap a star to rate <strong>${esc(e.name)}</strong>. This is the only reminder we&rsquo;ll send.`
    : `Hi ${esc(reg.firstName)}, thanks for coming out on ${when}. Tap a star to rate it — it takes two seconds and helps other attendees find great organizers.`;
  const html = `
<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:24px">
    <tr><td>
      ${logo}
      <h1 style="margin:0 0 8px;color:${brand}">How was ${esc(e.name)}?</h1>
      <p style="color:#475569">${intro}</p>
      <div style="text-align:center;margin:20px 0 8px">${stars}</div>
      <p style="text-align:center;margin:0 0 8px">
        <a href="${link(0)}" style="color:${brand};font-weight:bold;text-decoration:none">Write a review</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:20px">You're getting this because you registered for ${esc(e.name)}${orgName ? `, hosted by ${orgName}` : ""}. No account needed — the link above signs you in for this review only.</p>
    </td></tr>
  </table>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">${orgName} · Powered by Your Events App</p>
</body></html>`;

  const result = await resend().emails.send({
    from: buildFrom(org),
    to: reg.email,
    subject,
    html,
  });

  await prisma.emailLog.create({
    data: {
      registrationId: reg.id,
      toEmail: reg.email,
      kind: "POST_EVENT",
      subject,
      status: result.data?.id ? "SENT" : "FAILED",
      providerId: result.data?.id ?? null,
      errorMessage: result.error?.message ?? null,
      sentAt: new Date(),
    },
  });
}

export async function sendReminderEmail(registrationId: string, kind: "REMINDER_30D"|"REMINDER_7D"|"REMINDER_1D"|"REMINDER_1H") {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId }, include: { event: { include: { organization: true } } },
  });
  if (!reg) return;
  const labels = { REMINDER_30D: "30 days", REMINDER_7D: "1 week", REMINDER_1D: "tomorrow", REMINDER_1H: "1 hour" };
  const orgSlug = reg.event.organization?.slug ?? "_";
  const subject = `Reminder: ${reg.event.name} is in ${labels[kind]}`;

  // Claim-first: write the log as QUEUED before sending. The worker's dedupe
  // filter sees the claim, so a crash mid-send (or an overlapping worker)
  // can't double-send. Then record the real outcome — previously this was
  // hardcoded SENT even when Resend rejected, so failures were invisible AND
  // never retried.
  const log = await prisma.emailLog.create({
    data: { registrationId: reg.id, toEmail: reg.email, kind, subject, status: "QUEUED" },
  });
  try {
    const result = await resend().emails.send({
      from: buildFrom(reg.event.organization),
      to: reg.email,
      subject,
      html: `<p>Hi ${esc(reg.firstName)}, your event is coming up in ${labels[kind]}. See you there!</p>
             <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/o/${orgSlug}/events/${reg.event.slug}">View event</a></p>`,
    });
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: result.data?.id ? "SENT" : "FAILED",
        providerId: result.data?.id ?? null,
        errorMessage: result.error?.message ?? null,
        sentAt: new Date(),
      },
    });
  } catch (e: any) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorMessage: e?.message ?? "send threw" },
    }).catch(() => {});
    throw e;
  }
}
