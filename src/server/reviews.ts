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
 * the average. Also refreshes the fused reputation score.
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
  await recomputeOrgReputation(organizationId);
}

/**
 * Recompute one EVENT's cached rating (PUBLISHED reviews of that event only) —
 * shown as stars on past-event cards. Call alongside recomputeOrgRating when a
 * review is created/hidden.
 */
export async function recomputeEventRating(eventId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { eventId, status: "PUBLISHED" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const count = agg._count._all;
  const avg = count > 0 && agg._avg.rating != null ? Math.round(agg._avg.rating * 100) / 100 : null;
  await prisma.event.update({ where: { id: eventId }, data: { reviewCount: count, ratingAvg: avg } });
}

// ── Reputation score (Phase 2) ───────────────────────────────────────────────
// A fused 0–100 score blending what attendees SAY (stars) with what the org
// actually DID (operational record we hold ground truth on). Design:
//
//   Star component (up to 70 pts):
//     Bayesian smoothing — weighted = (m·C + Σ wᵢ·rᵢ) / (m + Σ wᵢ) — with a
//     prior of m=10 "virtual reviews" at the platform-wide mean C, so three
//     5-star reviews can't outrank an established 4.8 with hundreds. Each
//     review's weight wᵢ decays linearly with age to a 0.3 floor over 2 years
//     (recent behavior counts most; history never fully vanishes).
//   Operational component (up to 30 pts):
//     15 pts × completion rate (ended, non-cancelled events / ended events;
//            orgs with no ended events get full credit — they haven't failed),
//     10 pts if no LOST disputes,
//      5 pts if graduated to fast payouts (5 clean events — the trust milestone).
//
// The score is CACHED on Organization.reputationScore; recompute on review
// changes + periodically in the worker (disputes/cancellations move it too).

const BAYES_PRIOR_WEIGHT = 10;
const DEFAULT_PLATFORM_MEAN = 4.2;
const RECENCY_FLOOR = 0.3;
const RECENCY_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000; // 2 years

/** Platform-wide mean of PUBLISHED review ratings (prior for smoothing). */
export async function platformMeanRating(): Promise<number> {
  const agg = await prisma.review.aggregate({ where: { status: "PUBLISHED" }, _avg: { rating: true } });
  return agg._avg.rating ?? DEFAULT_PLATFORM_MEAN;
}

export async function recomputeOrgReputation(organizationId: string): Promise<void> {
  const now = Date.now();
  const [reviews, endedEvents, cancelledEnded, lostDisputes, org, platformMean] = await Promise.all([
    prisma.review.findMany({
      where: { organizationId, status: "PUBLISHED" },
      select: { rating: true, createdAt: true },
    }),
    prisma.event.count({
      where: { organizationId, deletedAt: null, endAt: { lt: new Date(now) }, status: { in: ["PUBLISHED", "CANCELLED"] } },
    }),
    prisma.event.count({
      where: { organizationId, deletedAt: null, endAt: { lt: new Date(now) }, status: "CANCELLED" },
    }),
    prisma.dispute.count({ where: { organizationId, status: "lost" } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { fastPayoutsEnabled: true } }),
    platformMeanRating(),
  ]);
  if (!org) return;

  // Star component — recency-weighted Bayesian smoothing.
  let weightSum = 0;
  let weightedRatingSum = 0;
  for (const r of reviews) {
    const age = now - r.createdAt.getTime();
    const w = Math.max(RECENCY_FLOOR, 1 - age / RECENCY_HORIZON_MS);
    weightSum += w;
    weightedRatingSum += w * r.rating;
  }
  const smoothed = (BAYES_PRIOR_WEIGHT * platformMean + weightedRatingSum) / (BAYES_PRIOR_WEIGHT + weightSum);
  const starPts = (smoothed / 5) * 70;

  // Operational component.
  const completionRate = endedEvents > 0 ? (endedEvents - cancelledEnded) / endedEvents : 1;
  const opsPts = completionRate * 15 + (lostDisputes === 0 ? 10 : 0) + (org.fastPayoutsEnabled ? 5 : 0);

  const score = Math.round((starPts + opsPts) * 100) / 100;
  await prisma.organization.update({ where: { id: organizationId }, data: { reputationScore: score } });
}

// ── Trust tiers ──────────────────────────────────────────────────────────────
// The public badge ladder, derived (not stored) from cached fields so it's
// always consistent with the score. Thresholds are deliberately simple and
// documented — organizers should be able to understand what to chase:
//   NEW        — default; no badge shown, page renders a "New organizer" state
//   VERIFIED   — graduated payouts (5 clean events, no lost disputes)
//   TRUSTED    — VERIFIED + 10 reviews + score ≥ 70
//   TOP_RATED  — VERIFIED + 25 reviews + score ≥ 85 + 4.5★ average

export type TrustTier = "NEW" | "VERIFIED" | "TRUSTED" | "TOP_RATED";

export function computeTrustTier(org: {
  fastPayoutsEnabled: boolean;
  reviewCount: number;
  ratingAvg?: unknown;                    // Prisma Decimal | number | null
  reputationScore?: unknown;
}): TrustTier {
  const score = org.reputationScore != null ? Number(org.reputationScore) : 0;
  const avg = org.ratingAvg != null ? Number(org.ratingAvg) : 0;
  if (!org.fastPayoutsEnabled) return "NEW";
  if (org.reviewCount >= 25 && score >= 85 && avg >= 4.5) return "TOP_RATED";
  if (org.reviewCount >= 10 && score >= 70) return "TRUSTED";
  return "VERIFIED";
}

export const TIER_LABEL: Record<TrustTier, string | null> = {
  NEW: null,
  VERIFIED: "Verified organizer",
  TRUSTED: "Trusted organizer",
  TOP_RATED: "Top-rated organizer",
};
