"use client";

import { useState } from "react";
import { AddressAutocompleteInput } from "@/components/AddressAutocompleteInput";

/**
 * Event Location card content — venue name, virtual toggle, virtual URL, and
 * the six physical-address inputs. Lives inside the parent <form action={...}>;
 * just renders inputs with the right `name` attributes and lets the surrounding
 * server action read them via FormData.
 *
 * Two reasons this is its own component instead of <AddressFields>:
 * 1. EventLocation uses `postalCode` not `zipCode` like everything else
 * 2. We need the isVirtual / virtualUrl / venueName inputs alongside the address
 */
interface Props {
  defaults?: {
    isVirtual?: boolean;
    virtualUrl?: string | null;
    venueName?: string | null;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  };
}

export function EventLocationFields({ defaults }: Props) {
  // Control these so the autocomplete can overwrite them when the user
  // picks a place from the dropdown. Other fields stay uncontrolled with
  // defaultValue for normal form-submission behavior.
  const [addressLine1, setAddressLine1] = useState(defaults?.addressLine1 ?? "");
  const [city, setCity] = useState(defaults?.city ?? "");
  const [state, setState] = useState(defaults?.state ?? "");
  const [postalCode, setPostalCode] = useState(defaults?.postalCode ?? "");
  const [country, setCountry] = useState(defaults?.country ?? "US");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isVirtual"
            value="1"
            defaultChecked={defaults?.isVirtual ?? false}
          />
          This is a virtual event
        </label>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Venue name</label>
        <input
          name="venueName"
          maxLength={200}
          defaultValue={defaults?.venueName ?? ""}
          className="input"
          placeholder="Acme Conference Center"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Address line 1</label>
        <AddressAutocompleteInput
          name="addressLine1"
          value={addressLine1}
          onChange={setAddressLine1}
          onPlaceSelected={(parsed) => {
            setAddressLine1(parsed.addressLine1);
            setCity(parsed.city);
            setState(parsed.state);
            setPostalCode(parsed.zipCode);
            setCountry(parsed.country);
          }}
          placeholder="123 Main St"
        />
      </div>
      <div>
        <label className="label">City</label>
        <input
          name="city"
          maxLength={100}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="input"
        />
      </div>
      <div>
        <label className="label">State</label>
        <input
          name="state"
          maxLength={100}
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="input"
        />
      </div>
      <div>
        <label className="label">Postal code</label>
        <input
          name="postalCode"
          maxLength={20}
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          className="input"
        />
      </div>
      <div>
        <label className="label">Country</label>
        <input
          name="country"
          maxLength={100}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="input"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Virtual URL (for virtual events)</label>
        <input
          name="virtualUrl"
          type="url"
          maxLength={500}
          defaultValue={defaults?.virtualUrl ?? ""}
          className="input"
          placeholder="https://zoom.us/j/..."
        />
      </div>
    </div>
  );
}
