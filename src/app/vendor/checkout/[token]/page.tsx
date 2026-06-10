import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { finalizeVendor } from "@/server/vendors";
import { VendorCheckoutForm } from "@/components/VendorCheckoutForm";

export const dynamic = "force-dynamic";

interface Props {
  params: { token: string };
  searchParams: { session_id?: string; paid?: string; cancelled?: string };
}

export default async function VendorCheckoutPage({ params, searchParams }: Props) {
  let app = await prisma.vendorApplication.findUnique({
    where: { paymentLinkToken: params.token },
    include: { event: true },
  });
  if (!app) return notFound();

  // If Stripe just redirected the user back, verify the payment NOW so we
  // don't have to wait for the async webhook. The webhook will still fire
  // and finalize idempotently — this just makes the UX instant.
  if (searchParams.session_id && app.status !== "PAID" && stripeConfigured) {
    try {
      const session = await stripe.checkout.sessions.retrieve(searchParams.session_id);
      const sessionVendorId = (session.metadata as any)?.vendorApplicationId;
      if (sessionVendorId === app.id && session.payment_status === "paid") {
        await finalizeVendor(app.id);
        // Re-read so the success branch below renders
        const refreshed = await prisma.vendorApplication.findUnique({
          where: { paymentLinkToken: params.token },
          include: { event: true },
        });
        if (refreshed) app = refreshed;
      }
    } catch (e: any) {
      // Log the FULL error so we can actually debug. e.message is often empty
      // on Prisma errors — the useful info is in e.code + e.stack.
      console.error("[vendor/checkout success] session verify failed:", {
        message: e?.message,
        code: e?.code,
        meta: e?.meta,
        stack: e?.stack,
      });
    }
  }
  // TS can't narrow `app` across the reassignment above — re-narrow explicitly.
  if (!app) return notFound();

  const now = new Date();
  const expired = app.paymentLinkExpiresAt ? now > app.paymentLinkExpiresAt : false;
  const alreadyPaid = app.status === "PAID";
  // If session_id is present but we couldn't confirm (e.g. webhook still
  // catching up), show a "Processing…" state with a refresh nudge.
  const awaitingConfirmation = !!searchParams.session_id && !alreadyPaid;
  const wasCancelled = !!searchParams.cancelled;

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="card">
        <div className="text-xs uppercase tracking-wider text-brand-700">Vendor checkout</div>
        <h1 className="mt-1 text-2xl font-bold">{app.event.name}</h1>
        <p className="mt-2 text-slate-600">{app.companyName}</p>

        {alreadyPaid ? (
          <div className="mt-6 rounded-lg bg-emerald-50 p-4 ring-1 ring-emerald-200 text-sm text-emerald-800">
            ✅ Payment received. You're confirmed for {app.event.name}.
            <p className="mt-1 text-xs text-emerald-700">
              Your QR-coded vendor pass is on the way to {app.email}. Check your inbox (and spam) in the next minute.
            </p>
          </div>
        ) : awaitingConfirmation ? (
          <div className="mt-6 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200 text-sm text-amber-900">
            <p className="font-semibold">⏳ Confirming your payment with Stripe…</p>
            <p className="mt-1">This usually takes just a few seconds.</p>
            <a href={`/vendor/checkout/${params.token}`} className="mt-3 inline-block text-amber-900 underline">
              Refresh now
            </a>
            {/* Auto-refresh after 10s in case the webhook is still landing.
                Don't go shorter — finalizeVendor is heavy (insert + tickets +
                email) and a 4s refresh was racing itself. */}
            <meta httpEquiv="refresh" content="10" />
          </div>
        ) : expired ? (
          <div className="mt-6 rounded-lg bg-red-50 p-4 ring-1 ring-red-200 text-sm text-red-700">
            This payment link has expired. Contact the organizer to request a new one.
          </div>
        ) : (
          <>
            {wasCancelled && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200 text-sm text-amber-800">
                Payment cancelled. You can try again below.
              </div>
            )}
            <div className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between"><span>Vendor booth</span><span className="font-medium">{app.event.name}</span></div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Amount due</span>
                <span>${((app.quotedPriceCents ?? 0) / 100).toFixed(2)}</span>
              </div>
            </div>
            <VendorCheckoutForm token={params.token} />
            <p className="mt-4 text-xs text-slate-500">
              Link expires {app.paymentLinkExpiresAt?.toLocaleDateString() ?? "soon"}.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
