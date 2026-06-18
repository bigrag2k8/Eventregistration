import Link from "next/link";

export const metadata = {
  title: "Contact support — Your Events App",
  description: "Get in touch with the Your Events App team.",
};

const TOPICS = [
  {
    title: "Attendees",
    body: "Questions about a ticket, registration, or refund for an event you're attending.",
  },
  {
    title: "Organizers",
    body: "Help setting up events, payouts, branding, team access, or billing.",
  },
  {
    title: "Everything else",
    body: "Partnerships, press, security reports, or anything not covered above.",
  },
];

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Contact support</h1>
      <p className="mt-4 text-lg text-slate-600">
        Email us and a real person will get back to you, typically within one business day.
      </p>

      <div className="mt-8 rounded-xl bg-brand-50 p-6 ring-1 ring-brand-100">
        <div className="text-sm text-slate-600">Email us at</div>
        <a
          href="mailto:events@yourevents.app"
          className="text-2xl font-semibold text-brand-700 hover:underline"
        >
          events@yourevents.app
        </a>
        <div className="mt-4">
          <a href="mailto:events@yourevents.app" className="btn-primary">Send an email</a>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {TOPICS.map((t) => (
          <div key={t.title} className="card">
            <h2 className="font-semibold">{t.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-sm text-slate-500">
        Looking for quick answers first? Try the{" "}
        <Link href="/help" className="text-brand-700 hover:underline">help center</Link>.
      </p>
    </main>
  );
}
