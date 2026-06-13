"use client";

// Catches errors thrown while rendering the root layout / React tree and reports
// them to Sentry. Must render its own <html>/<body> since it replaces the layout.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: "#64748b", marginTop: "0.5rem" }}>
          We&rsquo;ve been notified and are looking into it.
        </p>
        <button
          onClick={() => reset()}
          style={{ marginTop: "1.5rem", padding: "0.5rem 1rem", borderRadius: "0.5rem", background: "#1F3A8A", color: "white", border: 0, cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
