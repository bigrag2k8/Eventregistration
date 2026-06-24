import Link from "next/link";
import { PLATFORM_FEE_PERCENT, MIN_PLATFORM_FEE_CENTS } from "@/lib/connect";

export const metadata = {
  title: "Why YourEvents — honest event management",
  description:
    "Why community organizers choose YourEvents for event management — flat 5% fees, direct Stripe payouts, no surprise buyer charges, built-in vendor flow, and tools that actually fit small events.",
};

const PILLARS = [
  {
    title: "Honest pricing, no surprises",
    body: "A flat 5% fee with a $1.25 minimum on paid tickets. We charge the organizer, never the attendee. The price you set is the price they pay — no service fee, no $1.79 surcharge, no fine print at checkout.",
  },
  {
    title: "Direct payouts to your bank",
    body: "Money flows through your own Stripe Connect account on Stripe's normal schedule (usually 2 business days). We never hold your funds and we never delay your payouts until after the event.",
  },
  {
    title: "Built for the events you actually run",
    body: "Community workshops, fundraisers, small conferences, vendor fairs. Every workflow is built around the way real organizers work — not around squeezing more fees out of large concert tours.",
  },
];

const FEATURES = [
  { title: "Branded event pages", body: "Custom URL, logo, brand color, banner image with drag-to-crop. Looks like your event, not ours." },
  { title: "QR-coded tickets", body: "Every confirmed ticket gets a unique QR emailed to the attendee. Scan at the door from any phone." },
  { title: "Vendor application flow", body: "Vendors apply through your event page, you approve and quote a price, they pay through a secure link. Built in." },
  { title: "Promo codes & waitlists", body: "Discount codes, sold-out waitlists with auto-promotion, presale early-bird pricing — all standard." },
  { title: "Refund handling", body: "Attendees request, you approve or decline, our 5% fee reverses proportionally. No phone calls to Stripe." },
  { title: "Team roles & check-in", body: "Invite organizers, staff, or volunteers. Day-of, anyone with the link can scan QRs." },
];

const PROBLEMS = [
  { issue: "A $10 ticket on Eventbrite costs your attendee $12.45.", answer: "On YourEvents, a $10 ticket costs $10." },
  { issue: "Eventbrite holds your money until after the event.", answer: "We never touch your money. Stripe pays you in 2 business days." },
  { issue: "Vendor applications, attendee tickets, and check-in usually need three separate tools.", answer: "All three live on one dashboard." },
  { issue: "Most platforms charge a monthly fee whether you run events or not.", answer: "Free tier hosts free events forever. Paid events are pay-as-you-go." },
];

export default function WhyPage() {
  return (
    <main>
      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
            Why YourEvents
          </span>
          <h1 className="mt-5 text-5xl font-bold tracking-tight text-slate-900">
            Event management without the hidden fees, the complexity,
            <span className="text-brand-700"> or the wait for your money.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            Flat {PLATFORM_FEE_PERCENT}% pricing with a ${(MIN_PLATFORM_FEE_CENTS / 100).toFixed(2)} minimum.
            Direct Stripe payouts to your bank. One dashboard for tickets, vendors,
            check-in, and refunds. Built for community organizers, not for global concert tours.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn-primary">Get started free</Link>
            <Link href="/compare" className="btn-secondary">See how we compare to Eventbrite</Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            No credit card required to start. Free events are always free to host.
          </p>
        </div>
      </section>

      {/* Three pillars */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="card flex flex-col">
              <div className="text-3xl font-bold text-brand-700">
                {PILLARS.indexOf(p) + 1}
              </div>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The pricing punchline */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            The math, on a $20 ticket.
          </h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            We charge the organizer, never the attendee. Other platforms quietly add their fees on top
            of the price you set. Here&rsquo;s what each side experiences.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl bg-white p-6 ring-1 ring-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Eventbrite</h3>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt>Ticket price</dt><dd>$20.00</dd></div>
                <div className="flex justify-between text-amber-700"><dt>+ Service fee (3.7% + $1.79)</dt><dd>+$2.53</dd></div>
                <div className="flex justify-between text-amber-700"><dt>+ Processing fee (2.9%)</dt><dd>+$0.58</dd></div>
                <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Attendee pays</dt><dd>$23.11</dd></div>
                <div className="flex justify-between text-sm text-slate-500"><dt>Organizer nets (if absorbed)</dt><dd>$16.89</dd></div>
              </dl>
            </div>
            <div className="rounded-xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
              <h3 className="text-lg font-semibold text-emerald-900">YourEvents</h3>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt>Ticket price</dt><dd>$20.00</dd></div>
                <div className="flex justify-between text-emerald-700"><dt>+ Surcharges</dt><dd>$0.00</dd></div>
                <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Attendee pays</dt><dd>$20.00</dd></div>
                <div className="flex justify-between text-sm text-slate-700"><dt>Organizer nets ({PLATFORM_FEE_PERCENT}% fee)</dt><dd>$19.00</dd></div>
              </dl>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            On a 200-attendee event, that&rsquo;s an extra <strong className="text-slate-900">$420 in your pocket</strong> — and your attendees pay $620 less in surcharges.
          </p>
        </div>
      </section>

      {/* Everything in one place */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Everything you need, in one place.
        </h2>
        <p className="mt-3 max-w-2xl text-slate-600">
          You shouldn&rsquo;t need three platforms to run an event. Tickets, vendors, check-in,
          payouts, refunds — all from one dashboard, with one fee.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <h3 className="text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The problem / answer rapid-fire */}
      <section className="bg-slate-900 py-16 text-white">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-3xl font-bold tracking-tight">
            What every organizer has to put up with elsewhere.
          </h2>
          <p className="mt-3 max-w-2xl text-slate-300">
            We built YourEvents because we got tired of explaining why our attendees paid more than the
            ticket price. Here&rsquo;s what we fixed.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {PROBLEMS.map((row, i) => (
              <div key={i} className="rounded-xl bg-slate-800 p-6 ring-1 ring-slate-700">
                <p className="text-sm text-slate-300">{row.issue}</p>
                <p className="mt-3 text-base font-semibold text-emerald-300">{row.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Built for organizers who care where their attendees&rsquo; money goes.
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
            <h3 className="text-lg font-semibold text-emerald-900">If you run any of these, you&rsquo;ll love it.</h3>
            <ul className="mt-3 space-y-2 text-sm text-emerald-900">
              <li className="flex gap-2"><span aria-hidden>•</span> Community workshops, classes, retreats</li>
              <li className="flex gap-2"><span aria-hidden>•</span> Fundraisers, galas, charity events</li>
              <li className="flex gap-2"><span aria-hidden>•</span> Small-to-mid conferences ($5-$50 tickets)</li>
              <li className="flex gap-2"><span aria-hidden>•</span> Vendor fairs, craft markets, food festivals</li>
              <li className="flex gap-2"><span aria-hidden>•</span> Faith-based, civic, or neighborhood events</li>
            </ul>
          </div>
          <div className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">We&rsquo;re honest about who we&rsquo;re not for.</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex gap-2"><span aria-hidden>•</span> Stadium concerts with reserved seating charts</li>
              <li className="flex gap-2"><span aria-hidden>•</span> Multi-city tours needing recurring schedules</li>
              <li className="flex gap-2"><span aria-hidden>•</span> Events that depend on platform-driven discovery</li>
              <li className="flex gap-2"><span aria-hidden>•</span> Box-office walk-up sales as a primary channel</li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">For those, Eventbrite is genuinely the right call.</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-brand-50 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-brand-900">
            Try it on your next event.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-700">
            Sign up free, connect Stripe in five minutes, publish your event page the same day.
            Free events stay free forever. Paid events run at flat {PLATFORM_FEE_PERCENT}%.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn-primary">Create your free account</Link>
            <Link href="/how-it-works" className="btn-secondary">See how it works</Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Questions? <Link href="/contact" className="font-medium text-brand-700 hover:underline">Reach out</Link> — a human will reply.
          </p>
        </div>
      </section>
    </main>
  );
}
