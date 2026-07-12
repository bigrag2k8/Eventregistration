"use client";

import { useState } from "react";

/**
 * Simple image field: upload to Cloudinary (unsigned preset) OR paste a URL,
 * with a live preview. Outputs a single hidden input (name={name}) holding the
 * resulting URL, so a surrounding server-action form picks it up unchanged.
 *
 * A pared-down sibling of BannerImageInput — no drag/zoom framing — for logos,
 * org banners, and any "just give me an image URL" field.
 */
interface Props {
  /** Hidden input name the surrounding form reads (e.g. "logoUrl"). */
  name: string;
  defaultUrl?: string | null;
  label: string;
  hint?: string;
  /** Preview aspect ratio, e.g. "3 / 1" (logo) or "16 / 6" (banner). */
  aspect?: string;
  previewFit?: "contain" | "cover";
  /** Cloudinary folder to upload into. */
  folder?: string;
  placeholder?: string;
}

export function ImageUploadInput({
  name,
  defaultUrl,
  label,
  hint,
  aspect = "16 / 6",
  previewFit = "cover",
  folder = "eventflow/brand",
  placeholder = "https://example.com/image.png",
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
      formData.append("folder", folder);

      const data: { secure_url?: string; error?: { message: string } } = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          try { resolve(JSON.parse(xhr.responseText)); } catch (err) { reject(err); }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      if (data.secure_url) setUrl(data.secure_url);
      else setError(data.error?.message ?? "Upload failed");
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
      <input type="hidden" name={name} value={url} />

      {url ? (
        <div className="mt-2 overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200" style={{ aspectRatio: aspect }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`${label} preview`}
            className={`h-full w-full ${previewFit === "contain" ? "object-contain p-2" : "object-cover"}`}
          />
        </div>
      ) : (
        <div
          className="mt-2 flex items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 ring-1 ring-slate-200"
          style={{ aspectRatio: aspect }}
        >
          <span className="text-sm">No image yet — upload or paste a URL</span>
        </div>
      )}

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

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
          {cloudinaryReady ? "Or paste a URL instead" : "Paste an image URL"}
        </summary>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={placeholder}
          className="input mt-2"
        />
      </details>

      {!cloudinaryReady && (
        <p className="mt-2 text-xs text-amber-700">
          Image upload isn&rsquo;t configured — paste a URL above, or ask your admin to set the Cloudinary env vars.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">⚠ {error}</p>}
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
