"use client";

import { useState } from "react";

function slugify(name: string) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

interface Props {
  /** form field name for the org display name */
  nameField?: string;
  /** form field name for the slug */
  slugField?: string;
  /** placeholder for the org name input */
  namePlaceholder?: string;
  /** placeholder for the slug input */
  slugPlaceholder?: string;
  /** prefix label shown before the slug input (e.g., "/o/") */
  slugPrefix?: string;
}

/**
 * Pair of inputs: organization name and URL slug.
 * As the user types the name, the slug auto-suggests (until they edit it manually).
 */
export function OrgNameSlugFields({
  nameField = "orgName",
  slugField = "orgSlug",
  namePlaceholder = "Acme Events",
  slugPlaceholder = "acme-events",
  slugPrefix = "/o/",
}: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  function onSlugChange(v: string) {
    setSlug(slugify(v));
    setSlugTouched(true);
  }

  return (
    <>
      <div>
        <label className="label">Organization name *</label>
        <input
          name={nameField}
          required
          maxLength={120}
          className="input"
          placeholder={namePlaceholder}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <div>
        <label className="label">URL slug *</label>
        <div className="flex items-stretch">
          <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-100 px-3 text-sm text-slate-500">
            {slugPrefix}
          </span>
          <input
            name={slugField}
            required
            pattern="[a-z0-9-]+"
            maxLength={60}
            className="input rounded-l-none"
            placeholder={slugPlaceholder}
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Lowercase letters, numbers, and dashes only. Used in their event URLs.
        </p>
      </div>
    </>
  );
}
