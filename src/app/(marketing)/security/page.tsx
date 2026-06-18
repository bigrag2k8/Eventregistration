export const metadata = {
  title: "Security & compliance — Your Events App",
  description: "How Your Events App protects your data, payments, and attendees.",
};

const INTRO =
  "Built with the same standards as enterprise SaaS — appropriate for organizations of every size.";

// Each item may lead with a bold term separated by an em dash; render that part
// emphasized and the rest as the explanation.
const ITEMS = [
  "HTTPS everywhere with modern TLS and strict transport security.",
  "PCI-DSS compliant payments via Stripe — card data never enters our database.",
  "Encrypted at rest on PostgreSQL, with daily encrypted backups available.",
  "Bcrypt password hashing (cost 12) — we can't see your password.",
  "Two-factor authentication (TOTP) — Organizers and staff can turn on app-based MFA (Google Authenticator, Authy, 1Password) with encrypted secrets and single-use recovery codes.",
  "Cryptographically signed QR codes — tickets cannot be forged or duplicated.",
  "Single-use invite tokens that expire after 7 days. Stale links can't be used.",
  "Rate limiting on authentication and check-in endpoints — brute-force protection built in.",
  "Audit logging on every organizer and staff action — accountability without spreadsheets.",
  "Role-based access control with hard isolation between organizations.",
  "GDPR-friendly data handling with export and delete endpoints for attendees who request it.",
];

function SecurityItem({ text }: { text: string }) {
  const sep = " — ";
  const i = text.indexOf(sep);
  const lead = i >= 0 ? text.slice(0, i) : null;
  const rest = i >= 0 ? text.slice(i + sep.length) : text;
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-0.5 select-none font-semibold text-brand-600">✓</span>
      <span className="text-sm leading-relaxed text-slate-700">
        {lead && <span className="font-medium text-slate-900">{lead}</span>}
        {lead && sep}
        {rest}
      </span>
    </li>
  );
}

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Security &amp; compliance</h1>
      <p className="mt-4 text-lg text-slate-600">{INTRO}</p>

      <div className="card mt-8">
        <ul className="space-y-4">
          {ITEMS.map((t) => (
            <SecurityItem key={t} text={t} />
          ))}
        </ul>
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Have a security question or need to report something? Email{" "}
        <a href="mailto:events@yourevents.app" className="text-brand-700 hover:underline">
          events@yourevents.app
        </a>
        .
      </p>
    </main>
  );
}
