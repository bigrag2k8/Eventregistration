"use client";

import { useState } from "react";

/**
 * Brand-color field: a hex text input paired with a clickable swatch that opens
 * the native color picker. The two stay in sync — pick a color and the hex
 * updates; type/paste a hex and the swatch updates. Submits the hex via a single
 * input named {name}. Blank = use the platform default.
 */
interface Props {
  name?: string;
  defaultValue?: string | null;
  /** Color shown in the picker (and swatch) when the field is blank/invalid. */
  fallback?: string;
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

export function BrandColorInput({ name = "brandColor", defaultValue, fallback = "#1F3A8A" }: Props) {
  const [value, setValue] = useState<string>(defaultValue ?? "");
  // <input type="color"> requires a valid #rrggbb — fall back when blank/typing.
  const swatch = HEX6.test(value) ? value : fallback;

  return (
    <div className="flex items-center gap-3">
      <input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input flex-1 font-mono"
        placeholder={fallback}
        maxLength={7}
        aria-label="Brand color hex"
      />
      <label
        className="relative h-10 w-12 shrink-0 cursor-pointer rounded ring-1 ring-slate-300"
        style={{ backgroundColor: swatch }}
        title="Click to pick a color"
      >
        <input
          type="color"
          value={swatch}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Pick brand color"
        />
      </label>
    </div>
  );
}
