"use client";

import { useEffect, useRef, useState } from "react";
import { hasGoogleMapsKey, loadGoogleMaps, parseAddressComponents } from "@/lib/google-maps-loader";

/**
 * Self-managed mailing-address section. Renders the six address inputs with
 * the right `name` attributes for native form submission, wires Google Places
 * Autocomplete onto the street-address input, and imperatively fills the
 * other fields when the user picks a suggestion. Used in server-action forms
 * (settings, team-edit, vendor-edit, signup) where the parent doesn't manage
 * address state in React.
 *
 * Falls back to plain inputs if Google Maps fails to load (missing/blocked
 * API key, ad-blocker, offline) so the form is never broken.
 */
interface Props {
  defaults?: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    country?: string | null;
  };
  required?: boolean;
}

export function AddressFields({ defaults, required }: Props) {
  const line1 = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const countryRef = useRef<HTMLInputElement>(null);

  // 'loading' | 'ready' | 'unavailable' — drives a small hint under the
  // street-address field so the user knows whether suggestions will appear.
  type AcStatus = "loading" | "ready" | "unavailable";
  const [status, setStatus] = useState<AcStatus>(
    hasGoogleMapsKey() ? "loading" : "unavailable"
  );

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !line1.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g: any = (window as any).google;
        const ac = new g.maps.places.Autocomplete(line1.current, {
          types: ["address"],
          fields: ["address_components"],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const parsed = parseAddressComponents(place);
          if (line1.current) line1.current.value = parsed.addressLine1;
          if (cityRef.current) cityRef.current.value = parsed.city;
          if (stateRef.current) stateRef.current.value = parsed.state;
          if (zipRef.current) zipRef.current.value = parsed.zipCode;
          if (countryRef.current) countryRef.current.value = parsed.country;
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

  const star = required ? <span aria-hidden> *</span> : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Street address{star}</label>
        <input
          ref={line1}
          name="addressLine1"
          required={required}
          maxLength={200}
          defaultValue={defaults?.addressLine1 ?? ""}
          placeholder={
            status === "ready"
              ? "Start typing your address"
              : status === "loading"
              ? "Loading address suggestions…"
              : "Enter your street address"
          }
          className="input"
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
      </div>
      <div className="sm:col-span-2">
        <label className="label">Address line 2</label>
        <input
          name="addressLine2"
          maxLength={200}
          defaultValue={defaults?.addressLine2 ?? ""}
          placeholder="Suite, unit, etc. (optional)"
          className="input"
        />
      </div>
      <div>
        <label className="label">City{star}</label>
        <input
          ref={cityRef}
          name="city"
          required={required}
          maxLength={100}
          defaultValue={defaults?.city ?? ""}
          className="input"
        />
      </div>
      <div>
        <label className="label">State / Province{star}</label>
        <input
          ref={stateRef}
          name="state"
          required={required}
          maxLength={100}
          defaultValue={defaults?.state ?? ""}
          className="input"
        />
      </div>
      <div>
        <label className="label">ZIP / Postal code{star}</label>
        <input
          ref={zipRef}
          name="zipCode"
          required={required}
          maxLength={20}
          defaultValue={defaults?.zipCode ?? ""}
          className="input"
        />
      </div>
      <div>
        <label className="label">Country{star}</label>
        <input
          ref={countryRef}
          name="country"
          required={required}
          maxLength={100}
          defaultValue={defaults?.country ?? "United States"}
          className="input"
        />
      </div>
    </div>
  );
}
