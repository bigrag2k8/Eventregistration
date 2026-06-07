"use client";

export function ShareBar({ url, name }: { url: string; name: string }) {
  const enc = encodeURIComponent;
  return (
    <div className="mt-10 flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-slate-600">Share:</span>
      <a className="btn-secondary" target="_blank" rel="noreferrer"
         href={`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`}>Facebook</a>
      <a className="btn-secondary" target="_blank" rel="noreferrer"
         href={`https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(name)}`}>X</a>
      <a className="btn-secondary" target="_blank" rel="noreferrer"
         href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`}>LinkedIn</a>
      <a className="btn-secondary" href={`mailto:?subject=${enc(name)}&body=${enc(url)}`}>Email</a>
      <button
        className="btn-secondary"
        onClick={async () => { await navigator.clipboard.writeText(url); }}
      >Copy link</button>
    </div>
  );
}
