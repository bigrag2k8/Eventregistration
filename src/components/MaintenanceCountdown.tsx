"use client";

import { useEffect, useState } from "react";

function format(diffMs: number): string {
  if (diffMs <= 0) return "any minute now";
  const totalSec = Math.floor(diffMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, "0")}m`;
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

/**
 * Live countdown on the maintenance page. Receives the ISO `until` from the
 * server so initial render matches the server (no hydration mismatch); ticks
 * client-side every second after that.
 */
export function MaintenanceCountdown({ until }: { until: string }) {
  const target = new Date(until).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
      {format(target - now)}
    </div>
  );
}
