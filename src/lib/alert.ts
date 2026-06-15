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
