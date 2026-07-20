"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

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

/** Read/set the selected event tier from anywhere inside an EventTierProvider
 *  (e.g. the conference wizard reacts to free vs single_event for the day span). */
export function useEventTier() {
  return useContext(TierCtx);
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

export function EventTypePicker({ credits, returnTo = "/dashboard/events/new" }: { credits: number; returnTo?: string }) {
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
          className={`relative flex cursor-pointer flex-col rounded-xl border p-4 ${
            tier === "single_event"
              ? "border-brand-400 ring-2 ring-brand-500"
              : "border-amber-300 hover:border-amber-400"
          }`}
        >
          <span className="absolute -top-2.5 right-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
            Recommended
          </span>
          <span className="flex items-center gap-2">
            <input
              type="radio"
              name="tier"
              value="single_event"
              checked={tier === "single_event"}
              onChange={() => setTier("single_event")}
            />
            <span className="font-semibold">Premium Event</span>
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
                  onClick={() => postToCheckout(returnTo)}
                  className="btn-primary w-full"
                >
                  Buy Premium Event — $19
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
 * First ticket type's price. If the org hasn't completed Stripe Connect
 * onboarding and the organizer types a non-zero price, an inline amber heads-up
 * appears above the input. The server still hard-blocks the create (paid ticket
 * + no Connect → payouts_required) — this is a friendlier signal *before*
 * submit, with a direct link straight to the Connect section in Settings.
 */
export function TicketPriceField({ chargesEnabled }: { chargesEnabled: boolean }) {
  const [price, setPrice] = useState("0");
  const needsConnect = !chargesEnabled && Number(price) > 0;
  return (
    <div>
      {needsConnect && (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Heads up — payouts not set up.</strong> Charging for tickets requires Stripe Connect.
          You can save this as a draft, but you won&rsquo;t be able to publish or accept registrations until your
          org finishes Stripe setup.{" "}
          <a href="/dashboard/settings#payouts" className="font-medium underline hover:text-amber-950">
            Connect Stripe →
          </a>
        </div>
      )}
      <label className="label">Price (USD) — 0 for free</label>
      <input
        name="ticketPrice"
        type="number"
        step="0.01"
        min="0"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="input"
      />
    </div>
  );
}

/**
 * Shared "free events are capped at 50" upsell shown above any input that the
 * organizer might use to imply more than 50 registrations on a free event
 * (event capacity, first ticket's quantity). Wording for the "blank" vs
 * "above 50" cases is centralized here so the two surfaces can't drift.
 */
function FreeTierUpgradeWarning({ blank }: { blank: boolean }) {
  return (
    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <strong>Free events are capped at 50 registrations.</strong>{" "}
      {blank
        ? "Leaving this blank reads as unlimited, but free events still stop at 50."
        : "Values above 50 won't be honoured on a free event."}{" "}
      Switch to <strong>Premium Event</strong> in the Event type section above
      (one credit, $19) to lift the cap and unlock unlimited registrations,
      vendor applications, and custom branding.
    </div>
  );
}

/**
 * First ticket type's "quantity available". On a free event the whole event is
 * capped at 50 registrations (FREE_EVENT_REGISTRATION_LIMIT) regardless of
 * what's set here — so on free we warn instead of clamp, matching the
 * CapacityField UX. Quantity 0 is never allowed (min=1) since a 0-quantity
 * ticket type is meaningless; blank is treated as "unlimited" (warns on free).
 */
export function TicketQuantityField() {
  const { tier } = useContext(TierCtx);
  const free = tier === "free";
  const [qty, setQty] = useState("50");
  const blank = qty.trim() === "";
  const overCap = free && (blank || Number(qty) > 50);

  return (
    <div>
      {overCap && <FreeTierUpgradeWarning blank={blank} />}
      <label className="label">
        Quantity available {free ? "(max 50 on free events)" : "(blank = unlimited)"}
      </label>
      <input
        name="ticketQuantity"
        type="number"
        min="1"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="input"
        placeholder={free ? "50" : "100"}
      />
    </div>
  );
}

/**
 * Per-event capacity. Free events are capped at 50 registrations total
 * (FREE_EVENT_REGISTRATION_LIMIT, enforced server-side at registration). If the
 * organizer types a capacity above 50 or leaves it blank/zero (which they
 * probably read as "unlimited") on a free event, show an amber heads-up
 * suggesting they switch to Single Event so the cap actually disappears.
 *
 * Label flips between "(max 50 on free events)" and "(blank = unlimited)" so
 * the field is honest about which regime they're in.
 */
export function CapacityField() {
  const { tier } = useContext(TierCtx);
  const free = tier === "free";
  const [cap, setCap] = useState("");
  const blankOrZero = cap.trim() === "" || cap.trim() === "0";
  const overCap = free && (blankOrZero || Number(cap) > 50);
  return (
    <div>
      {overCap && <FreeTierUpgradeWarning blank={blankOrZero} />}
      <label className="label">
        Capacity {free ? "(max 50 on free events)" : "(blank = unlimited)"}
      </label>
      <input
        name="capacity"
        type="number"
        min="1"
        value={cap}
        onChange={(e) => setCap(e.target.value)}
        className="input"
        placeholder={free ? "50" : "500"}
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
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Premium feature</span>
            )}
            <br />
            <span className="text-xs text-slate-500">
              Adds a &ldquo;Become a Vendor&rdquo; button to the event page. Vendors submit applications you approve before payment.
              {!premium && " Choose Premium Event above to enable it."}
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
