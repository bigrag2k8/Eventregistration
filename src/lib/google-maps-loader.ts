/**
 * Singleton loader for the Google Maps JS API. Multiple components can call
 * loadGoogleMaps() and the script tag is only inserted once; concurrent callers
 * share the same in-flight promise. Returns a rejected promise when the API
 * key isn't configured so callers can silently fall back to a plain input.
 *
 * The key is read from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY at module-load time
 * (Next inlines it into the client bundle). Restrict the key in Google Cloud
 * Console to: Places API + Maps JS API, HTTP referrer = yourevents.app and
 * www.yourevents.app, plus localhost:3000/* for local dev.
 */

let scriptPromise: Promise<void> | null = null;

/**
 * Cheap sync check for the build-time variable. Components use this for the
 * initial "loading" vs "unavailable" state — the loader itself will also try
 * the runtime fallback if the build-time var is missing, so this can return
 * false and the script may still load successfully a moment later.
 */
export function hasGoogleMapsKey(): boolean {
  return !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
}

async function resolveKey(): Promise<string | null> {
  // Build-time inlined value — preferred because no network round-trip.
  const buildKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (buildKey) return buildKey;

  // Runtime fallback: ask the server, which reads the env at request time.
  // Lets autocomplete come online without a rebuild when the var is added
  // to Railway after a build (a common source of confusion).
  try {
    const res = await fetch("/api/config/maps-key", { cache: "force-cache" });
    if (!res.ok) return null;
    const data = (await res.json()) as { key?: string | null };
    return data.key || null;
  } catch {
    return null;
  }
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  // Already loaded
  const w = window as unknown as { google?: { maps?: { places?: unknown } } };
  if (w.google?.maps?.places) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = (async () => {
    const key = await resolveKey();
    if (!key) {
      console.warn(
        "[YourEvents] Address autocomplete disabled — no Google Maps API key found. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (or GOOGLE_MAPS_API_KEY for runtime-only) on Railway and redeploy."
      );
      // Reset so a later retry (e.g. after a deploy) can try again.
      scriptPromise = null;
      throw new Error("no-key");
    }

    return new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-google-maps-loader="true"]'
      );
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => {
          scriptPromise = null;
          reject(new Error("script-load-failed"));
        });
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        key
      )}&libraries=places&v=weekly&loading=async`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMapsLoader = "true";
      script.onload = () => {
        const wg = window as unknown as { google?: { maps?: { places?: unknown } } };
        if (!wg.google?.maps?.places) {
          console.warn(
            "[YourEvents] Google Maps loaded but Places library is missing — check the Cloud Console restrictions on the key."
          );
          reject(new Error("places-missing"));
          return;
        }
        resolve();
      };
      script.onerror = () => {
        scriptPromise = null;
        console.warn(
          "[YourEvents] Google Maps script failed to load — could be an ad-blocker, network issue, or the key has HTTP referrer restrictions that exclude this origin."
        );
        reject(new Error("script-load-failed"));
      };
      document.head.appendChild(script);
    });
  })();

  return scriptPromise;
}

export interface ParsedAddress {
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

/**
 * Pulls structured fields out of a Google Places PlaceResult. Falls back
 * gracefully when components are missing — e.g. some rural addresses lack a
 * locality, in which case we try sublocality or postal_town.
 */
export function parseAddressComponents(place: {
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
}): ParsedAddress {
  const components = place.address_components ?? [];
  const get = (type: string, useShort = false): string => {
    const c = components.find((x) => x.types.includes(type));
    if (!c) return "";
    return useShort ? c.short_name : c.long_name;
  };

  const streetNumber = get("street_number");
  const route = get("route");
  const addressLine1 = [streetNumber, route].filter(Boolean).join(" ");

  return {
    addressLine1,
    city: get("locality") || get("sublocality") || get("postal_town"),
    state: get("administrative_area_level_1", true),
    zipCode: get("postal_code"),
    country: get("country"),
  };
}
