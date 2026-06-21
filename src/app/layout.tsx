import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { getMaintenanceState } from "@/lib/maintenance";
import MaintenancePage from "@/app/maintenance/page";
import { SavedToast } from "@/components/SavedToast";

export const metadata: Metadata = {
  title: "Your Events App",
  description: "Modern event registration, ticketing, and check-in.",
};

// Paths that stay reachable during a maintenance window for non-SUPERADMINs:
//   /maintenance  — the maintenance page itself (would infinite-loop otherwise)
//   /signin       — so admins can sign in and toggle maintenance off
//   /admin*       — admin tools (the /api/admin/* gate is already SUPERADMIN-only
//                   via existing middleware, so any non-admin hitting these
//                   routes is bounced before they reach this layout anyway)
//   /api*         — API routes don't render layouts; their own per-route guards
//                   handle this
function isBypassPath(pathname: string): boolean {
  return (
    pathname === "/maintenance" ||
    pathname === "/signin" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/")
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = headers().get("x-pathname") ?? "";
  // SUPERADMINs bypass maintenance everywhere; other visitors (no session or
  // any other role) see the maintenance page on all non-bypassed paths.
  const session = await getSession();
  const isSuper = session?.role === "SUPERADMIN";
  let inMaintenance = false;
  if (!isSuper && !isBypassPath(pathname)) {
    const state = await getMaintenanceState();
    inMaintenance = state.active;
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {inMaintenance ? <MaintenancePage /> : children}
        <Suspense fallback={null}>
          <SavedToast />
        </Suspense>
      </body>
    </html>
  );
}
