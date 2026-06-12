"use client";

import { useState } from "react";

function fmt(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

/**
 * Price + Quantity inputs for the "add ticket type" form, plus a live presale-
 * price preview (regular price minus the event's early-bird %) shown only when
 * a presale discount is configured. Inputs carry names so they submit normally.
 */
export function AddTicketFields({ presalePercent }: { presalePercent: number | null }) {
  const [price, setPrice] = useState("0");
  const p = parseFloat(price || "0");
  const cents = Number.isFinite(p) && p > 0 ? Math.round(p * 100) : 0;
  const presaleCents = presalePercent != null ? Math.round(cents * (1 - presalePercent / 100)) : null;

  return (
    <>
      <div>
        <label className="label">Price ($)</label>
        <input
          name="price"
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="input"
        />
      </div>
      <div>
        <label className="label">Quantity</label>
        <input name="quantity" type="number" min="1" className="input" placeholder="∞" />
      </div>
      {presalePercent != null && (
        <div>
          <label className="label">Presale price</label>
          <div className="input flex items-center bg-emerald-50 font-medium text-emerald-800 ring-emerald-200">
            {cents === 0 ? "Free" : presaleCents != null ? fmt(presaleCents) : "—"}
          </div>
          <p className="mt-1 text-[11px] text-emerald-600">{presalePercent}% early-bird</p>
        </div>
      )}
    </>
  );
}
