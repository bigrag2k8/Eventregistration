"use client";

import { useState } from "react";
import { submitReviewAction } from "@/app/review/[token]/actions";

/**
 * Interactive star picker + comment box for the post-event review page. The
 * rating starts pre-selected from the star the attendee tapped in the email
 * (or from an existing review when editing). Submits to submitReviewAction,
 * authenticated by the signed token (hidden field) — never a session.
 *
 * Sub-ratings (venue / value / organization) are optional one-tap rows; they
 * feed the organizer's dashboard averages and are never required.
 */

function StarRow({
  value,
  onChange,
  size = 34,
}: {
  value: number;
  onChange: (n: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex gap-1.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          aria-pressed={value === n}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n ? 0 : n)}
          className="cursor-pointer bg-transparent p-0 leading-none"
          style={{ fontSize: `${size}px`, color: n <= shown ? "#EF9F27" : "#cbd5e1" }}
        >
          {n <= shown ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}

export function ReviewForm({
  token,
  initialRating,
  initialComment,
  initialSub,
  editing,
  brand,
}: {
  token: string;
  initialRating: number;
  initialComment: string;
  initialSub?: { venue: number; value: number; organization: number };
  editing: boolean;
  brand: string;
}) {
  const [rating, setRating] = useState(initialRating);
  const [venue, setVenue] = useState(initialSub?.venue ?? 0);
  const [value, setValue] = useState(initialSub?.value ?? 0);
  const [organization, setOrganization] = useState(initialSub?.organization ?? 0);

  return (
    <form action={submitReviewAction}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={rating} />
      <input type="hidden" name="ratingVenue" value={venue || ""} />
      <input type="hidden" name="ratingValue" value={value || ""} />
      <input type="hidden" name="ratingOrganization" value={organization || ""} />

      <div className="mb-1 text-sm text-slate-600">Your rating</div>
      <div className="mb-4">
        <StarRow value={rating} onChange={setRating} />
      </div>

      <div className="mb-4 space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Optional — rate the details
        </div>
        {(
          [
            ["Venue", venue, setVenue],
            ["Value for money", value, setValue],
            ["Organization", organization, setOrganization],
          ] as const
        ).map(([label, val, set]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">{label}</span>
            <StarRow value={val} onChange={set} size={20} />
          </div>
        ))}
      </div>

      <div className="mb-1 text-sm text-slate-600">
        Add a comment <span className="text-slate-400">(optional)</span>
      </div>
      <textarea
        name="comment"
        rows={3}
        maxLength={2000}
        defaultValue={initialComment}
        placeholder="What did you like? Anything the organizer could improve?"
        className="input w-full resize-none"
      />

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={rating < 1}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: brand }}
        >
          {editing ? "Update review" : "Post review"}
        </button>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          🔒 No account or password needed
        </span>
      </div>
    </form>
  );
}
