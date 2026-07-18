import Link from "next/link";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { requireRolePage } from "@/lib/auth";
import { requirePlanSelected } from "@/lib/plan-gate";
import { CopyButton } from "@/components/CopyButton";

export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.yourevents.app").replace(/\/+$/, "");

export default async function ReferPage() {
  const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
  if (!session.orgId) redirect("/dashboard");
  await requirePlanSelected(session);
  const orgId = session.orgId;

  let org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { referralCode: true },
  });
  // Backstop: an org created before this feature (or one whose backfill missed)
  // gets a code on first visit.
  if (org && !org.referralCode) {
    const code = crypto.randomBytes(6).toString("hex").slice(0, 10);
    org = await prisma.organization.update({ where: { id: orgId }, data: { referralCode: code }, select: { referralCode: true } });
  }

  const now = new Date();
  const [referred, rewards] = await Promise.all([
    prisma.organization.findMany({
      where: { referredByOrgId: orgId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { name: true, createdAt: true, referralRewardedAt: true },
    }),
    prisma.referralReward.findMany({
      where: { referrerOrgId: orgId },
      orderBy: { earnedAt: "desc" },
    }),
  ]);

  const link = `${SITE}/signup?ref=${org?.referralCode ?? ""}`;
  const available = rewards.filter((r) => !r.redeemedAt && r.expiresAt > now);
  const redeemed = rewards.filter((r) => r.redeemedAt);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Refer an organizer, earn 50% off</h1>
        <p className="mt-1 text-sm text-slate-500">
          Invite another organizer with your link. When they run their first paid event, you get{" "}
          <strong>50% off your next single-event credit</strong>. Coupons last 3 months.
        </p>
      </div>

      {/* Share link */}
      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <label className="label">Your referral link</label>
        <div className="mt-1 flex items-center gap-2">
          <input readOnly value={link} className="input flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <CopyButton text={link} label="Copy link" />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Anyone who signs up through this link is credited to you automatically.
        </p>
      </section>

      {/* Coupons */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Available coupons" value={String(available.length)} hint="50% off, ready to use" />
        <Stat label="Organizers referred" value={String(referred.length)} hint="signed up via your link" />
        <Stat label="Rewards earned" value={String(rewards.length)} hint="all-time" />
      </div>

      {available.length > 0 && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
          You have <strong>{available.length}</strong> coupon{available.length === 1 ? "" : "s"} for 50% off a single-event
          credit. {available.length === 1 ? "It's" : "They're"} applied automatically at checkout — next one expires{" "}
          {available[available.length - 1].expiresAt.toLocaleDateString()}.{" "}
          <Link href="/dashboard/billing" className="font-medium underline">Buy a credit →</Link>
        </div>
      )}

      {/* Referred organizers */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Organizers you referred</h2>
        {referred.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            No referrals yet — share your link to get started.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Organizer</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {referred.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-slate-600">{r.createdAt.toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {r.referralRewardedAt ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Reward earned</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Signed up · no paid event yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {redeemed.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">
          You&rsquo;ve redeemed {redeemed.length} coupon{redeemed.length === 1 ? "" : "s"}.
        </p>
      )}

      <p className="mt-6 text-xs text-slate-400">
        <Link href="/dashboard" className="text-brand-700 hover:underline">◀ Back to dashboard</Link>
      </p>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-400">{hint}</div>
    </div>
  );
}
