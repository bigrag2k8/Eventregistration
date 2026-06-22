import Link from "next/link";

export const metadata = {
  title: "How it works — Your Events App",
  description: "Sign up, connect Stripe, then create your event, sell tickets, check people in, and get paid.",
};

// Two prerequisites every organizer completes once, up-front. They're not
// numbered in the main 4-step flow because they happen before any event
// exists — but they're called out because nothing else works without them.
const PREREQS = [
  {
    title: "Create your organizer account",
    body: "Sign up at yourevents.app/signup. Tell us your organization name, mailing address, and contact info. Free tier is enabled by default — pick a paid plan later if you outgrow it.",
    cta: { label: "Sign up", href: "/signup" },
  },
  {
    title: "Connect Stripe to get paid",
    body: "From your dashboard, link a Stripe Connect account. This takes 5-10 minutes (Stripe verifies your identity and bank account). Payouts from every paid ticket and vendor booth go directly to your own bank — we never hold your money.",
    cta: { label: "Why Stripe?", href: "/security" },
  },
];

// The actual repeating flow — once the account + Stripe is set up, you run
// every event from here on by walking through these four steps.
const STEPS = [
  {
    n: "1",
    title: "Create your event",
    body: "Set up a branded event page in minutes. Pick a date and venue (with autocomplete to fill the address), add ticket types and prices, set the capacity, and write your description. Photos, schedule, speakers, custom questions — all optional, all editable later.",
  },
  {
    n: "2",
    title: "Sell tickets & collect registrations",
    body: "Share one link. Attendees register and pay by card; the price you set is the price they pay (we never tack on buyer fees). Promo codes, waitlists when you sell out, refund-request handling, and vendor booth applications all run from the same dashboard.",
  },
  {
    n: "3",
    title: "Check people in",
    body: "Every confirmed ticket gets a secure QR code emailed to the attendee. On event day, anyone on your team scans the QR from their phone — each ticket admits once, duplicates get flagged, and arrival counts update in real time so you know how full the venue is.",
  },
  {
    n: "4",
    title: "Get paid",
    body: "Payouts land in the Stripe-linked bank account on Stripe's normal schedule (usually 2 business days). Track gross sales, our 4.5% platform fee, refunds, and net payout from the financials dashboard. Issue refunds with one click — we reverse the platform fee proportionally.",
  },
];

export default function HowItWorksPage() {
  return (
    <main>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">How it works</h1>
        <p className="mt-4 text-lg text-slate-600">
          Two one-time setup steps, then a repeatable four-step flow you run for every event.
        </p>
        <div className="mt-8">
          <Link href="/signup" className="btn-primary">Host an event — get started</Link>
          <p className="mt-3 text-xs text-slate-500">Free tier available · No credit card required</p>
        </div>
      </section>

      {/* Prerequisites: one-time setup */}
      <section className="mx-auto max-w-5xl px-4 pb-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800">
            Before your first event
          </span>
          <span className="text-sm text-slate-500">Two one-time steps</span>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {PREREQS.map((p, i) => (
            <div key={p.title} className="card border-amber-200 ring-amber-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-lg font-semibold text-white">
                {String.fromCharCode(65 + i) /* A, B */}
              </div>
              <h2 className="mt-4 text-xl font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.body}</p>
              <Link
                href={p.cta.href}
                className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
              >
                {p.cta.label} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* The 4-step recurring flow */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-800">
            For every event
          </span>
          <span className="text-sm text-slate-500">Four steps, repeat as needed</span>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {STEPS.map((s) => (
            <div key={s.n} className="card">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white">
                {s.n}
              </div>
              <h2 className="mt-4 text-xl font-semibold">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl bg-brand-50 p-8 text-center ring-1 ring-brand-100">
          <h2 className="text-xl font-semibold text-brand-900">Ready to run your next event?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
            Sign up for free, connect Stripe in 5 minutes, and have your first ticket page live the same day.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn-primary">Get started</Link>
            <Link href="/pricing" className="btn-secondary">View pricing</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
