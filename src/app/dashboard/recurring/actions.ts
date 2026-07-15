"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getSession, requireRole, orgScope } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { materializeOccurrences, computeOccurrences, ruleForRecurringEvent } from "@/server/recurring-events";

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

/**
 * Editable fields of an existing recurring event (slice 1). The SCHEDULE
 * (frequency/interval/days/time/dates/timezone) and the SLUG are deliberately
 * NOT here: schedule changes need occurrence regeneration (slice 2), and the
 * slug is the public URL.
 */
const editSchema = z.object({
  recurringEventId: z.string().min(1),
  name: z.string().min(2).max(120),
  description: z.string().max(4000).optional(),
  category: z.string().max(60).optional(),
  isPrivate: z.string().optional(),
  ticketName: z.string().min(1).max(80),
  priceDollars: z.coerce.number().min(0).max(100000),
  capacity: z.coerce.number().int().min(1).max(1000000).optional().or(z.literal("")),
  bundlePriceDollars: z.coerce.number().min(0.5).max(1000000).optional().or(z.literal("")),
  bannerUrl: z.string().url().max(500).optional().or(z.literal("")),
  isVirtual: z.string().optional(),
  virtualUrl: z.string().url().max(500).optional().or(z.literal("")),
  venueName: z.string().max(200).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  propagate: z.string().optional(),
  // Run length. Extending is free (new indexes just get materialized);
  // shortening drops the now-out-of-range tail (see pruneOutOfRange).
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  occurrenceCap: z.coerce.number().int().min(1).max(400).optional().or(z.literal("")),
});

/**
 * After the run length shrinks, sessions past the new end/cap are still in the
 * DB — the materializer only ever CREATES. Remove the ones that are pure
 * generated data (no registrations at all, not even abandoned PENDING ones)
 * and report any that had to stay.
 *
 * These are HARD deletes on purpose. A soft delete would leave the row holding
 * its unique (organizationId, slug), so re-extending the run later would hit
 * that constraint and silently skip the date — the session would never come
 * back. A zero-registration occurrence has no money, no tickets and no
 * attendees attached, so there is nothing to preserve.
 */
async function pruneOutOfRange(recurringEventId: string, validIndexes: Set<number>) {
  const now = new Date();
  const future = await prisma.event.findMany({
    where: { recurringEventId, deletedAt: null, endAt: { gte: now } },
    select: { id: true, occurrenceIndex: true, startAt: true, _count: { select: { registrations: true } } },
  });
  let removed = 0;
  const keptWithRegs: string[] = [];
  for (const ev of future) {
    if (ev.occurrenceIndex == null || validIndexes.has(ev.occurrenceIndex)) continue; // still in range
    if (ev._count.registrations > 0) {
      keptWithRegs.push(ev.startAt.toISOString().slice(0, 10));
      continue;
    }
    await prisma.event.delete({ where: { id: ev.id } });
    removed += 1;
  }
  return { removed, keptWithRegs };
}

/**
 * Stop an ACTIVE recurring event from generating any more sessions, without
 * touching the sessions it has already created — they stay published and
 * sellable so committed attendees keep their dates. This is the only way to
 * retire an OPEN-ENDED recurring event: the worker only auto-ENDs bounded ones
 * (when their last date passes), and delete is blocked while any future session
 * holds registrations, so before this an open-ended run generated forever.
 * Reversible via reactivateRecurringEventAction.
 */
export async function endRecurringEventAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const id = String(formData.get("recurringEventId") ?? "");
  const re = await prisma.recurringEvent.findFirst({
    where: { id, ...orgScope(session), deletedAt: null },
  });
  if (!re) redirect("/dashboard?error=not_found");
  if (re.status !== "ENDED") {
    await prisma.recurringEvent.update({ where: { id: re.id }, data: { status: "ENDED" } });
    await audit({
      organizationId: re.organizationId,
      userId: session.sub,
      action: "recurring.end",
      targetType: "RecurringEvent",
      targetId: re.id,
      metadata: { name: re.name },
    });
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard/recurring/${re.id}/edit?ended=1`);
}

/** Undo an End: generation resumes on the next worker tick. */
export async function reactivateRecurringEventAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const id = String(formData.get("recurringEventId") ?? "");
  const re = await prisma.recurringEvent.findFirst({
    where: { id, ...orgScope(session), deletedAt: null },
  });
  if (!re) redirect("/dashboard?error=not_found");
  if (re.status !== "ACTIVE") {
    await prisma.recurringEvent.update({ where: { id: re.id }, data: { status: "ACTIVE" } });
    // Fill the horizon straight away so the organizer sees sessions return.
    await materializeOccurrences(re.id, new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)).catch(() => 0);
    await audit({
      organizationId: re.organizationId,
      userId: session.sub,
      action: "recurring.reactivate",
      targetType: "RecurringEvent",
      targetId: re.id,
      metadata: { name: re.name },
    });
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard/recurring/${re.id}/edit?reactivated=1`);
}

/**
 * Update a recurring event's template and (optionally) push the change down to
 * its UPCOMING sessions. Propagation rules, deliberately conservative:
 *   • only future, non-cancelled, non-deleted sessions — history is never rewritten
 *   • capacity is SKIPPED on any session that has already sold more than the new
 *     value (never corrupt seat math); everything else still applies there
 *   • only the drop-in tier the materializer created (oldest non-vendor tier) is
 *     touched — tiers an organizer added to one session by hand are left alone
 *   • the all-sessions pass price lives only on the recurring event (read at
 *     checkout), so it needs no per-session push
 * Already-sold tickets are unaffected by a price change: their Payment rows are
 * historical. Only NEW buyers of a future session pay the new price.
 */
export async function updateRecurringEventAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization linked");

  const id = String(formData.get("recurringEventId") ?? "");
  const parsed = editSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/dashboard/recurring/${id}/edit?error=validation`);
  const d = parsed.data;

  const re = await prisma.recurringEvent.findFirst({
    where: { id: d.recurringEventId, ...orgScope(session), deletedAt: null },
  });
  if (!re) redirect("/dashboard?error=not_found");

  const priceCents = Math.round(d.priceDollars * 100);
  const capacity = d.capacity === "" || d.capacity === undefined ? null : Number(d.capacity);
  const isPrivate = d.isPrivate === "on" || d.isPrivate === "1";
  const isVirtual = d.isVirtual === "1" || d.isVirtual === "on";
  const venueName = d.venueName?.trim() || null;
  const addressLine1 = d.addressLine1?.trim() || null;
  const city = d.city?.trim() || null;
  const state = d.state?.trim() || null;
  const postalCode = d.postalCode?.trim() || null;
  const country = d.country?.trim() || null;

  // All-sessions pass keeps its create-time rules: PREMIUM only, and only on a
  // BOUNDED recurring event (an open-ended one has no finite "all sessions").
  // Run length. Stored at LOCAL NOON in the recurring event's timezone, exactly
  // like create — the rule reads only the date, and noon is unambiguous across
  // every DST transition.
  const seriesEnd = d.endDate ? fromZonedTime(`${d.endDate} 12:00:00`, re.timezone) : null;
  const occurrenceCap = d.occurrenceCap === "" || d.occurrenceCap === undefined ? null : Number(d.occurrenceCap);

  const bounded = !!(seriesEnd || occurrenceCap);
  const bundlePriceCents =
    re.isPremium && d.bundlePriceDollars && bounded ? Math.round(Number(d.bundlePriceDollars) * 100) : null;

  await prisma.recurringEvent.update({
    where: { id: re.id },
    data: {
      seriesEnd,
      occurrenceCap,
      name: d.name,
      description: d.description || d.name,
      category: d.category || null,
      bannerUrl: d.bannerUrl || null,
      isPrivate,
      isVirtual,
      virtualUrl: d.virtualUrl || null,
      venueName,
      addressLine1,
      city,
      state,
      postalCode,
      country,
      ticketName: d.ticketName,
      priceCents,
      capacity,
      bundlePriceCents,
    },
  });

  // Mirrors materializeOccurrences: a physical location needs street + city
  // (EventLocation requires them); a virtual one just needs the flag. When
  // there's nothing usable we leave each session's existing location alone.
  const hasPhysical = !!(addressLine1 && city);
  const locationData = isVirtual
    ? { isVirtual: true, virtualUrl: d.virtualUrl || null, venueName, addressLine1: addressLine1 ?? "", city: city ?? "", state, postalCode, country: country ?? "US" }
    : hasPhysical
      ? { isVirtual: false, virtualUrl: null, venueName, addressLine1: addressLine1!, city: city!, state, postalCode, country: country ?? "US" }
      : null;

  let updated = 0;
  const capacitySkipped: string[] = [];

  if (d.propagate === "1") {
    const now = new Date();
    const sessions = await prisma.event.findMany({
      where: { recurringEventId: re.id, deletedAt: null, status: { not: "CANCELLED" }, endAt: { gte: now } },
      // The materializer creates exactly one drop-in tier per session (sortOrder
      // 0). Order by sortOrder then id so we always target THAT tier and leave
      // any extra tiers an organizer added to one session by hand alone.
      include: { ticketTypes: { where: { isVendorTier: false }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
      take: 400,
    });

    for (const ev of sessions) {
      const sold = ev.ticketTypes.reduce((n, t) => n + t.quantitySold, 0);
      // Never shrink a session below what it has already sold.
      const capacityOk = capacity === null || sold <= capacity;
      if (!capacityOk) capacitySkipped.push(ev.startAt.toISOString().slice(0, 10));

      await prisma.event.update({
        where: { id: ev.id },
        data: {
          name: d.name,
          description: d.description || d.name,
          category: d.category || null,
          bannerUrl: d.bannerUrl || null,
          isPrivate,
          ...(capacityOk ? { capacity } : {}),
        },
      });

      if (locationData) {
        await prisma.eventLocation.upsert({
          where: { eventId: ev.id },
          create: { eventId: ev.id, ...locationData },
          update: locationData,
        });
      }

      const tier = ev.ticketTypes[0];
      if (tier) {
        await prisma.ticketType.update({
          where: { id: tier.id },
          data: {
            name: d.ticketName,
            priceCents,
            kind: priceCents > 0 ? "GENERAL" : "FREE",
            ...(capacityOk ? { quantityTotal: capacity } : {}),
          },
        });
      }
      updated += 1;
    }
  }

  // ── Reconcile the run length ─────────────────────────────────────────────
  // Read back the updated row so the rule reflects the new end/cap, then:
  //  • shorten → drop the tail that's now out of range (empty ones only)
  //  • extend  → materialize the newly-in-range dates right away
  // Both are safe for the index-keyed idempotency: extending only ADDS higher
  // indexes, and pruning removes rows the rule no longer produces — the
  // surviving sessions keep the exact indexes the rule still assigns them.
  let removedTail = 0;
  const tailKeptWithRegs: string[] = [];
  let addedTail = 0;
  const runLengthChanged =
    (re.seriesEnd?.getTime() ?? null) !== (seriesEnd?.getTime() ?? null) || re.occurrenceCap !== occurrenceCap;

  if (runLengthChanged) {
    const fresh = await prisma.recurringEvent.findUnique({ where: { id: re.id } });
    if (fresh && fresh.status === "ACTIVE") {
      const far = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);
      const valid = new Set(computeOccurrences(ruleForRecurringEvent(fresh), far).map((o) => o.index));
      const pruned = await pruneOutOfRange(re.id, valid);
      removedTail = pruned.removed;
      tailKeptWithRegs.push(...pruned.keptWithRegs);
      addedTail = await materializeOccurrences(re.id, new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)).catch(() => 0);
    }
  }

  await audit({
    organizationId: re.organizationId,
    userId: session.sub,
    action: "recurring.update",
    targetType: "RecurringEvent",
    targetId: re.id,
    metadata: {
      name: d.name,
      propagated: d.propagate === "1",
      sessionsUpdated: updated,
      capacitySkipped,
      priceCentsBefore: re.priceCents,
      priceCentsAfter: priceCents,
      runLengthChanged,
      sessionsRemoved: removedTail,
      sessionsAdded: addedTail,
      tailKeptWithRegs,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/o/${re.organizationId}/recurring/${re.slug}`);
  const q = new URLSearchParams({
    saved: "1",
    updated: String(updated),
    skipped: String(capacitySkipped.length),
    removed: String(removedTail),
    added: String(addedTail),
    kept: String(tailKeptWithRegs.length),
  });
  redirect(`/dashboard/recurring/${re.id}/edit?${q.toString()}`);
}

function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) ||
    "series"
  );
}
async function uniqueRecurringSlug(organizationId: string, base: string): Promise<string> {
  let slug = base;
  let n = 1;
  // Bounded loop — a handful of collisions at most in practice.
  while (await prisma.recurringEvent.findFirst({ where: { organizationId, slug }, select: { id: true } })) {
    slug = `${base}-${++n}`;
    if (n > 50) { slug = `${base}-${Date.now()}`; break; }
  }
  return slug;
}

export async function createRecurringEventAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization linked");

  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) redirect("/dashboard/recurring/new?error=validation");
  const d = parsed.data;

  const byWeekday =
    d.frequency === "WEEKLY"
      ? formData.getAll("byWeekday").map((v) => Number(v)).filter((n) => n >= 0 && n <= 6)
      : [];
  if (d.frequency === "WEEKLY" && byWeekday.length === 0) redirect("/dashboard/recurring/new?error=weekday_required");

  const [hh, mm] = d.startTime.split(":").map(Number);
  const startTimeMinutes = hh * 60 + mm;
  // Store the series start/end at local NOON of the chosen day — the rule engine
  // only reads the calendar date from these (time-of-day lives in
  // startTimeMinutes), and noon is unambiguous across every DST transition.
  const seriesStart = fromZonedTime(`${d.startDate} 12:00:00`, d.timezone);
  const seriesEnd = d.endDate ? fromZonedTime(`${d.endDate} 12:00:00`, d.timezone) : null;

  const org = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: { slug: true, recurringEventCredits: true },
  });
  if (!org) throw new Error("Organization not found");
  const slug = await uniqueRecurringSlug(session.orgId, slugify(d.name));

  // ── Free vs premium gate ────────────────────────────────────────────────
  // Free tier: ONE active free series at a time (occurrences get the free-event
  // entitlements: 50 regs/session, no branding, drop-in only). Anything beyond
  // that — a second concurrent series, or wanting the full-series bundle —
  // requires spending a $34.99 series credit, which makes the series PREMIUM.
  const wantsBundle = !!d.bundlePriceDollars;
  const activeFreeRecurring = await prisma.recurringEvent.count({
    where: { organizationId: session.orgId, status: "ACTIVE", isPremium: false, deletedAt: null },
  });
  const needsCredit = wantsBundle || activeFreeRecurring >= 1;
  const isPremium = needsCredit;

  // Credit spend + recurring-event create in ONE transaction, so a failed create can
  // never consume a credit (and a race on the last credit can't double-spend).
  let recurringEvent;
  try {
    recurringEvent = await prisma.$transaction(async (tx) => {
      if (needsCredit) {
        const spent = await tx.organization.updateMany({
          where: { id: session.orgId!, recurringEventCredits: { gt: 0 } },
          data: { recurringEventCredits: { decrement: 1 } },
        });
        if (spent.count === 0) throw new Error("NO_CREDIT");
      }
      return tx.recurringEvent.create({
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
    if (e?.message === "NO_CREDIT") redirect("/dashboard/recurring/new?error=recurring_credit_required");
    throw e;
  }

  // Generate the first horizon now so the organizer sees occurrences right away
  // (the worker keeps rolling it forward every tick).
  const horizon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const created = await materializeOccurrences(recurringEvent.id, horizon).catch(() => 0);

  await audit({
    organizationId: session.orgId, userId: session.sub,
    action: "series.create", targetType: "EventSeries", targetId: recurringEvent.id,
    metadata: { name: d.name, frequency: d.frequency, firstBatch: created },
  });

  revalidatePath(`/o/${org.slug}`);
  redirect(`/o/${org.slug}/recurring/${slug}`);
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
export async function deleteRecurringEventAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  const recurringEventId = String(formData.get("recurringEventId"));
  const recurringEvent = await prisma.recurringEvent.findFirst({
    where: {
      id: recurringEventId,
      deletedAt: null,
      ...(session.role === "SUPERADMIN" ? {} : { organizationId: session.orgId ?? "__none__" }),
    },
    select: { id: true, name: true, organizationId: true, slug: true },
  });
  if (!recurringEvent) redirect("/dashboard?error=not_found");

  const now = new Date();
  const futureWithRegs = await prisma.event.count({
    where: {
      recurringEventId: recurringEvent.id,
      deletedAt: null,
      endAt: { gte: now },
      registrations: { some: { status: "CONFIRMED" } },
    },
  });
  if (futureWithRegs > 0) redirect("/dashboard?error=recurring_has_registrations");

  await prisma.event.updateMany({
    where: { recurringEventId: recurringEvent.id, deletedAt: null, endAt: { gte: now } },
    data: { deletedAt: now, status: "CANCELLED" },
  });
  await prisma.recurringEvent.update({
    where: { id: recurringEvent.id },
    data: { deletedAt: now, status: "ENDED" },
  });
  await audit({
    organizationId: recurringEvent.organizationId, userId: session.sub,
    action: "series.delete", targetType: "EventSeries", targetId: recurringEvent.id,
    metadata: { name: recurringEvent.name, slug: recurringEvent.slug },
  });

  const org = await prisma.organization.findUnique({ where: { id: recurringEvent.organizationId }, select: { slug: true } });
  if (org) revalidatePath(`/o/${org.slug}`);
  revalidatePath("/dashboard");
  redirect("/dashboard?saved=1");
}
