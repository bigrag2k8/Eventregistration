import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "Automated I.T. Solutions Events APP <onboarding@resend.dev>";
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
}

export async function sendInviteEmail(p: SendInviteParams) {
  const client = resend();
  const link = `${APP_URL}/invite/${p.token}`;
  const expiryDate = p.expiresAt.toLocaleDateString("en-US", { dateStyle: "long" });

  if (!client) {
    console.error("[invites] RESEND_API_KEY not set — skipping send. Manual link:", link);
    return { sent: false, link };
  }

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;padding:24px;background:#fff;border-radius:12px">
    <h1 style="color:#1F3A8A;margin:0 0 16px">You've been invited 🎉</h1>
    <p>Hi${p.toName ? " " + p.toName : ""},</p>
    <p>${p.inviterName ? `${p.inviterName} has` : "You've been"} invited you to set up <strong>${p.orgName}</strong> on the Automated I.T. Solutions Events APP.</p>
    ${p.message ? `<div style="background:#EFF6FF;border-left:4px solid #1F3A8A;padding:12px 16px;margin:16px 0"><strong>From your inviter:</strong><br>${p.message.replace(/\n/g, "<br>")}</div>` : ""}
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
      subject: `You're invited to set up ${p.orgName} on AITS Events`,
      html,
    });
    return { sent: !!res.data?.id, link, providerId: res.data?.id };
  } catch (e) {
    console.error("[invites] send failed:", e);
    return { sent: false, link };
  }
}
