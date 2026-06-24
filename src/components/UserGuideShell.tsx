"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Tiny client-side button that triggers the browser print dialog. Exported
 * separately so the /guide server-component page can render it without
 * smuggling event handlers across the server/client boundary.
 */
export function PrintGuideButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
      className={className || "text-slate-600 hover:text-brand-700"}
    >
      Print this guide
    </button>
  );
}

/**
 * Interactive shell for the long-form /guide page.
 *
 * - Sticky left sidebar: table of contents auto-extracted from h2/h3 headings
 *   inside the wrapped content.
 * - Search box: live-filters the TOC AND highlights matches in the body with
 *   a yellow background. Pressing Enter jumps to the first hit.
 * - Anchor links: every h2/h3 in the content gets an id from its text so deep
 *   links survive (?#paying-for-an-event etc.).
 *
 * Wrap any HTML-rich content as children — this component doesn't care what
 * the content actually is, just walks the DOM after mount to wire everything.
 */
interface Props {
  children: React.ReactNode;
}

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function UserGuideShell({ children }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);

  // Pass 1: assign ids to headings + extract TOC. Runs once after first paint.
  useEffect(() => {
    if (!contentRef.current) return;
    const used = new Set<string>();
    const entries: TocEntry[] = [];
    const headings = contentRef.current.querySelectorAll<HTMLHeadingElement>("h2, h3");
    headings.forEach((h) => {
      const text = (h.textContent ?? "").trim();
      let base = h.id || slugify(text);
      let id = base;
      let n = 1;
      while (used.has(id)) {
        n += 1;
        id = `${base}-${n}`;
      }
      used.add(id);
      h.id = id;
      h.classList.add("scroll-mt-24");
      entries.push({ id, text, level: h.tagName === "H2" ? 2 : 3 });
    });
    setToc(entries);
  }, [children]);

  // Highlight matches in body text. Wraps each occurrence in a <mark> with a
  // brand-yellow background. Restores original text when the query clears.
  useEffect(() => {
    if (!contentRef.current) return;
    const root = contentRef.current;

    // First, unwrap any previous highlights.
    root.querySelectorAll<HTMLElement>("mark[data-guide-hit]").forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });

    if (!query.trim()) {
      setMatchCount(null);
      return;
    }

    const needle = query.trim();
    const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let count = 0;

    // Walk text nodes only — skip script/style/code so we don't mangle markup.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "MARK") return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !re.test(node.nodeValue)) {
          re.lastIndex = 0;
          return NodeFilter.FILTER_REJECT;
        }
        re.lastIndex = 0;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const targets: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) targets.push(n as Text);

    targets.forEach((node) => {
      const raw = node.nodeValue ?? "";
      const frag = document.createDocumentFragment();
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) {
        if (m.index > last) frag.appendChild(document.createTextNode(raw.slice(last, m.index)));
        const mark = document.createElement("mark");
        mark.dataset.guideHit = "1";
        mark.style.background = "#fde68a";
        mark.style.padding = "0 2px";
        mark.style.borderRadius = "2px";
        mark.appendChild(document.createTextNode(m[0]));
        frag.appendChild(mark);
        last = m.index + m[0].length;
        count += 1;
      }
      if (last < raw.length) frag.appendChild(document.createTextNode(raw.slice(last)));
      node.parentNode?.replaceChild(frag, node);
    });

    setMatchCount(count);
  }, [query]);

  // Filtered TOC: when the user types a search, drop entries that don't match
  // the query (case-insensitive). Helps narrow the sidebar to relevant areas.
  const visibleToc = useMemo(() => {
    if (!query.trim()) return toc;
    const q = query.trim().toLowerCase();
    return toc.filter((t) => t.text.toLowerCase().includes(q));
  }, [toc, query]);

  // Track scroll position so the active section in the TOC highlights.
  useEffect(() => {
    if (toc.length === 0) return;
    function onScroll() {
      const positions = toc
        .map((t) => {
          const el = document.getElementById(t.id);
          if (!el) return null;
          return { id: t.id, top: el.getBoundingClientRect().top };
        })
        .filter((p): p is { id: string; top: number } => p !== null);
      const active = positions.filter((p) => p.top < 120).pop();
      setActiveId(active?.id ?? toc[0].id);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [toc]);

  function jumpToFirstHit() {
    if (!query.trim()) return;
    const hit = contentRef.current?.querySelector<HTMLElement>("mark[data-guide-hit]");
    if (hit) hit.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[260px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
        <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <label className="label text-xs">Search the guide</label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") jumpToFirstHit(); }}
            placeholder="e.g. refund, vendor, check-in"
            className="input mt-1 text-sm"
          />
          {matchCount !== null && (
            <p className="mt-2 text-xs text-slate-500">
              {matchCount === 0
                ? "No matches found"
                : `${matchCount} match${matchCount === 1 ? "" : "es"} — press Enter to jump`}
            </p>
          )}
          <nav className="mt-4 space-y-1 text-sm">
            {visibleToc.length === 0 ? (
              <p className="text-xs text-slate-400">No sections match.</p>
            ) : (
              visibleToc.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className={`block rounded px-2 py-1 leading-snug transition ${
                    t.level === 3 ? "ml-3 text-xs text-slate-500" : "font-medium"
                  } ${
                    activeId === t.id
                      ? "bg-brand-50 text-brand-800"
                      : "text-slate-700 hover:bg-slate-50 hover:text-brand-700"
                  }`}
                >
                  {t.text}
                </a>
              ))
            )}
          </nav>
        </div>
      </aside>

      <article ref={contentRef} className="guide-content max-w-none">
        {children}
      </article>
      {/* Standalone CSS so we don't depend on @tailwindcss/typography being
          installed. Styles bare HTML elements inside .guide-content with
          sensible vertical rhythm, list rendering, and link styling. */}
      <style>{`
        .guide-content { color: #334155; line-height: 1.65; font-size: 16px; }
        .guide-content h1 { font-size: 2rem; font-weight: 700; color: #0f172a; margin: 2.5rem 0 1rem; scroll-margin-top: 6rem; }
        .guide-content h2 {
          font-size: 1.75rem; font-weight: 700; color: #0f172a;
          margin: 3rem 0 1rem; padding-top: 2rem;
          border-top: 1px solid #e2e8f0; scroll-margin-top: 6rem;
        }
        .guide-content h2:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
        .guide-content h3 {
          font-size: 1.25rem; font-weight: 600; color: #0f172a;
          margin: 2rem 0 0.75rem; scroll-margin-top: 6rem;
        }
        .guide-content p { margin: 0 0 1.1rem; }
        .guide-content ul, .guide-content ol { margin: 0.25rem 0 1.25rem; padding-left: 1.5rem; }
        .guide-content ul { list-style: disc; }
        .guide-content ol { list-style: decimal; }
        .guide-content li { margin: 0.35rem 0; padding-left: 0.25rem; }
        .guide-content li::marker { color: #205aea; }
        .guide-content strong { color: #0f172a; font-weight: 600; }
        .guide-content code {
          background: #f1f5f9; color: #1947c8; padding: 0.1rem 0.35rem;
          border-radius: 4px; font-size: 0.92em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .guide-content a { color: #1947c8; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
        .guide-content a:hover { color: #205aea; }
        .guide-content dl { margin: 0 0 1.25rem; }
        .guide-content dt { margin-top: 0.85rem; }
        .guide-content dd { margin: 0.15rem 0 0 1rem; color: #475569; }
        .guide-content kbd {
          background: #f1f5f9; border: 1px solid #cbd5e1; border-bottom-width: 2px;
          border-radius: 4px; padding: 0.05rem 0.35rem; font-size: 0.85em;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        @media print {
          aside { display: none !important; }
          .guide-content { font-size: 11pt; }
        }
      `}</style>
    </div>
  );
}
