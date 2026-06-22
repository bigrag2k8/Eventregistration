"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps, parseAddressComponents, type ParsedAddress } from "@/lib/google-maps-loader";

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
      })
      .catch(() => {
        // Silent fallback to plain input.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      id={id}
      name={name}
      required={required}
      placeholder={placeholder}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
    />
  );
}
