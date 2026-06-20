import { getMaintenanceState } from "@/lib/maintenance";
import { MaintenanceCountdown } from "@/components/MaintenanceCountdown";

export const dynamic = "force-dynamic";

const DEFAULT_MESSAGE =
  "Your Events App is undergoing a short maintenance. We'll be back shortly. Thanks for your patience.";

/**
 * Public maintenance page. Returns HTTP 503 so monitoring/search engines treat
 * it correctly. Read-only — no nav, no sign-in form, no sign-up form. Just the
 * message and an optional live countdown. SUPERADMINs never see this page
 * (the root-layout gate bypasses them).
 */
export default async function MaintenancePage() {
  const state = await getMaintenanceState();
  const message = state.message ?? DEFAULT_MESSAGE;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-hidden>
          <span style={{ fontSize: "1.5rem", lineHeight: 1 }}>⚙</span>
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">We&rsquo;ll be right back</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>

        {state.until && (
          <div className="mt-6 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs uppercase tracking-wider text-slate-500">Estimated to come back</div>
            <MaintenanceCountdown until={state.until.toISOString()} />
          </div>
        )}

        <p className="mt-8 text-xs text-slate-400">
          Your Events App &middot;{" "}
          <a href="https://www.yourevents.app/status" className="hover:text-slate-600">Status</a>
        </p>
      </div>
    </main>
  );
}
