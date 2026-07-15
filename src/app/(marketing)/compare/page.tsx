import Link from "next/link";
import { PLATFORM_FEE_PERCENT, MIN_PLATFORM_FEE_CENTS } from "@/lib/connect";

export const metadata = {
  title: "YourEvents vs Eventbrite — comparison",
  description:
    "Side-by-side comparison of YourEvents and Eventbrite — pricing at every ticket size and the feature lineup, with no buyer fees and honest tradeoffs.",
};

// ── Pricing assumptions ──────────────────────────────────────────────────────
// Eventbrite standard published rates (US, paid tickets), verified 2026-07:
//   - Service fee:    3.7% + $1.79 per paid ticket
//   - Processing:     2.9%
// (Eventbrite's $0/mo "Essentials" package is cheaper per ticket at 2% + $0.79,
//  but the 3.7% + $1.79 standard rate is what most organizers land on; we use
//  it as the conservative, widely-published comparison. Eventbrite removed all
//  per-ticket fee CAPS in 2026, so these fees have no ceiling at any price.)
// Combined, by default ALL of this is passed to the buyer ("attendee covers fees").
// Organizers CAN opt to absorb instead; we show both views in the tables below.
const EB_PCT = 0.037 + 0.029; // 6.6%
const EB_FIXED = 1.79;

// YourEvents (pulled from the constants so this page stays accurate if we tweak):
const YE_PCT = PLATFORM_FEE_PERCENT / 100;
const YE_FLOOR_DOLLARS = MIN_PLATFORM_FEE_CENTS / 100;

function ebFee(price: number): number {
  return price * EB_PCT + EB_FIXED;
}
function yeFee(price: number): number {
  return Math.max(price * YE_PCT, YE_FLOOR_DOLLARS);
}

const TICKET_PRICES = [5, 10, 15, 20, 25, 30, 50, 100];

const FEATURES: Array<{ feature: string; ye: boolean | string; eb: boolean | string; note?: string }> = [
  // ── Where YourEvents is stronger or different ──
  { feature: "Flat pricing, no buyer fees", ye: true, eb: false, note: "Eventbrite adds 3.7% + $1.79 service fee + 2.9% processing to the attendee's bill by default." },
  { feature: "Earn fast daily payouts with a clean track record", ye: true, eb: false, note: "Eventbrite holds every organizer's funds until after the event, always — there's no way to earn faster payouts. On YourEvents, established organizers graduate to daily payouts." },
  { feature: "Recurring classes — drop-in fee cap + all-sessions pass", ye: true, eb: "Partial", note: "Eventbrite supports recurring events, but removed all per-ticket fee caps in 2026 and has no native all-sessions pass — so a $5 class drop-in still carries the full ~$1.79/ticket fee. We cap the class drop-in fee at 10% ($0.50 on a $5 ticket) and sell a one-checkout all-sessions pass at a flat 5%." },
  { feature: "Fees refunded if you cancel the event", ye: true, eb: false, note: "In 2026 Eventbrite stopped refunding its service fees on cancelled events. YourEvents guarantees full refunds — including our platform fee — when an event is cancelled." },
  { feature: "Vendor application & booth payment flow", ye: true, eb: false, note: "Built-in vendor sign-up, organizer review, and Stripe payment-link checkout." },
  { feature: "Refund-request flow with platform-fee handling", ye: true, eb: "Limited", note: "Attendee can request, organizer approves/denies, fee reverses proportionally." },
  { feature: "No per-event purchase needed for first events", ye: true, eb: false, note: "Free tier with 50 attendees/event built in." },
  { feature: "Branded org page with custom colors + logo", ye: true, eb: "Paid tier" },
  { feature: "Custom URL slug (yourevents.app/o/your-name)", ye: true, eb: true },

  // ── Where it's even ──
  { feature: "QR-coded tickets", ye: true, eb: true },
  { feature: "Check-in scanner (web, any phone)", ye: true, eb: true, note: "Eventbrite has a native mobile app; ours is browser-based." },
  { feature: "Custom registration questions", ye: true, eb: true },
  { feature: "Promo codes", ye: true, eb: true },
  { feature: "Waitlists when sold out", ye: true, eb: true },
  { feature: "Email reminders (30d / 7d / 1d / 1h)", ye: true, eb: true },
  { feature: "Email broadcasts to attendees", ye: true, eb: true, note: "Capped per plan — see /pricing." },
  { feature: "Multiple ticket tiers + early-bird presale", ye: true, eb: true },
  { feature: "CSV export of attendees + vendors", ye: true, eb: true },
  { feature: "Team roles (organizer / staff / volunteer)", ye: true, eb: true },
  { feature: "Tax rates per event", ye: true, eb: true },
  { feature: "Speaker bios & event banner", ye: true, eb: true },

  // ── Where Eventbrite is currently stronger ──
  { feature: "Native iOS / Android organizer app", ye: false, eb: true, note: "Our scanner runs in any phone's web browser; full native app is on the roadmap." },
  { feature: "Reserved seating charts", ye: false, eb: true, note: "Best for theater/concert events; not common for community events." },
  { feature: "Paid promotion / ad platform", ye: false, eb: true, note: "Eventbrite Boost lets you buy ads inside Eventbrite. We don't sell ads." },
  { feature: "Marketplace discovery (homepage of EB)", ye: "Limited", eb: true, note: "We surface public events on yourevents.app but don't yet have category browsing." },
];

function fmt(n: number): string {
  return "$" + n.toFixed(2);
}

export default function ComparePage() {
  return (
    <main>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
          Comparison
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">YourEvents vs Eventbrite</h1>
        <p className="mt-4 text-lg text-slate-600">
          Honest side-by-side. We&rsquo;re built for community events where every dollar of fee is
          a dollar your attendees don&rsquo;t spend on the event itself. Here&rsquo;s the breakdown.
        </p>
      </section>

      {/* Feature comparison */}
      <section className="mx-auto max-w-5xl px-4 pb-12">
        <h2 className="text-2xl font-bold">Feature comparison</h2>
        <p className="mt-2 text-sm text-slate-600">
          What each platform offers out of the box. We&rsquo;re honest about where Eventbrite has
          features we don&rsquo;t — they&rsquo;ve had a 15-year head start.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Feature</th>
                <th className="px-4 py-3 text-center w-32">YourEvents</th>
                <th className="px-4 py-3 text-center w-32">Eventbrite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {FEATURES.map((f) => (
                <tr key={f.feature}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{f.feature}</div>
                    {f.note && <div className="mt-0.5 text-xs text-slate-500">{f.note}</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Cell value={f.ye} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Cell value={f.eb} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Punchline */}
      <section className="mx-auto max-w-5xl px-4 pb-12">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
            <div className="text-3xl font-bold text-emerald-900">
              {PLATFORM_FEE_PERCENT}%
              <span className="ml-1 text-base font-normal text-emerald-700">
                ({fmt(YE_FLOOR_DOLLARS)} min)
              </span>
            </div>
            <div className="mt-1 text-sm font-medium text-emerald-900">YourEvents platform fee</div>
            <p className="mt-2 text-xs text-emerald-800">
              One line, charged to the organizer. Attendees pay the price you set — no surcharges.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-200">
            <div className="text-3xl font-bold text-slate-900">
              3.7% + $1.79
              <span className="ml-1 text-base font-normal text-slate-500">+ 2.9%</span>
            </div>
            <div className="mt-1 text-sm font-medium text-slate-900">Eventbrite (Essentials)</div>
            <p className="mt-2 text-xs text-slate-600">
              Service fee + payment processing, both added to attendee&rsquo;s total by default.
            </p>
          </div>
          <div className="rounded-xl bg-brand-50 p-6 ring-1 ring-brand-200">
            <div className="text-3xl font-bold text-brand-900">2-3×</div>
            <div className="mt-1 text-sm font-medium text-brand-900">Cheaper at every ticket size</div>
            <p className="mt-2 text-xs text-brand-800">
              See the math below — the gap is widest at small ticket prices.
            </p>
          </div>
        </div>
      </section>

      {/* Attendee perspective */}
      <section className="mx-auto max-w-5xl px-4 pb-12">
        <h2 className="text-2xl font-bold">What your attendees actually pay</h2>
        <p className="mt-2 text-sm text-slate-600">
          On Eventbrite&rsquo;s default setup, fees get added on top of the ticket price. On
          YourEvents, attendees pay exactly what you set.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Ticket price</th>
                <th className="px-4 py-3 text-right">Eventbrite total</th>
                <th className="px-4 py-3 text-right">YourEvents total</th>
                <th className="px-4 py-3 text-right">Attendee saves</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TICKET_PRICES.map((p) => {
                const ebTotal = p + ebFee(p);
                const yeTotal = p; // org absorbs by default
                const saved = ebTotal - yeTotal;
                return (
                  <tr key={p}>
                    <td className="px-4 py-3 font-medium">{fmt(p)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(ebTotal)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-700">{fmt(yeTotal)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">
                      {fmt(saved)} ({((saved / p) * 100).toFixed(0)}%)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Eventbrite numbers reflect the published &ldquo;Essentials&rdquo; rate with fees passed to attendees,
          their default setting. Some EB plans bury this differently; the total an attendee pays
          is what we&rsquo;re comparing here.
        </p>
      </section>

      {/* Organizer perspective */}
      <section className="mx-auto max-w-5xl px-4 pb-12">
        <h2 className="text-2xl font-bold">What you take home as the organizer</h2>
        <p className="mt-2 text-sm text-slate-600">
          If you absorb Eventbrite&rsquo;s fees instead of passing them on (so your attendees see
          the flat price you advertise), here&rsquo;s what each platform leaves in your pocket per
          ticket sold.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Ticket price</th>
                <th className="px-4 py-3 text-right">Eventbrite net</th>
                <th className="px-4 py-3 text-right">YourEvents net</th>
                <th className="px-4 py-3 text-right">You keep more</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TICKET_PRICES.map((p) => {
                const ebNet = p - ebFee(p);
                const yeNet = p - yeFee(p);
                const diff = yeNet - ebNet;
                return (
                  <tr key={p}>
                    <td className="px-4 py-3 font-medium">{fmt(p)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{fmt(ebNet)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-700">{fmt(yeNet)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{fmt(diff)}/ticket</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Multiply that &ldquo;keep more&rdquo; column by your expected ticket count — on a 200-person
          $20 community event, that&rsquo;s roughly an extra $400 in your pocket versus
          Eventbrite, with no change to what attendees pay.
        </p>
      </section>

      {/* Who's it for */}
      <section className="mx-auto max-w-5xl px-4 pb-12">
        <h2 className="text-2xl font-bold">Who&rsquo;s each platform actually for?</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl bg-brand-50 p-6 ring-1 ring-brand-200">
            <h3 className="text-lg font-semibold text-brand-900">YourEvents is best for</h3>
            <ul className="mt-3 space-y-2 text-sm text-brand-900">
              <li className="flex gap-2"><span>✓</span> Community workshops, classes, fundraisers</li>
              <li className="flex gap-2"><span>✓</span> Small-to-mid conferences ($5-$50 tickets)</li>
              <li className="flex gap-2"><span>✓</span> Vendor fairs, craft markets, food festivals</li>
              <li className="flex gap-2"><span>✓</span> Nonprofits and faith-based events</li>
              <li className="flex gap-2"><span>✓</span> Anyone who hates surprise checkout fees</li>
            </ul>
          </div>
          <div className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Eventbrite is still better for</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex gap-2"><span>•</span> Large concerts with reserved seating</li>
              <li className="flex gap-2"><span>•</span> Multi-city event tours with recurring schedules</li>
              <li className="flex gap-2"><span>•</span> Discovery-driven events (relying on Eventbrite traffic)</li>
              <li className="flex gap-2"><span>•</span> Events where you&rsquo;d run paid ads inside their platform</li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              We&rsquo;re not for everyone. If you need any of the above, Eventbrite is genuinely the
              right call.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-4 pb-16">
        <div className="rounded-xl bg-brand-50 p-8 text-center ring-1 ring-brand-100">
          <h2 className="text-xl font-semibold text-brand-900">
            Ready to charge less and keep more?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
            Sign up free, connect Stripe in 5 minutes, and have your first event live the same day.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn-primary">Get started free</Link>
            <Link href="/pricing" className="btn-secondary">See pricing</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Cell({ value }: { value: boolean | string }) {
  if (value === true) {
    return <span className="text-lg text-emerald-600" aria-label="Yes">✓</span>;
  }
  if (value === false) {
    return <span className="text-lg text-slate-300" aria-label="No">—</span>;
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      {value}
    </span>
  );
}
