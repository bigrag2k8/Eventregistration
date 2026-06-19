"use client";

import { useState } from "react";

/**
 * Copy + close controls for the QR popup window. "Copy" puts the QR image on the
 * clipboard when the browser allows it, otherwise it copies the link as a
 * fallback. "Close" closes the popup window it was opened in.
 */
export function QrActions({ dataUrl, link, fileName }: { dataUrl: string; link: string; fileName: string }) {
  const [status, setStatus] = useState<string | null>(null);

  async function copy() {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setStatus("QR image copied");
    } catch {
      try {
        await navigator.clipboard.writeText(link);
        setStatus("Link copied");
      } catch {
        setStatus("Copy not supported");
      }
    }
    setTimeout(() => setStatus(null), 2000);
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          {status ?? "Copy"}
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="flex-1 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          Close
        </button>
      </div>
      <a href={dataUrl} download={fileName} className="block text-center text-xs text-slate-500 hover:text-slate-700">
        Download PNG
      </a>
    </div>
  );
}
