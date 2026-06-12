/**
 * Shared time-range resolver for the financials pages. Turns ?range / ?from / ?to
 * search params into concrete Date bounds plus a chart bucket. Bounds are real
 * Dates so they can be passed as bound query parameters (no SQL injection surface).
 */
export type Bucket = "minute" | "hour" | "day" | "month";

export interface ResolvedRange {
  preset: string; // "1h".."all" or "custom"
  label: string;
  from?: Date;
  to?: Date;
  bucket: Bucket;
  labelFmt: string; // postgres to_char format for the bucket label
  customActive: boolean;
  fromStr?: string;
  toStr?: string;
}

export const RANGE_PRESETS: Record<string, { short: string; label: string; ms: number | null; bucket: Bucket; fmt: string }> = {
  "1h": { short: "1H", label: "Last hour", ms: 3_600_000, bucket: "minute", fmt: "HH24:MI" },
  "1d": { short: "1D", label: "Last 24 hours", ms: 86_400_000, bucket: "hour", fmt: "HH24:MI" },
  "1w": { short: "1W", label: "Last 7 days", ms: 7 * 86_400_000, bucket: "day", fmt: "MM-DD" },
  "1m": { short: "1M", label: "Last 30 days", ms: 30 * 86_400_000, bucket: "day", fmt: "MM-DD" },
  "1y": { short: "1Y", label: "Last 12 months", ms: 365 * 86_400_000, bucket: "month", fmt: "YYYY-MM" },
  all: { short: "All", label: "All time", ms: null, bucket: "month", fmt: "YYYY-MM" },
};
export const RANGE_ORDER = ["1h", "1d", "1w", "1m", "1y", "all"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveRange(sp: { range?: string; from?: string; to?: string }, nowMs: number): ResolvedRange {
  const raw = sp.range ?? "all";
  const fromStr = sp.from && DATE_RE.test(sp.from) ? sp.from : undefined;
  const toStr = sp.to && DATE_RE.test(sp.to) ? sp.to : undefined;
  const customActive = raw === "custom" && (!!fromStr || !!toStr);

  if (customActive) {
    const from = fromStr ? new Date(`${fromStr}T00:00:00.000Z`) : undefined;
    // inclusive end → midnight of the day after `to`
    const to = toStr ? new Date(new Date(`${toStr}T00:00:00.000Z`).getTime() + 86_400_000) : undefined;
    const spanDays = from && to ? (to.getTime() - from.getTime()) / 86_400_000 : 60;
    const bucket: Bucket = spanDays <= 2 ? "hour" : spanDays <= 62 ? "day" : "month";
    const labelFmt = bucket === "hour" ? "MM-DD HH24:MI" : bucket === "day" ? "MM-DD" : "YYYY-MM";
    return { preset: "custom", label: `${fromStr ?? "…"} → ${toStr ?? "…"}`, from, to, bucket, labelFmt, customActive: true, fromStr, toStr };
  }

  const presetKey = RANGE_PRESETS[raw] ? raw : "all";
  const p = RANGE_PRESETS[presetKey];
  const from = p.ms == null ? undefined : new Date(nowMs - p.ms);
  return { preset: presetKey, label: p.label, from, to: undefined, bucket: p.bucket, labelFmt: p.fmt, customActive: false };
}
