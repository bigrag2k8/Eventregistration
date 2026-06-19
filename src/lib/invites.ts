import { Resend } from "resend";
import { esc } from "@/lib/email";

const FROM = process.env.EMAIL_FROM ?? "Your Events App <events@yourevents.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

let _resend: Resend | null = null;
function resend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

interface SendInviteParams {
  toEmail: string;
  toName?: string;
  orgName: string;
  token: string;
  inviterName?: string;
  message?: string | null;
  expiresAt: Date;
  role?: string | null;             // e.g. "STAFF", "VOLUNTEER", "ORGANIZER"
  roleDescription?: string | null;  // duties / what they'll do
}

const ROLE_LABEL: Record<string, string> = {
  ORGANIZER: "Organizer (full event access)",
  STAFF: "Staff",
  VOLUNTEER: "Volunteer",
  ADMIN: "Admin",
};

export async function sendInviteEmail(p: SendInviteParams) {
  const client = resend();
  const link = `${APP_URL}/invite/${p.token}`;
  const expiryDate = p.expiresAt.toLocaleDateString("en-US", { dateStyle: "long" });
  const roleLabel = p.role ? (ROLE_LABEL[p.role] ?? p.role) : null;

  if (!client) {
    console.error("[invites] RESEND_API_KEY not set — skipping send. Manual link:", link);
    return { sent: false, link };
  }

  const subject = roleLabel
    ? `${p.inviterName ?? "You"} invited you to ${p.orgName} as ${roleLabel}`
    : `You're invited to set up ${p.orgName} on Your Events App`;

  const intro = roleLabel
    ? `${p.inviterName ? `${esc(p.inviterName)} has` : "You've been"} invited you to join <strong>${esc(p.orgName)}</strong> as <strong>${esc(roleLabel)}</strong>.`
    : `${p.inviterName ? `${esc(p.inviterName)} has` : "You've been"} invited you to set up <strong>${esc(p.orgName)}</strong> on the Your Events App.`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;padding:24px;background:#fff;border-radius:12px">
    <h1 style="color:#1F3A8A;margin:0 0 16px">You've been invited 🎉</h1>
    <p>Hi${p.toName ? " " + esc(p.toName) : ""},</p>
    <p>${intro}</p>
    ${p.roleDescription ? `<div style="background:#FEF3C7;border-left:4px solid #B45309;padding:12px 16px;margin:16px 0"><strong>Your duties:</strong><br>${esc(p.roleDescription).replace(/\n/g, "<br>")}</div>` : ""}
    ${p.message ? `<div style="background:#EFF6FF;border-left:4px solid #1F3A8A;padding:12px 16px;margin:16px 0"><strong>From your inviter:</strong><br>${esc(p.message).replace(/\n/g, "<br>")}</div>` : ""}
    <p>Click the button below to set your password and get started:</p>
    <p style="margin:24px 0">
      <a href="${link}" style="display:inline-block;background:#1F3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
        Accept invite → Set up account
      </a>
    </p>
    <p style="color:#64748b;font-size:13px">
      Or copy and paste this link into your browser:<br>
      <span style="word-break:break-all">${link}</span>
    </p>
    <p style="color:#64748b;font-size:13px">
      This invite expires on <strong>${expiryDate}</strong>. If you weren't expecting this, you can ignore the email.
    </p>
  </div>`;

  try {
    const res = await client.emails.send({
      from: FROM,
      to: p.toEmail,
      subject,
      html,
    });
    return { sent: !!res.data?.id, link, providerId: res.data?.id };
  } catch (e) {
    console.error("[invites] send failed:", e);
    return { sent: false, link };
  }
}

/**
 * Invite a brand-new PLATFORM ADMIN (SUPERADMIN) by email. The link goes to the
 * dedicated /admin-invite accept page where they set a strict password.
 */
export async function sendAdminInviteEmail(p: { toEmail: string; token: string; inviterName?: string | null; expiresAt: Date }) {
  const client = resend();
  const link = `${APP_URL}/admin-invite/${p.token}`;
  const expiry = p.expiresAt.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  if (!client) {
    console.error("[admin-invite] RESEND_API_KEY not set — skipping send. Manual link:", link);
    return { sent: false, link };
  }
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;padding:24px;background:#fff;border-radius:12px">
    <h1 style="color:#1F3A8A;margin:0 0 16px">You've been invited as a platform administrator</h1>
    <p>${p.inviterName ? `${esc(p.inviterName)} has` : "You've been"} invited you to administer <strong>Your Events App</strong> as a platform admin (SUPERADMIN).</p>
    <p>Click below to set a password and activate your admin account. You'll be asked for a strong password.</p>
    <p style="margin:24px 0">
      <a href="${link}" style="display:inline-block;background:#1F3A8A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
        Accept invite &rarr; Set up admin account
      </a>
    </p>
    <p style="color:#64748b;font-size:13px">Or paste this link into your browser:<br><span style="word-break:break-all">${link}</span></p>
    <p style="color:#64748b;font-size:13px">This invite expires on <strong>${expiry}</strong>. If you weren't expecting this, ignore the email.</p>
  </div>`;
  try {
    const res = await client.emails.send({ from: FROM, to: p.toEmail, subject: "You're invited to administer Your Events App", html });
    return { sent: !!res.data?.id, link, providerId: res.data?.id };
  } catch (e) {
    console.error("[admin-invite] send failed:", e);
    return { sent: false, link };
  }
}

/**
 * Security notice to the platform owner(s) whenever a SUPERADMIN invite is
 * created or accepted, so owners always know when a new admin is minted.
 */
export async function sendAdminInviteOwnerNotice(p: { toEmails: string[]; subject: string; body: string }) {
  const client = resend();
  if (!client || p.toEmails.length === 0) return { sent: false };
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;padding:24px;background:#fff;border-radius:12px">
    <h1 style="color:#B91C1C;margin:0 0 16px">Security notice</h1>
    <p>${p.body}</p>
    <p style="color:#64748b;font-size:13px">If this wasn't expected, revoke it from the admin area at <span style="word-break:break-all">${APP_URL}/admin/superadmins</span> and rotate access immediately.</p>
  </div>`;
  try {
    await client.emails.send({ from: FROM, to: p.toEmails, subject: p.subject, html });
    return { sent: true };
  } catch (e) {
    console.error("[admin-invite] owner notice failed:", e);
    return { sent: false };
  }
}
