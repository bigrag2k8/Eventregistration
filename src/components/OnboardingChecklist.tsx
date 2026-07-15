import Link from "next/link";

/**
 * Getting-started checklist shown on the dashboard until the organizer
 * publishes their first event (the "graduation" signal — after that the host
 * page stops rendering this). Purely presentational; each step's done-ness is
 * computed by the caller from the Organization row + event counts.
 */
interface Props {
  brandDone: boolean;
  payoutsDone: boolean;
  hasEvent: boolean;
  publishedDone: boolean;
}

interface Step {
  key: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
  done: boolean;
}

export function OnboardingChecklist({ brandDone, payoutsDone, hasEvent, publishedDone }: Props) {
  const steps: Step[] = [
    {
      key: "brand",
      title: "Add your brand",
      desc: "Upload your logo and pick your color — your events carry your brand, not ours.",
      href: "/dashboard/settings",
      cta: "Go to settings",
      done: brandDone,
    },
    {
      key: "payouts",
      title: "Turn on payouts",
      desc: "Connect Stripe so you can sell paid tickets and get paid. Skip if your events are free.",
      href: "/dashboard/settings#payouts",
      cta: "Set up payouts",
      done: payoutsDone,
    },
    {
      key: "event",
      title: "Create your first event",
      desc: "A quick step-by-step wizard walks you through it.",
      href: "/dashboard/events/new",
      cta: "Create event",
      done: hasEvent,
    },
    {
      key: "publish",
      title: "Publish & share",
      desc: "Make it live and share the link to start taking registrations.",
      href: "/dashboard/events/new",
      cta: "Publish an event",
      done: publishedDone,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  // The first not-yet-done step gets the primary CTA; later ones are secondary.
  const firstOpen = steps.findIndex((s) => !s.done);

  return (
    <section className="mt-6 rounded-xl border border-brand-200 bg-brand-50/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Get set up</h2>
          <p className="text-sm text-slate-500">A few steps to launch your first event.</p>
        </div>
        <div className="text-sm font-medium text-slate-600">{doneCount} of {steps.length} complete</div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => {
          const isNext = i === firstOpen;
          return (
            <li
              key={s.key}
              className={`flex items-start gap-3 rounded-lg p-3 ${
                isNext ? "bg-white ring-1 ring-brand-200" : ""
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  s.done ? "bg-emerald-500 text-white" : isNext ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"
                }`}
                aria-hidden
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${s.done ? "text-slate-400 line-through" : "text-slate-900"}`}>
                  {s.title}
                </div>
                {!s.done && <div className="mt-0.5 text-xs text-slate-500">{s.desc}</div>}
              </div>
              {!s.done && (
                <Link href={s.href} className={isNext ? "btn-primary shrink-0 whitespace-nowrap" : "btn-secondary shrink-0 whitespace-nowrap"}>
                  {s.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
