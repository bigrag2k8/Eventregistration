"use client";

import { useEffect, useRef, useState } from "react";

function slugify(name: string) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const REASON_TEXT: Record<string, string> = {
  too_short: "Must be at least 2 characters.",
  too_long: "Too long — keep it under 60 characters.",
  bad_chars: "Only lowercase letters, numbers, and dashes.",
  reserved: "That word is reserved. Try another.",
  taken: "Already taken. Try one of these:",
};

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "error"; reason: string; suggestions?: string[] };

interface Props {
  nameField?: string;
  slugField?: string;
  namePlaceholder?: string;
  slugPlaceholder?: string;
  /** Called whenever the slug's validity changes — parent can disable submit. */
  onValidityChange?: (valid: boolean) => void;
}

/**
 * Org name + URL slug picker with live availability check.
 *
 * - Types in name → slug auto-derives (until the user manually edits the slug)
 * - Every slug change pings /api/auth/check-slug after a 350ms debounce
 * - Shows ✓ available / ✗ taken|reserved|invalid + suggested alternatives
 * - Reports validity up so the parent form can disable the submit button
 */
export function OrgNameSlugFields({
  nameField = "orgName",
  slugField = "orgSlug",
  namePlaceholder = "Acme Events",
  slugPlaceholder = "acme-events",
  onValidityChange,
}: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Notify parent whenever validity changes
  useEffect(() => {
    const valid = check.status === "ok";
    onValidityChange?.(valid);
  }, [check.status, onValidityChange]);

  // Run the availability check after every slug change (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!slug) {
      setCheck({ status: "idle" });
      return;
    }
    if (slug.length < 2) {
      setCheck({ status: "error", reason: "too_short" });
      return;
    }

    setCheck({ status: "checking" });
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/auth/check-slug?slug=${encodeURIComponent(slug)}`, {
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (data.valid && data.available) {
          setCheck({ status: "ok" });
        } else {
          setCheck({
            status: "error",
            reason: data.reason ?? "taken",
            suggestions: data.suggestions ?? [],
          });
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") setCheck({ status: "error", reason: "taken" });
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slug]);

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }
  function onSlugChange(v: string) {
    setSlug(slugify(v));
    setSlugTouched(true);
  }
  function pickSuggestion(s: string) {
    setSlug(s);
    setSlugTouched(true);
  }

  const statusPill = (() => {
    switch (check.status) {
      case "checking":
        return <span className="text-xs text-slate-500">Checking…</span>;
      case "ok":
        return <span className="text-xs font-medium text-emerald-700">✓ Available</span>;
      case "error":
        return <span className="text-xs font-medium text-red-700">✗ {REASON_TEXT[check.reason] ?? "Not available"}</span>;
      default:
        return null;
    }
  })();

  const inputRing =
    check.status === "ok"
      ? "ring-emerald-300 focus:ring-emerald-500"
      : check.status === "error"
      ? "ring-red-300 focus:ring-red-500"
      : "ring-slate-300 focus:ring-brand-500";

  return (
    <>
      <div>
        <label className="label" htmlFor={nameField}>Organization name *</label>
        <input
          id={nameField}
          name={nameField}
          required
          maxLength={120}
          autoComplete="organization"
          className="input"
          placeholder={namePlaceholder}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor={slugField}>Your URL *</label>
          {statusPill}
        </div>
        <div className={`flex items-stretch rounded-lg ring-1 ${inputRing}`}>
          <span className="inline-flex items-center rounded-l-lg bg-slate-100 px-3 text-sm text-slate-500">
            yourevents.app/o/
          </span>
          <input
            id={slugField}
            name={slugField}
            required
            pattern="[a-z0-9-]+"
            maxLength={60}
            autoComplete="off"
            className="w-full rounded-r-lg border-0 bg-white px-3 py-2 text-sm outline-none"
            placeholder={slugPlaceholder}
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            aria-invalid={check.status === "error"}
          />
        </div>
        {check.status === "ok" && slug && (
          <p className="mt-1 text-xs text-emerald-700">
            Your event pages will live at <code className="rounded bg-emerald-50 px-1 font-mono">yourevents.app/o/{slug}</code>
          </p>
        )}
        {check.status === "error" && check.suggestions && check.suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Try:</span>
            {check.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => pickSuggestion(s)}
                className="rounded-full bg-brand-50 px-2.5 py-0.5 font-medium text-brand-700 hover:bg-brand-100"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {check.status === "idle" && (
          <p className="mt-1 text-xs text-slate-500">
            Lowercase letters, numbers, and dashes. This is the link you'll share with attendees.
          </p>
        )}
      </div>
    </>
  );
}
