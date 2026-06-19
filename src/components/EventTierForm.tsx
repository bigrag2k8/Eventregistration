"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Tier = "free" | "single_event";

const TierCtx = createContext<{ tier: Tier; setTier: (t: Tier) => void }>({
  tier: "free",
  setTier: () => {},
});

/**
 * Shares the selected event tier (free vs single_event) across the new-event
 * form so the tier picker, the first ticket's quantity, and the vendor settings
 * can react to each other even though they live in different form sections.
 *
 * `initialTier` lets the host page pre-select Single Event after a credit
 * purchase (the success redirect returns with ?bought=SINGLE_EVENT).
 */
export function EventTierProvider({ children, initialTier = "free" }: { children: ReactNode; initialTier?: Tier }) {
  const [tier, setTier] = useState<Tier>(initialTier);
  return <TierCtx.Provider value={{ tier, setTier }}>{children}</TierCtx.Provider>;
}

/**
 * Build and submit a one-off POST form to the billing checkout endpoint. Used
 * by the in-card "Buy single event" button: the picker lives inside the big
 * create-event form, so we can't nest a second <form>. Sending it manually
 * works regardless of where the button sits.
 */
function postToCheckout(returnTo: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/billing/checkout";
  const planKey = document.createElement("input");
  planKey.name = "planKey";
  planKey.value = "SINGLE_EVENT";
  const back = document.createElement("input");
  back.name = "returnTo";
  back.value = returnTo;
  form.appendChild(planKey);
  form.appendChild(back);
  document.body.appendChild(form);
  form.submit();
}

export function EventTypePicker({ credits }: { credits: number }) {
  const { tier, setTier } = useContext(TierCtx);
  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Event type</h2>
      <p className="mt-1 text-sm text-slate-500">
        Pick how this event is powered. You can also upgrade a free event later.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label
          className={`flex cursor-pointer flex-col rounded-xl border p-4 ${
            tier === "free" ? "border-brand-400 ring-2 ring-brand-500" : "border-slate-200 hover:border-brand-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <input type="radio" name="tier" value="free" checked={tier === "free"} onChange={() => setTier("free")} />
            <span className="font-semibold">Free event</span>
          </span>
          <span className="mt-1 text-xs text-slate-500">
            Up to 50 registrations, 1 email broadcast, basic features. No charge.
          </span>
        </label>

        <label
          className={`flex cursor-pointer flex-col rounded-xl border p-4 ${
            tier === "single_event"
              ? "border-brand-400 ring-2 ring-brand-500"
              : "border-slate-200 hover:border-brand-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <input
              type="radio"
              name="tier"
              value="single_event"
              checked={tier === "single_event"}
              onChange={() => setTier("single_event")}
            />
            <span className="font-semibold">Single Event</span>
          </span>
          <span className="mt-1 text-xs text-slate-500">
            Unlimited registrations, vendor applications, custom branding, 5 email broadcasts. Uses 1 credit.
          </span>
          {credits > 0 ? (
            <span className="mt-2 text-xs text-emerald-700">
              You have {credits} credit{credits === 1 ? "" : "s"} — this event uses 1.
            </span>
          ) : (
            tier === "single_event" && (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => postToCheckout("/dashboard/events/new")}
                  className="btn-primary w-full"
                >
                  Buy single event — $19
                </button>
                <p className="text-xs text-slate-500">
                  You&rsquo;ll be sent to checkout, then back here with the credit applied so you can finish creating this event.
                </p>
              </div>
            )
          )}
        </label>
      </div>
    </section>
  );
}

/**
 * First ticket type's "quantity available". On a FREE event the whole event is
 * capped at 50 registrations, so cap this ticket's inventory to match and
 * default it to 50. Premium events allow blank (unlimited).
 */
export function TicketQuantityField() {
  const { tier } = useContext(TierCtx);
  const free = tier === "free";
  const [qty, setQty] = useState("50");

  useEffect(() => {
    // Switching to free: clamp to the 50-registration cap.
    if (free) setQty((q) => (q === "" || Number(q) > 50 ? "50" : q));
  }, [free]);

  return (
    <div>
      <label className="label">
        Quantity available {free ? "(max 50 on free events)" : "(blank = unlimited)"}
      </label>
      <input
        name="ticketQuantity"
        type="number"
        min="1"
        max={free ? 50 : undefined}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="input"
        placeholder={free ? "50" : "100"}
      />
    </div>
  );
}

/**
 * Vendor settings (toggle + notes + booth price). Vendor flow is a premium
 * feature, so these are disabled/greyed on a free event.
 */
export function VendorSettingsFields() {
  const { tier } = useContext(TierCtx);
  const premium = tier === "single_event";
  return (
    <>
      <div className="sm:col-span-2">
        <label className={`flex items-start gap-2 text-sm ${premium ? "" : "opacity-60"}`}>
          <input
            type="checkbox"
            name="vendorRegistrationEnabled"
            value="1"
            disabled={!premium}
            className="mt-1"
          />
          <span>
            <span className="font-medium">Accept vendor applications</span>
            {!premium && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Single Event feature</span>
            )}
            <br />
            <span className="text-xs text-slate-500">
              Adds a &ldquo;Become a Vendor&rdquo; button to the event page. Vendors submit applications you approve before payment.
              {!premium && " Choose Single Event above to enable it."}
            </span>
          </span>
        </label>
      </div>
      <div className="sm:col-span-2">
        <label className={`label ${premium ? "" : "opacity-60"}`}>Vendor application notes (shown on the vendor form)</label>
        <textarea
          name="vendorApplicationNotes"
          rows={3}
          disabled={!premium}
          className={`input ${premium ? "" : "opacity-60"}`}
          placeholder="e.g. Booths are 10x10 with table and chairs. Load-in 7am day of event."
        />
      </div>
      <div>
        <label className={`label ${premium ? "" : "opacity-60"}`}>Default vendor booth price (USD)</label>
        <input
          name="defaultVendorPrice"
          type="number"
          step="0.01"
          min="0"
          defaultValue="0"
          disabled={!premium}
          className={`input ${premium ? "" : "opacity-60"}`}
          placeholder="500.00"
        />
        <p className="mt-1 text-xs text-slate-500">Pre-fills the quote when approving a vendor. You can override per vendor.</p>
      </div>
    </>
  );
}
