import Link from "next/link";

export const metadata = {
  title: "How it works — Your Events App",
  description: "Create an event, sell tickets, check people in, and get paid.",
};

const STEPS = [
  {
    n: "1",
    title: "Create your event",
    body: "Set up a branded event page in minutes — details, schedule, ticket types, and capacity. Hosting free events is always free.",
  },
  {
    n: "2",
    title: "Sell tickets & collect registrations",
    body: "Share one link. Attendees register and pay by card, with promo codes, waitlists, and vendor applications built in.",
  },
  {
    n: "3",
    title: "Check people in",
    body: "Every ticket gets a secure QR code. Scan at the door from any phone — each ticket admits once, and arrivals update in real time.",
  },
  {
    n: "4",
    title: "Get paid",
    body: "Payouts go straight to your own Stripe account. Track sales, fees, and refunds from the financials dashboard.",
  },
];

export default function HowItWorksPage() {
  return (
    <main>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">How it works</h1>
        <p className="mt-4 text-lg text-slate-600">
          From the first ticket to the final payout, Your Events App runs the whole event in four steps.
        </p>
        <div className="mt-8">
          <Link href="/signup" className="btn-primary">Host an event — get started</Link>
          <p className="mt-3 text-xs text-slate-500">Free tier available · No credit card required</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
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
            See the plans, or jump straight in and create your first event for free.
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
