import { prisma } from "@/lib/db";

/**
 * Public display name for a review author: first name + last initial, e.g.
 * "Denise R." — so a review never exposes an attendee's full surname. Falls
 * back to just the first name, then "Attendee".
 */
export function reviewAuthorName(first?: string | null, last?: string | null): string {
  const f = (first ?? "").trim();
  const li = (last ?? "").trim()[0];
  if (f && li) return `${f} ${li.toUpperCase()}.`;
  return f || "Attendee";
}

/**
 * Recompute an organization's cached review aggregates from its PUBLISHED
 * reviews and persist them onto the Organization row. Called after any change
 * that affects the public rating (a new review, a hide/unhide) so the public
 * /o/[slug] page can read reviewCount / ratingAvg directly without an aggregate
 * query on every hit. HIDDEN and FLAGGED reviews are excluded from the count and
 * the average.
 */
export async function recomputeOrgRating(organizationId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { organizationId, status: "PUBLISHED" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const count = agg._count._all;
  // Round to 2 dp to match the Decimal(3,2) column; null when there are none so
  // the page can render a "New organizer" state instead of "0.0".
  const avg = count > 0 && agg._avg.rating != null ? Math.round(agg._avg.rating * 100) / 100 : null;
  await prisma.organization.update({
    where: { id: organizationId },
    data: { reviewCount: count, ratingAvg: avg },
  });
}
