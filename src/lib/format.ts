import { formatInTimeZone } from "date-fns-tz";

export function formatDateRange(start: Date, end: Date, tz = "UTC") {
  const sameDay =
    formatInTimeZone(start, tz, "yyyy-MM-dd") ===
    formatInTimeZone(end, tz, "yyyy-MM-dd");

  if (sameDay) {
    return `${formatInTimeZone(start, tz, "EEE, MMM d · h:mm a")} – ${formatInTimeZone(end, tz, "h:mm a zzz")}`;
  }
  return `${formatInTimeZone(start, tz, "MMM d, h:mm a")} – ${formatInTimeZone(end, tz, "MMM d, h:mm a zzz")}`;
}

export function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
