"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  eventId: string;
  eventName: string;
  eventTimezone: string;
  initialTotal: number;
  initialChecked: number;
}

type Result =
  | { status: "CHECKED_IN"; attendee: string; email?: string }
  | { status: "ALREADY_USED"; attendee: string; checkedInAt: string }
  | { status: "INVALID"; reason?: string }
  // Time-window responses (409). NOT_OPEN/CLOSED = hard block (staff);
  // OUTSIDE_WINDOW = organizer may override.
  | { status: "NOT_OPEN" | "CLOSED"; attendee?: string; opensAt?: string; closesAt?: string }
  | { status: "OUTSIDE_WINDOW"; state: "TOO_EARLY" | "TOO_LATE"; attendee: string; opensAt: string; closesAt: string }
  | null;

// The pending scan awaiting an organizer's override confirmation.
type PendingOverride =
  | { kind: "qr"; token: string }
  | { kind: "manual"; ticketId: string; name: string };

interface Attendee {
  ticketId: string;
  name: string;
  email: string | null;
  ticketType: string;
  company: string | null;
  checkedIn: boolean;
  checkedInAt: string | null;
}

export function CheckinScanner({ eventId, eventName, eventTimezone, initialTotal, initialChecked }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState<Result>(null);
  const [pending, setPending] = useState<PendingOverride | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [checked, setChecked] = useState(initialChecked);
  const [scanning, setScanning] = useState(true);
  const [scannerSupported, setScannerSupported] = useState(true);
  const cooldownRef = useRef<number>(0);

  // Find-attendee state
  const [findOpen, setFindOpen] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Camera + barcode detector
  useEffect(() => {
    if (!scanning) return;
    // Older iOS Safari has no BarcodeDetector — fall back to Find/manual entry
    // instead of leaving a dead black square with no explanation.
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      setScannerSupported(false);
      return;
    }

    let stream: MediaStream | null = null;
    let stopped = false;
    const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
    const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };

    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, audio: false,
        });
        // The component may have unmounted while getUserMedia was resolving —
        // if so, stop the just-acquired stream so the camera light goes off.
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const loop = async () => {
          if (stopped) return;
          if (Date.now() < cooldownRef.current) {
            requestAnimationFrame(loop); return;
          }
          try {
            const codes = await detector.detect(videoRef.current!);
            if (codes[0]?.rawValue) {
              cooldownRef.current = Date.now() + 1500;
              submitToken(codes[0].rawValue);
            }
          } catch {}
          requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        // Permission denied / no camera — surface the fallback UI.
        console.error("[checkin] camera start failed:", e);
        if (!stopped) setScannerSupported(false);
      }
    }
    start();
    return () => { stopped = true; stop(); };
  }, [scanning]);

  async function submitToken(token: string, override = false) {
    const cleaned = token.trim();
    if (!cleaned) return;
    // Never let a network error or a non-JSON 500 throw an unhandled rejection
    // out of the scan loop — that freezes the scanner mid-event.
    try {
      const res = await fetch("/api/checkin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cleaned, eventId, override }),
      });
      if (res.status === 401 || res.status === 403) {
        setResult({ status: "INVALID", reason: "Session expired — sign in again" });
        return;
      }
      const data = await res.json().catch(() => ({ status: "INVALID", reason: "server_error" }));
      setResult(data);
      // Organizer can override an outside-the-window scan — stash the token so
      // the confirm button can re-submit it. Any other result clears pending.
      setPending(data.status === "OUTSIDE_WINDOW" ? { kind: "qr", token: cleaned } : null);
      if (data.status === "CHECKED_IN") {
        setChecked((n) => n + 1);
        if (findOpen) loadAttendees();
      }
    } catch {
      setResult({ status: "INVALID", reason: "Network error — check connection and retry" });
    }
  }

  // Re-submit the pending scan with override:true after the organizer confirms.
  async function confirmOverride() {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (p.kind === "qr") {
      cooldownRef.current = Date.now() + 1500; // don't let the loop double-fire
      await submitToken(p.token, true);
    } else {
      await checkInByTicket(p.ticketId, p.name, true);
    }
  }

  function formatWindowTime(iso?: string) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: eventTimezone,
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleString();
    }
  }

  async function loadAttendees() {
    setLoading(true);
    try {
      const res = await fetch(`/api/checkin/attendees?eventId=${encodeURIComponent(eventId)}`);
      const data = await res.json();
      setAttendees(data.attendees ?? []);
    } catch {
      setAttendees([]);
    } finally {
      setLoading(false);
    }
  }

  function openFind() {
    setFindOpen(true);
    if (!attendees) loadAttendees();
  }

  async function checkInByTicket(ticketId: string, attendeeName: string, override = false) {
    setBusyId(ticketId);
    try {
      const res = await fetch("/api/checkin/manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, eventId, override }),
      });
      const data = await res.json().catch(() => ({ status: "INVALID", reason: "server_error" }));
      setResult(data.status === "CHECKED_IN"
        ? { status: "CHECKED_IN", attendee: attendeeName, email: data.email }
        : data.status === "OUTSIDE_WINDOW"
        ? { ...data, attendee: attendeeName }
        : data);
      setPending(data.status === "OUTSIDE_WINDOW" ? { kind: "manual", ticketId, name: attendeeName } : null);
      if (data.status === "CHECKED_IN") {
        setChecked((n) => n + 1);
        setAttendees((list) => list?.map((a) =>
          a.ticketId === ticketId ? { ...a, checkedIn: true, checkedInAt: new Date().toISOString() } : a
        ) ?? null);
      }
    } catch {
      setResult({ status: "INVALID", reason: "Network error — check connection and retry" });
    } finally {
      setBusyId(null);
    }
  }

  const filteredAttendees = useMemo(() => {
    if (!attendees) return [];
    const q = query.trim().toLowerCase();
    if (!q) return attendees;
    return attendees.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      (a.email?.toLowerCase().includes(q) ?? false) ||
      (a.company?.toLowerCase().includes(q) ?? false)
    );
  }, [attendees, query]);

  const bgColor =
    result?.status === "CHECKED_IN" ? "bg-emerald-600"
    : result?.status === "ALREADY_USED" ? "bg-amber-500"
    : result?.status === "OUTSIDE_WINDOW" ? "bg-amber-500"
    : result?.status === "NOT_OPEN" || result?.status === "CLOSED" ? "bg-orange-600"
    : result?.status === "INVALID" ? "bg-red-600"
    : "bg-slate-900";

  return (
    <main className={`${bgColor} min-h-screen text-white transition-colors`}>
      <header className="flex items-center justify-between px-4 py-3">
        <a href="/dashboard" className="text-sm opacity-80">◀ Back</a>
        <div className="font-semibold">{eventName}</div>
        <div className="text-sm tabular-nums">{checked} / {initialTotal}</div>
      </header>

      <div className="px-4">
        <div className="relative mx-auto mt-2 aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-8 rounded-lg ring-2 ring-white/60" />
          {!scannerSupported && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-6 text-center text-sm">
              <div className="text-2xl">📷</div>
              <p className="font-medium">QR scanning isn&apos;t available on this device or browser.</p>
              <p className="opacity-80">Use “Find attendee &amp; check in” below, or paste the QR token manually. Tip: Chrome on Android supports live scanning.</p>
            </div>
          )}
        </div>

        {result && (
          <div className="mt-4 rounded-xl bg-white/10 p-4 text-center">
            {result.status === "CHECKED_IN" && (
              <>
                <div className="text-3xl">✅</div>
                <div className="mt-1 text-xl font-bold">Checked in</div>
                <div className="opacity-90">{result.attendee}</div>
              </>
            )}
            {result.status === "ALREADY_USED" && (
              <>
                <div className="text-3xl">⚠️</div>
                <div className="mt-1 text-xl font-bold">Already checked in</div>
                <div className="opacity-90">{result.attendee}</div>
              </>
            )}
            {result.status === "INVALID" && (
              <>
                <div className="text-3xl">❌</div>
                <div className="mt-1 text-xl font-bold">Invalid ticket</div>
                {result.reason && <div className="opacity-90">{result.reason}</div>}
              </>
            )}
            {(result.status === "NOT_OPEN" || result.status === "CLOSED") && (
              <>
                <div className="text-3xl">⏰</div>
                <div className="mt-1 text-xl font-bold">
                  {result.status === "NOT_OPEN" ? "Check-in not open yet" : "Check-in has closed"}
                </div>
                {result.attendee && <div className="opacity-90">{result.attendee}</div>}
                <div className="mt-1 text-sm opacity-90">
                  {result.status === "NOT_OPEN"
                    ? <>Opens {formatWindowTime(result.opensAt)}</>
                    : <>Closed {formatWindowTime(result.closesAt)}</>}
                </div>
                <div className="mt-1 text-xs opacity-75">An organizer or admin can override this.</div>
              </>
            )}
            {result.status === "OUTSIDE_WINDOW" && (
              <>
                <div className="text-3xl">⏰</div>
                <div className="mt-1 text-xl font-bold">
                  {result.state === "TOO_EARLY" ? "Check-in isn’t open yet" : "Check-in has closed"}
                </div>
                <div className="opacity-90">{result.attendee}</div>
                <div className="mt-1 text-sm opacity-90">
                  {result.state === "TOO_EARLY"
                    ? <>Opens {formatWindowTime(result.opensAt)}</>
                    : <>Closed {formatWindowTime(result.closesAt)}</>}
                </div>
                <button
                  type="button"
                  onClick={confirmOverride}
                  className="mt-3 w-full rounded-lg bg-white px-4 py-2 font-semibold text-amber-700 hover:bg-amber-50"
                >
                  Check in anyway
                </button>
                <div className="mt-1 text-xs opacity-75">Logged as an override.</div>
              </>
            )}
          </div>
        )}

        {/* Big primary "Find attendee" button */}
        <div className="mx-auto mt-6 max-w-md">
          <button
            type="button"
            onClick={openFind}
            className="w-full rounded-xl bg-white px-4 py-3 text-slate-900 font-medium hover:bg-slate-100"
          >
            🔍 Find attendee &amp; check in
          </button>
        </div>

        {/* Manual token paste (fallback) */}
        <details className="mx-auto mt-3 max-w-md rounded-xl bg-white/10 p-3 text-sm">
          <summary>Manual entry (paste QR token)</summary>
          <div className="mt-2 flex gap-2">
            <input value={manualToken} onChange={(e) => setManualToken(e.target.value)}
                   className="input flex-1 text-slate-900" placeholder="Paste QR token" />
            <button className="btn-secondary text-slate-900"
                    onClick={() => manualToken && submitToken(manualToken)}>Submit</button>
          </div>
        </details>
      </div>

      {/* Find-attendee drawer */}
      {findOpen && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setFindOpen(false)}
        >
          <div
            className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl bg-white text-slate-900 shadow-xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <h2 className="font-semibold">Find attendee</h2>
              <button onClick={() => setFindOpen(false)} className="text-sm text-slate-500 hover:text-slate-900">Close</button>
            </div>

            <div className="px-4 py-3 border-b">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input"
                placeholder="Search by name, email, or company…"
              />
              {attendees && (
                <p className="mt-2 text-xs text-slate-500">
                  {filteredAttendees.length} of {attendees.length} attendees
                  {" · "}
                  {attendees.filter((a) => a.checkedIn).length} already checked in
                </p>
              )}
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {loading && (
                <div className="p-8 text-center text-slate-500">Loading attendees…</div>
              )}
              {!loading && filteredAttendees.length === 0 && (
                <div className="p-8 text-center text-slate-500">
                  {query ? "No matching attendees." : "No registered attendees yet."}
                </div>
              )}
              {filteredAttendees.map((a) => (
                <div key={a.ticketId} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {a.email}
                      {a.company && ` · ${a.company}`}
                      {" · "}{a.ticketType}
                    </div>
                  </div>
                  {a.checkedIn ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
                      ✓ Checked in
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === a.ticketId}
                      onClick={() => checkInByTicket(a.ticketId, a.name)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                    >
                      {busyId === a.ticketId ? "Checking in…" : "✓ Check in"}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t px-4 py-2 text-xs text-slate-500 flex items-center justify-between">
              <button onClick={loadAttendees} className="text-brand-700 hover:underline" disabled={loading}>
                Refresh list
              </button>
              <span>Tip: keep this open during the rush</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
