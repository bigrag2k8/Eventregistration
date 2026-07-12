"use client";

import { useState } from "react";
import { submitReviewAction } from "@/app/review/[token]/actions";

/**
 * Interactive star picker + comment box for the post-event review page. The
 * rating starts pre-selected from the star the attendee tapped in the email
 * (or from an existing review when editing). Submits to submitReviewAction,
 * authenticated by the signed token (hidden field) — never a session.
 */
export function ReviewForm({
  token,
  initialRating,
  initialComment,
  editing,
  brand,
}: {
  token: string;
  initialRating: number;
  initialComment: string;
  editing: boolean;
  brand: string;
}) {
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;

  return (
    <form action={submitReviewAction}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={rating} />

      <div className="mb-1 text-sm text-slate-600">Your rating</div>
      <div className="mb-4 flex gap-1.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={rating === n}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            className="cursor-pointer bg-transparent p-0 leading-none"
            style={{ fontSize: "34px", color: n <= shown ? "#EF9F27" : "#cbd5e1" }}
          >
            {n <= shown ? "★" : "☆"}
          </button>
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
