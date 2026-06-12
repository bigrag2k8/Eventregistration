"use client";

import { useState } from "react";

/**
 * Presale (early-bird) discount controls. The checkbox reveals the percent and
 * expiry inputs; when unchecked, those fields aren't submitted so the action
 * clears the presale on the event.
 */
export function PresaleFields({
  defaultEnabled,
  defaultPercent,
  defaultEndsAt,
  disabled = false,
}: {
  defaultEnabled: boolean;
  defaultPercent: string;
  defaultEndsAt: string;
  /** True when the event has no paid tickets — presale would do nothing. */
  disabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [percent, setPercent] = useState(defaultPercent);

  return (
    <div className={disabled ? "opacity-50" : ""}>
      <label className={`flex items-start gap-2 text-sm ${disabled ? "cursor-not-allowed" : ""}`}>
        <input
          type="checkbox"
          name="presaleEnabled"
          value="1"
          checked={!disabled && enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={disabled}
          className="mt-1"
        />
        <span>
          <span className="font-medium">Offer a presale (early-bird) discount</span>
          <br />
          <span className="text-xs text-slate-500">
            {disabled
              ? "Presale discounts apply to paid tickets — add a paid ticket type first."
              : "Every ticket sells at a reduced price until the date you set — then prices revert to regular automatically."}
          </span>
        </span>
      </label>

      {!disabled && enabled && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Discount</label>
            <div className="relative">
              <input
                name="presalePercent"
                type="number"
                min={1}
                max={100}
                step="0.5"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                required
                placeholder="15"
                className="input pr-8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
            </div>
          </div>
          <div>
            <label className="label">Presale ends</label>
            <input
              name="presaleEndsAt"
              type="datetime-local"
              defaultValue={defaultEndsAt}
              required
              className="input"
            />
            <p className="mt-1 text-xs text-slate-500">In the event&rsquo;s timezone. After this, pricing returns to normal.</p>
          </div>
        </div>
      )}
    </div>
  );
}
