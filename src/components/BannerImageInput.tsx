"use client";

import { useState } from "react";

/**
 * Banner image uploader.
 *
 * Uploads directly from the browser to Cloudinary using an UNSIGNED upload
 * preset — zero load on our app server, and no image data ever touches us.
 * After upload, the resulting CDN URL is written into the hidden form input
 * `name="bannerUrl"` so the existing server action picks it up unchanged.
 *
 * Required env vars (Railway):
 *   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME   = "your-cloud"
 *   NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "yourevents_banner"  (created in
 *     Cloudinary dashboard → Settings → Upload → Add upload preset → mode:
 *     unsigned)
 *
 * Falls back to a plain URL paste field if those env vars are missing, so
 * the form still works without Cloudinary configured.
 */
interface Props {
  name?: string;
  defaultUrl?: string | null;
  label?: string;
  hint?: string;
}

const SUGGESTED_URLS = [
  // Free Unsplash images organizers can use for testing without uploading
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

export function BannerImageInput({
  name = "bannerUrl",
  defaultUrl,
  label = "Event banner image",
  hint = "Wide image (16:6 looks best). Shown at the top of the event page.",
}: Props) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  const cloudinaryReady = !!cloudName && !!uploadPreset;

  const [url, setUrl] = useState<string>(defaultUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      // Cloudinary will auto-create a folder named "eventflow/banners"
      formData.append("folder", "eventflow/banners");

      // XMLHttpRequest so we can show progress (fetch doesn't expose upload progress)
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

  return (
    <div>
      <label className="label">{label}</label>
      {/* The actual form-submitted value */}
      <input type="hidden" name={name} value={url} />

      {/* Preview */}
      {url ? (
        <div className="mt-2 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Event banner preview" className="aspect-[16/6] w-full object-cover" />
        </div>
      ) : (
        <div className="mt-2 flex aspect-[16/6] w-full items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 ring-1 ring-slate-200">
          <span className="text-sm">No banner yet — upload or paste a URL below</span>
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
            onClick={() => { setUrl(""); setError(null); }}
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
