"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Global centered "Saved" toast.
 *
 * Renders nothing until the URL has one of the success query params we use as
 * post-save signals (?saved, ?updated, ?invited, ?connect_reset, ?resynced).
 * Pops a centered card for ~1.5s with the appropriate message, then strips
 * those params from the URL so a reload doesn't re-fire the toast.
 *
 * Wired once in the root layout so every save action across the app —
 * dashboard, admin, account — gets the same UX without each page wiring it.
 */
export function SavedToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("Saved");

  useEffect(() => {
    const updated = params.get("updated");
    const invited = params.get("invited");
    const connectReset = params.get("connect_reset");
    const resynced = params.get("resynced");
    const saved = params.get("saved");
    const orgDeleted = params.get("org_deleted");

    let msg: string | null = null;
    if (updated) msg = `Updated ${updated}`;
    else if (invited) msg = `Invite sent to ${invited}`;
    else if (connectReset) msg = "Stripe Connect link cleared";
    else if (resynced) msg = `Re-synced — status ${resynced}`;
    else if (orgDeleted) msg = `Deleted ${orgDeleted}`;
    else if (saved) msg = "Saved";

    if (!msg) return;

    setMessage(msg);
    setVisible(true);

    const hide = setTimeout(() => setVisible(false), 1600);
    const clean = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      next.delete("saved");
      next.delete("updated");
      next.delete("invited");
      next.delete("connect_reset");
      next.delete("resynced");
      next.delete("org_deleted");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 2100);

    return () => {
      clearTimeout(hide);
      clearTimeout(clean);
    };
  }, [params, pathname, router]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-emerald-600 px-6 py-4 text-white shadow-2xl ring-1 ring-emerald-800/40">
        <span className="text-2xl" aria-hidden>✓</span>
        <span className="text-base font-semibold">{message}</span>
      </div>
    </div>
  );
}
