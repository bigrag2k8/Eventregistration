"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Banner image uploader + crop positioner.
 *
 * Upload (Cloudinary unsigned preset) or paste a URL, then drag inside the
 * preview frame to recenter the image and use the zoom slider to scale it.
 * The preview matches the public event page's 16:6 frame exactly, so what
 * the organizer sees here is what attendees see when the event publishes.
 *
 * Output goes to four hidden inputs the surrounding form picks up:
 *   bannerUrl        — image URL
 *   bannerPositionX  — 0-100, CSS object-position-x percentage
 *   bannerPositionY  — 0-100, CSS object-position-y percentage
 *   bannerZoom       — 1.0-3.0, CSS transform: scale() multiplier
 *
 * No server-side image processing — saves are CSS-only on the public page.
 */
interface Props {
  name?: string;
  defaultUrl?: string | null;
  defaultPositionX?: number;
  defaultPositionY?: number;
  defaultZoom?: number;
  defaultFitToFrame?: boolean;
  label?: string;
  hint?: string;
}

const SUGGESTED_URLS = [
  {
    label: "Fitness / Conference",
    url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1600&h=600&fit=crop&q=80",
  },
  {
    label: "Tech meetup",
    url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&h=600&fit=crop&q=80",
  },
  {
    label: "Concert / Music",
    url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&h=600&fit=crop&q=80",
  },
  {
    label: "Workshop / Class",
    url: "https://images.unsplash.com/photo-1591115765373-5207764f72e7?w=1600&h=600&fit=crop&q=80",
  },
];

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function BannerImageInput({
  name = "bannerUrl",
  defaultUrl,
  defaultPositionX = 50,
  defaultPositionY = 50,
  defaultZoom = 1,
  defaultFitToFrame = false,
  label = "Event banner image",
  hint = "Wide image (16:6 looks best). Drag to reposition and zoom to reframe.",
}: Props) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  const cloudinaryReady = !!cloudName && !!uploadPreset;

  const [url, setUrl] = useState<string>(defaultUrl ?? "");
  const [posX, setPosX] = useState<number>(defaultPositionX);
  const [posY, setPosY] = useState<number>(defaultPositionY);
  const [zoom, setZoom] = useState<number>(defaultZoom);
  const [fitToFrame, setFitToFrame] = useState<boolean>(defaultFitToFrame);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Reset framing when the image URL changes (new upload / pasted URL).
  // Keeps existing framing when the parent passes a default URL on first mount.
  const firstMountRef = useRef(true);
  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false;
      return;
    }
    setPosX(50);
    setPosY(50);
    setZoom(1);
  }, [url]);

  // Block the surrounding form from submitting while an upload is in flight —
  // the hidden URL input is still empty then, so a hasty Save would persist a
  // blank banner. Attaches to the parent form via the hidden input's ref.
  const hiddenUrlRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  uploadingRef.current = uploading;
  useEffect(() => {
    const form = hiddenUrlRef.current?.form;
    if (!form) return;
    const onSubmit = (e: Event) => {
      if (uploadingRef.current) {
        e.preventDefault();
        e.stopPropagation();
        alert("Image is still uploading — wait for it to finish, then save.");
      }
    };
    form.addEventListener("submit", onSubmit, { capture: true });
    return () => form.removeEventListener("submit", onSubmit, { capture: true } as any);
  }, []);

  // Drag-to-reposition: track pointer movement inside the preview frame and
  // shift posX/posY proportionally. One pixel of drag corresponds to about
  // one frame-percent — the right amount for the zoom levels we allow.
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!url || fitToFrame) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: posX, startPosY: posY };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !frameRef.current) return;
    const frame = frameRef.current.getBoundingClientRect();
    // Convert pixel delta to position percent. Higher zoom = pointer covers more
    // of the source image per pixel, so each px of drag should shift posX less.
    // The (zoom / (zoom - 1)) trick approximates the visible vs source ratio.
    const sensitivity = 100 / Math.max(frame.width, 1) / Math.max(zoom, 1);
    const sensitivityY = 100 / Math.max(frame.height, 1) / Math.max(zoom, 1);
    const dx = (e.clientX - dragRef.current.startX) * sensitivity * 100;
    const dy = (e.clientY - dragRef.current.startY) * sensitivityY * 100;
    setPosX(clamp(dragRef.current.startPosX - dx, 0, 100));
    setPosY(clamp(dragRef.current.startPosY - dy, 0, 100));
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  }

  async function handleFile(file: File) {
    if (!cloudinaryReady) {
      setError("Image upload isn't configured. Paste an image URL instead.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image is over 10MB. Please pick a smaller one.");
      return;
    }
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset!);
      formData.append("folder", "eventflow/banners");

      const data: { secure_url?: string; error?: { message: string } } =
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch (e) { reject(e); }
          };
          xhr.onerror = () => reject(new Error("Network error"));
          xhr.send(formData);
        });

      if (data.secure_url) {
        setUrl(data.secure_url);
      } else {
        setError(data.error?.message ?? "Upload failed");
      }
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function resetFraming() {
    setPosX(50);
    setPosY(50);
    setZoom(1);
  }

  return (
    <div>
      <label className="label">{label}</label>
      {/* Hidden inputs the surrounding form picks up */}
      <input type="hidden" name={name} value={url} ref={hiddenUrlRef} />
      <input type="hidden" name="bannerPositionX" value={posX.toFixed(2)} />
      <input type="hidden" name="bannerPositionY" value={posY.toFixed(2)} />
      <input type="hidden" name="bannerZoom" value={zoom.toFixed(2)} />
      {/* Native checkboxes don't submit when unchecked, so always send an
          explicit "1" or "0" instead via a hidden input. */}
      <input type="hidden" name="bannerFitToFrame" value={fitToFrame ? "1" : "0"} />

      {/* Preview frame — drag inside to reposition (disabled when fit-to-frame is on) */}
      {url ? (
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`mt-2 aspect-[16/6] w-full overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 select-none ${
            fitToFrame ? "cursor-default" : "cursor-grab active:cursor-grabbing"
          }`}
          style={{ touchAction: "none" }}
          title={fitToFrame ? "Fit to frame is on — drag/zoom disabled" : "Drag to reposition"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Event banner preview"
            draggable={false}
            className={`h-full w-full ${fitToFrame ? "object-contain" : "object-cover"}`}
            style={
              fitToFrame
                ? undefined
                : {
                    objectPosition: `${posX}% ${posY}%`,
                    transform: `scale(${zoom})`,
                    transformOrigin: `${posX}% ${posY}%`,
                  }
            }
          />
        </div>
      ) : (
        <div className="mt-2 flex aspect-[16/6] w-full items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 ring-1 ring-slate-200">
          <span className="text-sm">No banner yet — upload or paste a URL below</span>
        </div>
      )}

      {/* Framing controls (only when there's an image) */}
      {url && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={fitToFrame}
              onChange={(e) => setFitToFrame(e.target.checked)}
              className="rounded"
            />
            <span className="font-medium text-slate-700">Fit entire image to frame</span>
            <span className="text-slate-500">
              (shows the whole image with letterbox/pillarbox space if needed)
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className={`flex items-center gap-2 text-xs ${fitToFrame ? "opacity-40" : "text-slate-600"}`}
            >
              <span className="font-medium uppercase tracking-wider">Zoom</span>
              <input
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={0.05}
                value={zoom}
                disabled={fitToFrame}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-48 disabled:cursor-not-allowed"
              />
              <span className="w-10 font-mono text-[11px] text-slate-500">{zoom.toFixed(2)}×</span>
            </label>
            <button
              type="button"
              onClick={resetFraming}
              disabled={fitToFrame}
              className="text-xs text-slate-600 hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset framing
            </button>
            <span className={`text-xs ${fitToFrame ? "text-slate-400" : "text-slate-500"}`}>
              {fitToFrame ? "Drag/zoom disabled" : "Drag the image to reposition."}
            </span>
          </div>
        </div>
      )}

      {/* Upload controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {cloudinaryReady && (
          <label className="btn-secondary cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {uploading ? `Uploading… ${progress}%` : url ? "Change image" : "Choose image"}
          </label>
        )}
        {url && (
          <button
            type="button"
            onClick={() => { setUrl(""); setError(null); resetFraming(); setFitToFrame(false); }}
            className="text-sm text-red-600 hover:underline"
          >
            Remove
          </button>
        )}
      </div>

      {/* URL paste fallback */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
          {cloudinaryReady ? "Or paste a URL instead" : "Paste an image URL"}
        </summary>
        <div className="mt-2 space-y-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/banner.jpg"
            className="input"
          />
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_URLS.map((s) => (
              <button
                key={s.url}
                type="button"
                onClick={() => setUrl(s.url)}
                className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
              >
                Demo: {s.label}
              </button>
            ))}
          </div>
        </div>
      </details>

      {!cloudinaryReady && (
        <p className="mt-2 text-xs text-amber-700">
          Image upload not configured. Paste a URL above or ask your admin to set
          <code className="mx-1 font-mono">NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME</code>
          and <code className="font-mono">NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET</code>.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">⚠ {error}</p>}
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
