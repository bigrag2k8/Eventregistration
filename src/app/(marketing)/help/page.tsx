import Link from "next/link";

export const metadata = {
  title: "Help — Your Events App",
  description: "Answers to common questions for attendees and organizers.",
};

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "I registered for an event — where are my tickets?",
    a: (
      <>
        Your ticket and QR code are emailed to you right after you register, and you can always find
        them by signing in at{" "}
        <Link href="/account/signin" className="text-brand-700 hover:underline">your account</Link>.
        Check your spam folder if the email hasn&apos;t arrived within a few minutes.
      </>
    ),
  },
  {
    q: "How do refunds work?",
    a: (
      <>
        Refund policies are set by the event organizer. You can request a refund from your account&apos;s
        order page, and the organizer will review it. Approved refunds are returned to your original
        payment method.
      </>
    ),
  },
  {
    q: "How do I host my own event?",
    a: (
      <>
        Create an organizer account, build your event page, and publish — it takes a few minutes.
        See <Link href="/how-it-works" className="text-brand-700 hover:underline">how it works</Link>{" "}
        or <Link href="/pricing" className="text-brand-700 hover:underline">view pricing</Link>.
      </>
    ),
  },
  {
    q: "How do payouts reach me as an organizer?",
    a: (
      <>
        Ticket revenue is paid directly to your own connected Stripe account on Stripe&apos;s standard
        payout schedule. You can track sales, fees, and refunds from your financials dashboard.
      </>
    ),
  },
  {
    q: "Is there a fee to use the platform?",
    a: (
      <>
        Hosting free events is free. To unlock the full feature set for an event you pay once — no
        subscription. See <Link href="/pricing" className="text-brand-700 hover:underline">pricing</Link>{" "}
        for details.
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Help center</h1>
      <p className="mt-4 text-lg text-slate-600">
        Answers to the questions we hear most. Still stuck? We&apos;re happy to help.
      </p>

      <div className="mt-10 space-y-4">
        {FAQS.map((f) => (
          <details key={f.q} className="card group">
            <summary className="cursor-pointer list-none font-semibold marker:hidden">
              <span className="flex items-center justify-between">
                {f.q}
                <span aria-hidden className="ml-4 text-slate-400 transition group-open:rotate-45">＋</span>
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-10 rounded-xl bg-slate-50 p-6 text-center ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold">Need more help?</h2>
        <p className="mt-2 text-sm text-slate-600">
          Reach our support team and we&apos;ll get back to you.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href="/contact" className="btn-primary">Contact support</Link>
          <a href="mailto:events@yourevents.app" className="btn-secondary">events@yourevents.app</a>
        </div>
      </div>
    </main>
  );
}
