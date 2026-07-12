import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
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
    select: { slug: true, name: true, reviewCount: true, ratingAvg: true },
  });
  if (!org) redirect("/dashboard");

  const reviews = await prisma.review.findMany({
    where: { organizationId: session.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { event: { select: { name: true } } },
  });

  const isSuperadmin = session.role === "SUPERADMIN";
  const ratingAvg = org.ratingAvg != null ? Number(org.ratingAvg) : null;

  return (
    <main>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-bold text-brand-700">Your Events App</Link>
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
            {org.reviewCount > 0 && ratingAvg != null && (
              <div className="text-right">
                <div className="text-2xl font-semibold">★ {ratingAvg.toFixed(1)}</div>
                <div className="text-xs text-slate-500">{org.reviewCount} review{org.reviewCount === 1 ? "" : "s"}</div>
              </div>
            )}
          </div>
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
