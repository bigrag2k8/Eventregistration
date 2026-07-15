"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

const PAGE = 5;

export interface SessionRow {
  id: string;
  dateLabel: string;
  sessionLabel: string;
  status: string;
  regs: number;
  isPast: boolean;
}

interface Props {
  seriesId: string;
  name: string;
  schedule: string;
  status: string;
  totalRegs: number;
  sessions: SessionRow[];
  canManage: boolean;
  /** View ↗ / Delete controls rendered by the server (server-action form). */
  actions?: ReactNode;
}

/**
 * One recurring series rendered as its own <tbody>: a summary row that expands
 * to reveal that series' individual sessions, paged 5 at a time. Collapsed by
 * default so the dashboard stays readable no matter how many sessions a series
 * has generated. Expanded state persists per-series in localStorage.
 *
 * Sessions are grouped upcoming-first; past sessions stay behind a toggle so
 * they're still reachable (the main events table filters occurrences out).
 */
export function SeriesGroup({ seriesId, name, schedule, status, totalRegs, sessions, canManage, actions }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [showPast, setShowPast] = useState(false);
  const [pastPage, setPastPage] = useState(0);

  // Restore after mount (not during render) so SSR markup and first client
  // render match — reading localStorage inline would hydration-mismatch.
  useEffect(() => {
    try {
      if (localStorage.getItem(`series-exp:${seriesId}`) === "1") setExpanded(true);
    } catch {}
  }, [seriesId]);

  function toggle() {
    setExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem(`series-exp:${seriesId}`, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const upcoming = sessions.filter((s) => !s.isPast);
  const past = sessions.filter((s) => s.isPast).slice().reverse(); // most recent first
  const upSlice = upcoming.slice(page * PAGE, page * PAGE + PAGE);
  const pastSlice = past.slice(pastPage * PAGE, pastPage * PAGE + PAGE);

  const sessionCount = sessions.length;
  // "Upcoming" only counts sessions that are actually still happening — a
  // cancelled one isn't. Surfacing this stops the "series says ACTIVE but
  // everything under it is cancelled" confusion.
  const liveUpcoming = upcoming.filter((s) => s.status !== "CANCELLED").length;
  const statusPill =
    status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";

  return (
    <tbody className="divide-y divide-slate-100 border-t border-slate-200">
      {/* Series summary row */}
      <tr className={expanded ? "bg-slate-50" : undefined}>
        <td className="px-4 py-3 font-medium">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            className="flex items-center gap-1.5 text-left hover:text-brand-700"
          >
            <span className={`text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden>
              ▸
            </span>
            <span>{name}</span>
            <span className="ml-1 text-xs font-normal text-slate-400">
              {sessionCount} session{sessionCount === 1 ? "" : "s"}
            </span>
            {liveUpcoming > 0 ? (
              <span className="ml-1 text-xs font-normal text-slate-400">· {liveUpcoming} upcoming</span>
            ) : (
              <span className="ml-1 text-xs font-normal text-amber-700">· none upcoming</span>
            )}
          </button>
        </td>
        <td className="px-4 py-3 text-slate-600">{schedule}</td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2 py-0.5 text-xs ${statusPill}`}>{status}</span>
        </td>
        <td className="px-4 py-3 text-right text-slate-600">{totalRegs}</td>
        <td className="px-4 py-3 text-right">{actions}</td>
      </tr>

      {/* Sessions */}
      {expanded && (
        <>
          {upSlice.map((s) => (
            <SessionTr key={s.id} s={s} canManage={canManage} />
          ))}

          {upcoming.length === 0 && (
            <tr>
              <td colSpan={5} className="border-l-2 border-slate-200 px-4 py-3 pl-10 text-xs text-slate-400">
                No upcoming sessions.
              </td>
            </tr>
          )}

          {upcoming.length > PAGE && (
            <tr>
              <td colSpan={5} className="border-l-2 border-slate-200 px-4 py-2 pl-10">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">
                    Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, upcoming.length)} of {upcoming.length}
                  </span>
                  {page > 0 && (
                    <button type="button" onClick={() => setPage((p) => p - 1)} className="text-brand-700 hover:underline">
                      ← Previous 5
                    </button>
                  )}
                  {(page + 1) * PAGE < upcoming.length && (
                    <button type="button" onClick={() => setPage((p) => p + 1)} className="text-brand-700 hover:underline">
                      Next 5 →
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}

          {past.length > 0 && !showPast && (
            <tr>
              <td colSpan={5} className="border-l-2 border-slate-200 px-4 py-2 pl-10">
                <button type="button" onClick={() => setShowPast(true)} className="text-xs text-brand-700 hover:underline">
                  Show {past.length} past session{past.length === 1 ? "" : "s"}
                </button>
              </td>
            </tr>
          )}

          {showPast && (
            <>
              {pastSlice.map((s) => (
                <SessionTr key={s.id} s={s} canManage={canManage} />
              ))}
              <tr>
                <td colSpan={5} className="border-l-2 border-slate-200 px-4 py-2 pl-10">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500">
                      Past {pastPage * PAGE + 1}–{Math.min((pastPage + 1) * PAGE, past.length)} of {past.length}
                    </span>
                    {pastPage > 0 && (
                      <button type="button" onClick={() => setPastPage((p) => p - 1)} className="text-brand-700 hover:underline">
                        ← Previous 5
                      </button>
                    )}
                    {(pastPage + 1) * PAGE < past.length && (
                      <button type="button" onClick={() => setPastPage((p) => p + 1)} className="text-brand-700 hover:underline">
                        Next 5 →
                      </button>
                    )}
                    <button type="button" onClick={() => { setShowPast(false); setPastPage(0); }} className="text-slate-500 hover:underline">
                      Hide past
                    </button>
                  </div>
                </td>
              </tr>
            </>
          )}
        </>
      )}
    </tbody>
  );
}

function SessionTr({ s, canManage }: { s: SessionRow; canManage: boolean }) {
  const pill =
    s.status === "PUBLISHED"
      ? "bg-emerald-100 text-emerald-700"
      : s.status === "CANCELLED"
        ? "bg-red-100 text-red-700"
        : "bg-slate-100 text-slate-600";
  return (
    <tr className={s.isPast ? "opacity-70" : undefined}>
      <td className="border-l-2 border-slate-200 px-4 py-2 pl-10 text-slate-600">{s.dateLabel}</td>
      <td className="px-4 py-2 text-xs text-slate-400">{s.sessionLabel}</td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs ${pill}`}>{s.status}</span>
      </td>
      <td className="px-4 py-2 text-right text-slate-600">{s.regs}</td>
      <td className="px-4 py-2 text-right">
        <Link href={canManage ? `/dashboard/events/${s.id}` : `/checkin/${s.id}`} className="text-xs text-brand-700 hover:underline">
          {canManage ? "Manage" : "Check-in"}
        </Link>
      </td>
    </tr>
  );
}
