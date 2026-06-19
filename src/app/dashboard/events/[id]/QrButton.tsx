"use client";

/**
 * Opens the event's QR code in a small separate window (not a full tab), so the
 * organizer can show/scan/copy it without leaving the event config page.
 */
export function QrButton({ href, className }: { href: string; className: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        window.open(href, "eventQr", "width=440,height=640,menubar=no,toolbar=no,location=no")
      }
      className={className}
    >
      QR code
    </button>
  );
}
