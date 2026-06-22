"use client";

import { useEffect, useRef, useState } from "react";
import { hasGoogleMapsKey, loadGoogleMaps, parseAddressComponents, type ParsedAddress } from "@/lib/google-maps-loader";

/**
 * Controlled single-input variant of the address autocomplete. Drop in where
 * the parent already owns address state in React (vendor application form,
 * attendee registration form). The parent receives a callback with all the
 * parsed components when the user picks a suggestion.
 *
 * The input itself is fully controlled — the parent re-renders with the new
 * value. Useful when the surrounding form needs to validate or transform the
 * address on every keystroke.
 */
interface Props {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected: (parsed: ParsedAddress) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  name?: string;
  id?: string;
}

export function AddressAutocompleteInput({
  value,
  onChange,
  onPlaceSelected,
  required,
  placeholder = "Start typing your address",
  className = "input",
  name,
  id,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Hold the latest onPlaceSelected so the autocomplete (initialized once on
  // mount) always calls the parent's freshest setter — avoids stale closures
  // when the parent re-renders.
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  useEffect(() => {
    onPlaceSelectedRef.current = onPlaceSelected;
  }, [onPlaceSelected]);

  // Always begin in loading — the loader will try the runtime fallback even
  // when the build-time var is missing, so an early "unavailable" verdict
  // would hide a perfectly working autocomplete.
  type AcStatus = "loading" | "ready" | "unavailable";
  const [status, setStatus] = useState<AcStatus>("loading");
  void hasGoogleMapsKey;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !inputRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g: any = (window as any).google;
        const ac = new g.maps.places.Autocomplete(inputRef.current, {
          types: ["address"],
          fields: ["address_components"],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const parsed = parseAddressComponents(place);
          onPlaceSelectedRef.current(parsed);
        });
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedPlaceholder =
    status === "ready"
      ? placeholder
      : status === "loading"
      ? "Loading address suggestions…"
      : "Enter your street address";

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        required={required}
        placeholder={resolvedPlaceholder}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {status === "ready" && (
        <p className="mt-1 text-xs text-emerald-700">
          Type to see suggestions — picking one will fill the other fields.
        </p>
      )}
      {status === "unavailable" && (
        <p className="mt-1 text-xs text-amber-700">
          Address suggestions unavailable — please fill in each field manually.
        </p>
      )}
    </>
  );
}
