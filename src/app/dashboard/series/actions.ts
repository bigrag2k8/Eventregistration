"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { materializeOccurrences } from "@/server/series";

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const schema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(4000).optional(),
  category: z.string().max(60).optional(),
  timezone: z.string().min(1).max(64),
  isPrivate: z.string().optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  interval: z.coerce.number().int().min(1).max(52),
  monthlyMode: z.enum(["DAY_OF_MONTH", "NTH_WEEKDAY"]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(HHMM),
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  occurrenceCap: z.coerce.number().int().min(1).max(400).optional().or(z.literal("")),
  ticketName: z.string().min(1).max(80),
  priceDollars: z.coerce.number().min(0).max(100000),
  capacity: z.coerce.number().int().min(1).max(1000000).optional().or(z.literal("")),
  bundlePriceDollars: z.coerce.number().min(0.5).max(1000000).optional().or(z.literal("")),
  // Banner + location template (EventLocationFields / ImageUploadInput names).
  bannerUrl: z.string().url().max(500).optional().or(z.literal("")),
  isVirtual: z.string().optional(),
  virtualUrl: z.string().url().max(500).optional().or(z.literal("")),
  venueName: z.string().max(200).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
});

function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) ||
    "series"
  );
}
async function uniqueSeriesSlug(organizationId: string, base: string): Promise<string> {
  let slug = base;
  let n = 1;
  // Bounded loop — a handful of collisions at most in practice.
  while (await prisma.eventSeries.findFirst({ where: { organizationId, slug }, select: { id: true } })) {
    slug = `${base}-${++n}`;
    if (n > 50) { slug = `${base}-${Date.now()}`; break; }
  }
  return slug;
}

export async function createSeriesAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization linked");

  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) redirect("/dashboard/series/new?error=validation");
  const d = parsed.data;

  const byWeekday =
    d.frequency === "WEEKLY"
      ? formData.getAll("byWeekday").map((v) => Number(v)).filter((n) => n >= 0 && n <= 6)
      : [];
  if (d.frequency === "WEEKLY" && byWeekday.length === 0) redirect("/dashboard/series/new?error=weekday_required");

  const [hh, mm] = d.startTime.split(":").map(Number);
  const startTimeMinutes = hh * 60 + mm;
  // Store the series start/end at local NOON of the chosen day — the rule engine
  // only reads the calendar date from these (time-of-day lives in
  // startTimeMinutes), and noon is unambiguous across every DST transition.
  const seriesStart = fromZonedTime(`${d.startDate} 12:00:00`, d.timezone);
  const seriesEnd = d.endDate ? fromZonedTime(`${d.endDate} 12:00:00`, d.timezone) : null;

  const org = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: { slug: true, seriesCredits: true },
  });
  if (!org) throw new Error("Organization not found");
  const slug = await uniqueSeriesSlug(session.orgId, slugify(d.name));

  // ── Free vs premium gate ────────────────────────────────────────────────
  // Free tier: ONE active free series at a time (occurrences get the free-event
  // entitlements: 50 regs/session, no branding, drop-in only). Anything beyond
  // that — a second concurrent series, or wanting the full-series bundle —
  // requires spending a $34.99 series credit, which makes the series PREMIUM.
  const wantsBundle = !!d.bundlePriceDollars;
  const activeFreeSeries = await prisma.eventSeries.count({
    where: { organizationId: session.orgId, status: "ACTIVE", isPremium: false, deletedAt: null },
  });
  const needsCredit = wantsBundle || activeFreeSeries >= 1;
  const isPremium = needsCredit;

  // Credit spend + series create in ONE transaction, so a failed create can
  // never consume a credit (and a race on the last credit can't double-spend).
  let series;
  try {
    series = await prisma.$transaction(async (tx) => {
      if (needsCredit) {
        const spent = await tx.organization.updateMany({
          where: { id: session.orgId!, seriesCredits: { gt: 0 } },
          data: { seriesCredits: { decrement: 1 } },
        });
        if (spent.count === 0) throw new Error("NO_CREDIT");
      }
      return tx.eventSeries.create({
        data: {
          organizationId: session.orgId!,
          name: d.name,
          slug,
          description: d.description || d.name,
          category: d.category || null,
          timezone: d.timezone,
          isPrivate: d.isPrivate === "on",
          bannerUrl: d.bannerUrl || null,
          // Location template — copied onto every occurrence.
          isVirtual: d.isVirtual === "1" || d.isVirtual === "on",
          virtualUrl: d.virtualUrl || null,
          venueName: d.venueName?.trim() || null,
          addressLine1: d.addressLine1?.trim() || null,
          city: d.city?.trim() || null,
          state: d.state?.trim() || null,
          postalCode: d.postalCode?.trim() || null,
          country: d.country?.trim() || null,
          frequency: d.frequency,
          interval: d.interval,
          byWeekday,
          monthlyMode: d.frequency === "MONTHLY" ? (d.monthlyMode ?? "DAY_OF_MONTH") : null,
          startTimeMinutes,
          durationMinutes: d.durationMinutes,
          seriesStart,
          seriesEnd,
          occurrenceCap: d.occurrenceCap ? Number(d.occurrenceCap) : null,
          ticketName: d.ticketName,
          priceCents: Math.round(d.priceDollars * 100),
          capacity: d.capacity ? Number(d.capacity) : null,
          // Full-series pass: PREMIUM-only, and only on a BOUNDED series ("all
          // sessions" must be finite) — silently dropped otherwise.
          bundlePriceCents:
            isPremium && d.bundlePriceDollars && (seriesEnd || d.occurrenceCap)
              ? Math.round(Number(d.bundlePriceDollars) * 100)
              : null,
          isPremium,
          status: "ACTIVE", // active immediately → worker + the call below generate occurrences
        },
      });
    });
  } catch (e: any) {
    if (e?.message === "NO_CREDIT") redirect("/dashboard/series/new?error=series_credit_required");
    throw e;
  }

  // Generate the first horizon now so the organizer sees occurrences right away
  // (the worker keeps rolling it forward every tick).
  const horizon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const created = await materializeOccurrences(series.id, horizon).catch(() => 0);

  await audit({
    organizationId: session.orgId, userId: session.sub,
    action: "series.create", targetType: "EventSeries", targetId: series.id,
    metadata: { name: d.name, frequency: d.frequency, firstBatch: created },
  });

  revalidatePath(`/o/${org.slug}`);
  redirect(`/o/${org.slug}/series/${slug}`);
}

/**
 * Delete a recurring series. Guard: if any FUTURE occurrence has confirmed
 * registrations, block — those attendees hold tickets, so the organizer must
 * Cancel those sessions first (which refunds + notifies). Otherwise:
 *   - soft-delete every future zero-registration occurrence (auto-generated
 *     inventory nobody bought into), same deletedAt+CANCELLED shape as the
 *     event deleteAction — the refund worker ignores these (no cancelledAt);
 *   - soft-delete the series itself so generation stops and the public
 *     card/page disappear. PAST occurrences are kept untouched as history.
 */
export async function deleteSeriesAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const seriesId = String(formData.get("seriesId"));
  const series = await prisma.eventSeries.findFirst({
    where: {
      id: seriesId,
      deletedAt: null,
      ...(session.role === "SUPERADMIN" ? {} : { organizationId: session.orgId ?? "__none__" }),
    },
    select: { id: true, name: true, organizationId: true, slug: true },
  });
  if (!series) redirect("/dashboard?error=not_found");

  const now = new Date();
  const futureWithRegs = await prisma.event.count({
    where: {
      seriesId: series.id,
      deletedAt: null,
      endAt: { gte: now },
      registrations: { some: { status: "CONFIRMED" } },
    },
  });
  if (futureWithRegs > 0) redirect("/dashboard?error=series_has_registrations");

  await prisma.event.updateMany({
    where: { seriesId: series.id, deletedAt: null, endAt: { gte: now } },
    data: { deletedAt: now, status: "CANCELLED" },
  });
  await prisma.eventSeries.update({
    where: { id: series.id },
    data: { deletedAt: now, status: "ENDED" },
  });
  await audit({
    organizationId: series.organizationId, userId: session.sub,
    action: "series.delete", targetType: "EventSeries", targetId: series.id,
    metadata: { name: series.name, slug: series.slug },
  });

  const org = await prisma.organization.findUnique({ where: { id: series.organizationId }, select: { slug: true } });
  if (org) revalidatePath(`/o/${org.slug}`);
  revalidatePath("/dashboard");
  redirect("/dashboard?saved=1");
}
