import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { platformMeanRating, computeTrustTier, TIER_LABEL } from "@/server/reviews";
import { replyToReviewAction, setReviewStatusAction } from "./actions";

export const dynamic = "force-dynamic";

function Stars({ n }: { n: number }) {
  return (
    <span style={{ color: "#EF9F27", fontSize: "14px", letterSpacing: "1px" }} aria-label={`${n} of 5 stars`}>
      {"★".repeat(n)}
      <span style={{ color: "#cbd5e1" }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

export default async function DashboardReviewsPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);

  const org = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: {
      slug: true, name: true, reviewCount: true, ratingAvg: true,
      reputationScore: true, fastPayoutsEnabled: true,
    },
  });
  if (!org) redirect("/dashboard");

  const [reviews, invitedCount, subAgg, platformMean] = await Promise.all([
    prisma.review.findMany({
      where: { organizationId: session.orgId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { event: { select: { name: true } } },
    }),
    prisma.registration.count({
      where: { event: { organizationId: session.orgId }, reviewInvitedAt: { not: null } },
    }),
    prisma.review.aggregate({
      where: { organizationId: session.orgId, status: "PUBLISHED" },
      _avg: { ratingVenue: true, ratingValue: true, ratingOrganization: true },
    }),
    platformMeanRating(),
  ]);

  const isSuperadmin = session.role === "SUPERADMIN";
  const ratingAvg = org.ratingAvg != null ? Number(org.ratingAvg) : null;
  const score = org.reputationScore != null ? Number(org.reputationScore) : null;
  const tier = computeTrustTier(org);
  const responseRate = invitedCount > 0 ? Math.round((org.reviewCount / invitedCount) * 100) : null;

  // 6-month rating trend, bucketed in JS (newest reviews are already loaded).
  const trend: Array<{ label: string; avg: number; n: number }> = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = reviews.filter((r) => {
      const c = r.createdAt;
      return `${c.getFullYear()}-${c.getMonth()}` === key && r.status === "PUBLISHED";
    });
    if (bucket.length > 0) {
      trend.push({
        label: d.toLocaleString("en-US", { month: "short" }),
        avg: Math.round((bucket.reduce((a, r) => a + r.rating, 0) / bucket.length) * 10) / 10,
        n: bucket.length,
      });
    }
  }

  const subs = [
    ["Venue", subAgg._avg.ratingVenue],
    ["Value", subAgg._avg.ratingValue],
    ["Organization", subAgg._avg.ratingOrganization],
  ].filter(([, v]) => v != null) as Array<[string, number]>;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700"><img src="/logo.png" alt="Your Events App" className="h-9 w-auto" /></Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold">Reviews</span>
          </div>
          <Link href={`/o/${org.slug}`} target="_blank" className="text-sm text-brand-700 hover:underline">
            View public page ↗
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {searchParams?.saved && (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">Saved.</div>
        )}
        {searchParams?.error && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Something went wrong — please try again.
          </div>
        )}

        <section className="card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Attendee reviews</h2>
              <p className="mt-1 text-sm text-slate-500">
                Left by verified attendees after your events. You can reply, but reviews can&rsquo;t be edited or deleted.
              </p>
            </div>
            {TIER_LABEL[tier] && (
              <span className="whitespace-nowrap rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                {tier === "TOP_RATED" ? "🏆" : "✓"} {TIER_LABEL[tier]}
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Your rating</div>
              <div className="mt-1 text-xl font-semibold">
                {ratingAvg != null ? `★ ${ratingAvg.toFixed(1)}` : "—"}
              </div>
              <div className="text-xs text-slate-400">{org.reviewCount} review{org.reviewCount === 1 ? "" : "s"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Platform average</div>
              <div className="mt-1 text-xl font-semibold">★ {platformMean.toFixed(1)}</div>
              <div className="text-xs text-slate-400">
                {ratingAvg != null ? (ratingAvg >= platformMean ? "you're above it" : "room to grow") : "all organizers"}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Response rate</div>
              <div className="mt-1 text-xl font-semibold">{responseRate != null ? `${responseRate}%` : "—"}</div>
              <div className="text-xs text-slate-400">{invitedCount} invited</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Reputation score</div>
              <div className="mt-1 text-xl font-semibold">{score != null ? Math.round(score) : "—"}<span className="text-sm font-normal text-slate-400">/100</span></div>
              <div className="text-xs text-slate-400">stars + track record</div>
            </div>
          </div>

          {(subs.length > 0 || trend.length > 1) && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {subs.length > 0 && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Detail ratings</div>
                  <div className="mt-2 space-y-1.5">
                    {subs.map(([label, v]) => (
                      <div key={label} className="flex items-center gap-2 text-sm">
                        <span className="w-28 text-slate-600">{label}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: `${(v / 5) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right font-medium">{v.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {trend.length > 1 && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Rating trend</div>
                  <div className="mt-2 flex items-end gap-2">
                    {trend.map((t) => (
                      <div key={t.label} className="flex flex-col items-center gap-1">
                        <div className="w-8 rounded-t bg-amber-400" style={{ height: `${(t.avg / 5) * 48}px` }} title={`${t.avg} (${t.n})`} />
                        <span className="text-[10px] text-slate-400">{t.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {reviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <div className="text-3xl">🌟</div>
            <p className="mt-3 font-medium text-slate-700">No reviews yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              After an event ends, attendees are emailed a one-tap rating invite. Their reviews show up here.
            </p>
          </div>
        ) : (
          reviews.map((r) => (
            <section key={r.id} className={`card ${r.status === "HIDDEN" ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{r.authorName}</span>
                <Stars n={r.rating} />
                {r.attended && <span className="text-xs text-emerald-600">✓ Attended</span>}
                {r.status === "HIDDEN" && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">Hidden</span>
                )}
                <span className="ml-auto text-xs text-slate-400">{r.event.name}</span>
              </div>
              {r.comment && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{r.comment}</p>}

              <form action={replyToReviewAction} className="mt-3 border-t border-slate-100 pt-3">
                <input type="hidden" name="reviewId" value={r.id} />
                <label className="label">{r.organizerReply ? "Your reply" : "Reply publicly"}</label>
                <textarea
                  name="reply"
                  rows={2}
                  maxLength={2000}
                  defaultValue={r.organizerReply ?? ""}
                  placeholder="Thanks for coming out! …"
                  className="input w-full resize-none"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button type="submit" className="btn-primary text-sm">{r.organizerReply ? "Update reply" : "Post reply"}</button>
                  {isSuperadmin && (
                    <button
                      type="submit"
                      formAction={setReviewStatusAction}
                      name="op"
                      value={r.status === "HIDDEN" ? "unhide" : "hide"}
                      className="text-sm text-slate-500 hover:text-slate-800"
                    >
                      {r.status === "HIDDEN" ? "Restore" : "Hide (moderation)"}
                    </button>
                  )}
                </div>
              </form>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
