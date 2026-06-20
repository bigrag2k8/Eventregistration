import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { esc } from "@/lib/email";
import { maintenanceGuard } from "@/lib/maintenance";
import { getSession } from "@/lib/auth";

const CATEGORIES = ["attendees", "organizers", "everything-else"] as const;
type Category = (typeof CATEGORIES)[number];
const CATEGORY_LABELS: Record<Category, string> = {
  "attendees": "Attendees",
  "organizers": "Organizers",
  "everything-else": "Everything else",
};

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  category: z.enum(CATEGORIES),
  subject: z.string().max(200).optional(),
  message: z.string().min(10).max(8000),
  // Honeypot. Bots fill every input they find; humans don't see this one because
  // the form hides it off-screen. If anything comes through here, we silently
  // accept (HTTP 200) without sending, so the bot doesn't retry.
  website: z.string().max(0).optional(),
});

const SUPPORT_TO = process.env.SUPPORT_EMAIL ?? "support@yourevents.app";
const FROM = process.env.EMAIL_FROM ?? "Your Events App <events@yourevents.app>";

let _resend: Resend | null = null;
function resend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

export async function POST(req: Request) {
  // Maintenance window: don't queue support emails during downtime.
  const block = await maintenanceGuard(await getSession());
  if (block) return block;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }
  const { name, email, category, subject, message, website } = parsed.data;

  // Honeypot tripped — pretend it succeeded.
  if (website && website.length > 0) return NextResponse.json({ ok: true });

  // 5/hour per IP keeps the support inbox from becoming a spam target.
  const ip = clientIp(req);
  const rl = await rateLimit(`contact:${ip}`, 5, 3600);
  if (!rl.allowed) {
    return NextResponse.json({
      error: "You've sent a few messages already. Try again in an hour, or email support@yourevents.app directly.",
    }, { status: 429 });
  }

  const client = resend();
  if (!client) {
    return NextResponse.json({ error: "Email service is not configured." }, { status: 500 });
  }

  const categoryLabel = CATEGORY_LABELS[category];
  // Subject is prefixed with the category for easy inbox filtering; falls back
  // to the first line of the message when no subject is given.
  const subjectLine = `[${categoryLabel}] ${subject?.trim() || message.slice(0, 80).replace(/\n/g, " ").trim()}`;

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;padding:24px;background:#fff;border-radius:12px">
  <h1 style="color:#1F3A8A;margin:0 0 12px;font-size:18px">New support message — ${esc(categoryLabel)}</h1>
  <table style="width:100%;font-size:14px;color:#475569;margin-bottom:16px">
    <tr><td style="padding:4px 0;width:90px">From:</td><td><strong style="color:#0f172a">${esc(name)}</strong> &lt;${esc(email)}&gt;</td></tr>
    <tr><td style="padding:4px 0">Category:</td><td>${esc(categoryLabel)}</td></tr>
    ${subject ? `<tr><td style="padding:4px 0">Subject:</td><td>${esc(subject)}</td></tr>` : ""}
    <tr><td style="padding:4px 0">IP:</td><td style="color:#94a3b8;font-family:monospace;font-size:12px">${esc(ip)}</td></tr>
  </table>
  <div style="border-top:1px solid #e2e8f0;padding-top:14px">
    <div style="color:#475569;font-size:12px;margin-bottom:6px">Message:</div>
    <div style="white-space:pre-wrap;color:#0f172a;line-height:1.5">${esc(message)}</div>
  </div>
  <p style="color:#94a3b8;font-size:12px;margin-top:16px">Reply directly to this email — it routes back to ${esc(email)}.</p>
</div>`;

  try {
    const result = await client.emails.send({
      from: FROM,
      to: SUPPORT_TO,
      reply_to: email,
      subject: subjectLine,
      html,
    });
    if (!result.data?.id) {
      return NextResponse.json({ error: "Could not send your message. Please try again later." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[contact] send failed:", e?.message);
    return NextResponse.json({ error: "Could not send your message. Please try again later." }, { status: 500 });
  }
}
