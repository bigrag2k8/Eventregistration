import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { VendorCheckoutForm } from "@/components/VendorCheckoutForm";

export const dynamic = "force-dynamic";

export default async function VendorCheckoutPage({ params }: { params: { token: string } }) {
  const app = await prisma.vendorApplication.findUnique({
    where: { paymentLinkToken: params.token },
    include: { event: true },
  });
  if (!app) return notFound();

  const now = new Date();
  const expired = app.paymentLinkExpiresAt ? now > app.paymentLinkExpiresAt : false;
  const alreadyPaid = app.status === "PAID";

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="card">
        <div className="text-xs uppercase tracking-wider text-brand-700">Vendor checkout</div>
        <h1 className="mt-1 text-2xl font-bold">{app.event.name}</h1>
        <p className="mt-2 text-slate-600">{app.companyName}</p>

        {alreadyPaid ? (
          <div className="mt-6 rounded-lg bg-emerald-50 p-4 ring-1 ring-emerald-200 text-sm text-emerald-800">
            ✅ This booth has already been paid for. You're confirmed for {app.event.name}.
          </div>
        ) : expired ? (
          <div className="mt-6 rounded-lg bg-red-50 p-4 ring-1 ring-red-200 text-sm text-red-700">
            This payment link has expired. Contact the organizer to request a new one.
          </div>
        ) : (
          <>
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
