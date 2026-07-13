import { prisma } from "@/lib/db";
import { computeOccurrences, ruleForSeries, occurrenceSlug } from "@/server/series-rule";

export * from "@/server/series-rule";

/**
 * Materialize a series' occurrences up to `throughInstant` as real Event rows
 * (each with one drop-in TicketType). Idempotent: occurrences already present
 * (matched by seriesId + startAt) are skipped, so re-running only fills gaps.
 * Returns the number of new occurrences created.
 */
export async function materializeOccurrences(seriesId: string, throughInstant: Date): Promise<number> {
  const s = await prisma.eventSeries.findUnique({ where: { id: seriesId } });
  if (!s || s.deletedAt || s.status === "DRAFT") return 0;

  const occ = computeOccurrences(ruleForSeries(s), throughInstant);
  if (occ.length === 0) return 0;

  const existing = await prisma.event.findMany({
    where: { seriesId, deletedAt: null },
    select: { startAt: true },
  });
  const seen = new Set(existing.map((e) => e.startAt.getTime()));

  let created = 0;
  for (const o of occ) {
    if (seen.has(o.start.getTime())) continue;
    const endAt = new Date(o.start.getTime() + s.durationMinutes * 60_000);
    await prisma.event.create({
      data: {
        organizationId: s.organizationId,
        seriesId: s.id,
        occurrenceIndex: o.index,
        name: s.name,
        slug: occurrenceSlug(s.slug, o.start, s.timezone),
        description: s.description,
        category: s.category,
        bannerUrl: s.bannerUrl,
        status: "PUBLISHED",
        publishedAt: new Date(),
        startAt: o.start,
        endAt,
        timezone: s.timezone,
        capacity: s.capacity,
        isPrivate: s.isPrivate,
        ticketTypes: {
          create: {
            name: s.ticketName,
            kind: s.priceCents > 0 ? "GENERAL" : "FREE",
            priceCents: s.priceCents,
            quantityTotal: s.capacity,
          },
        },
      },
    });
    created += 1;
  }
  return created;
}
