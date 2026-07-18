import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "Your Events App <events@yourevents.app>";

/**
 * Send an operational alert to the platform team (reconciliation failures,
 * disputes, etc.). Best-effort and NON-throwing by design: if OPS_ALERT_EMAIL
 * or RESEND_API_KEY is missing, or the send fails, it logs and returns — a
 * missing alert config must never break the webhook/job that called it.
 */
export async function notifyOps(subject: string, body: string): Promise<void> {
  const to = process.env.OPS_ALERT_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !key) {
    console.warn(`[ops-alert] not sent (set OPS_ALERT_EMAIL + RESEND_API_KEY): ${subject}\n${body}`);
    return;
  }
  try {
    await new Resend(key).emails.send({
      from: FROM,
      to,
      subject: `[EventFlow ops] ${subject}`,
      text: body,
    });
  } catch (e) {
    console.error("[ops-alert] failed to send:", subject, e);
  }
}

function esc(v: string | null | undefined): string {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/**
 * Notify the platform owner that a new organization + organizer just signed up,
 * so they can eyeball the details. Sent to OPS_ALERT_EMAIL, falling back to
 * OWNER_EMAIL (whichever inbox the owner watches). UNLIKE notifyOps this THROWS
 * on a send failure so the caller can capture it — but a missing recipient /
 * API key is a no-op (returns), never an error. The caller wraps it so signup
 * itself can never fail because of this FYI email.
 */
export async function notifyNewOrganization(info: {
  orgId: string;
  orgName: string;
  orgSlug: string;
  contactEmail: string;
  contactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  organizerFirstName: string;
  organizerLastName: string;
  organizerEmail: string;
  organizerPhone: string | null;
  referredByOrgId: string | null;
  ip?: string | null;
}): Promise<void> {
  const to = process.env.OPS_ALERT_EMAIL ?? process.env.OWNER_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !key) {
    console.warn("[new-org-alert] not sent (set OPS_ALERT_EMAIL or OWNER_EMAIL, plus RESEND_API_KEY)");
    return;
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.yourevents.app").replace(/\/$/, "");
  const adminUrl = `${appUrl}/admin/orgs/${info.orgId}`;
  const publicUrl = `${appUrl}/o/${info.orgSlug}`;
  const address = [info.addressLine1, info.addressLine2, [info.city, info.state, info.zipCode].filter(Boolean).join(", "), info.country]
    .filter(Boolean)
    .join(" · ");
  const organizer = `${info.organizerFirstName} ${info.organizerLastName}`.trim();

  const text =
    `New organization signed up on Your Events App.\n\n` +
    `ORGANIZATION\n` +
    `  Name:     ${info.orgName}\n` +
    `  URL slug: ${info.orgSlug}  (${publicUrl})\n` +
    `  Contact:  ${info.contactEmail}${info.contactPhone ? ` · ${info.contactPhone}` : ""}\n` +
    `  Address:  ${address || "—"}\n\n` +
    `ORGANIZER (account owner)\n` +
    `  Name:  ${organizer || "—"}\n` +
    `  Email: ${info.organizerEmail}\n` +
    `  Phone: ${info.organizerPhone || "—"}\n\n` +
    `  Referred by org: ${info.referredByOrgId ?? "—"}\n` +
    `  Signup IP:       ${info.ip || "—"}\n\n` +
    `Review in admin: ${adminUrl}\n`;

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap;vertical-align:top">${esc(label)}</td>` +
    `<td style="padding:4px 0;color:#0f172a">${value}</td></tr>`;
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">` +
    `<h2 style="margin:0 0 4px">New organization signed up</h2>` +
    `<p style="margin:0 0 16px;color:#64748b">Review their details, then approve/act as needed.</p>` +
    `<h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Organization</h3>` +
    `<table style="border-collapse:collapse;font-size:14px">` +
    row("Name", `<strong>${esc(info.orgName)}</strong>`) +
    row("URL slug", `${esc(info.orgSlug)} &middot; <a href="${esc(publicUrl)}">${esc(publicUrl)}</a>`) +
    row("Contact", esc([info.contactEmail, info.contactPhone].filter(Boolean).join(" · "))) +
    row("Address", esc(address || "—")) +
    `</table>` +
    `<h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Organizer</h3>` +
    `<table style="border-collapse:collapse;font-size:14px">` +
    row("Name", esc(organizer || "—")) +
    row("Email", esc(info.organizerEmail)) +
    row("Phone", esc(info.organizerPhone || "—")) +
    row("Referred by", esc(info.referredByOrgId ?? "—")) +
    row("Signup IP", esc(info.ip || "—")) +
    `</table>` +
    `<p style="margin:20px 0 0"><a href="${esc(adminUrl)}" style="display:inline-block;background:#1F3A8A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Review in admin →</a></p>` +
    `</div>`;

  await new Resend(key).emails.send({
    from: FROM,
    to,
    subject: `[EventFlow] New org: ${info.orgName} (${info.orgSlug})`,
    text,
    html,
  });
}
