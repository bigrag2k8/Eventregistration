"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  eventId: string;
  eventName: string;
  initialTotal: number;
  initialChecked: number;
}

type Result =
  | { status: "CHECKED_IN"; attendee: string; email?: string }
  | { status: "ALREADY_USED"; attendee: string; checkedInAt: string }
  | { status: "INVALID"; reason?: string }
  | null;

export function CheckinScanner({ eventId, eventName, initialTotal, initialChecked }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState<Result>(null);
  const [manualToken, setManualToken] = useState("");
  const [checked, setChecked] = useState(initialChecked);
  const [scanning, setScanning] = useState(true);
  const cooldownRef = useRef<number>(0);

  // Native BarcodeDetector (Chrome/Android, Safari 17+).
  useEffect(() => {
    if (!scanning) return;
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) return;

    let stream: MediaStream;
    let stopped = false;
    const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
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
              submit(codes[0].rawValue);
            }
          } catch {}
          requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        console.error(e);
      }
    }
    start();
    return () => { stopped = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [scanning]);

  async function submit(token: string) {
    const cleaned = token.trim();
    if (!cleaned) return;
    const res = await fetch("/api/checkin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: cleaned, eventId }),
    });
    const data = await res.json();
    setResult(data);
    if (data.status === "CHECKED_IN") setChecked((n) => n + 1);
  }

  const bgColor =
    result?.status === "CHECKED_IN" ? "bg-emerald-600"
    : result?.status === "ALREADY_USED" ? "bg-amber-500"
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
          </div>
        )}

        <details className="mt-4 rounded-xl bg-white/10 p-3 text-sm">
          <summary>Manual entry</summary>
          <div className="mt-2 flex gap-2">
            <input value={manualToken} onChange={(e) => setManualToken(e.target.value)}
                   className="input flex-1 text-slate-900" placeholder="Paste QR token" />
            <button className="btn-secondary text-slate-900"
                    onClick={() => manualToken && submit(manualToken)}>Submit</button>
          </div>
        </details>
      </div>
    </main>
  );
}
