import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { RegistrationForm } from "@/components/RegistrationForm";

export const dynamic = "force-dynamic";

interface Props { params: { orgSlug: string; slug: string } }

export default async function RegisterPage({ params }: Props) {
  const event = await prisma.event.findFirst({
    where: {
      slug: params.slug,
      organization: { slug: params.orgSlug, deletedAt: null },
      status: "PUBLISHED",
      deletedAt: null,
    },
    include: {
      ticketTypes: { where: { isHidden: false, isVendorTier: false }, orderBy: { sortOrder: "asc" } },
      customQuestions: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!event) return notFound();

  // Presale banner: only while the window is open, and only if there's a paid
  // ticket the discount can actually apply to. Date renders in the event's timezone.
  const presalePct = event.presalePercent != null ? Number(event.presalePercent) : 0;
  const presaleNote =
    presalePct > 0 &&
    event.presaleEndsAt != null &&
    event.presaleEndsAt > new Date() &&
    event.ticketTypes.some((t) => t.priceCents > 0)
      ? `All tickets shown include a ${presalePct}% early-bird discount until ${formatInTimeZone(
          event.presaleEndsAt, event.timezone, "MMM d, h:mm a zzz",
        )} — prices return to regular after that.`
      : undefined;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <a href={`/o/${params.orgSlug}/events/${event.slug}`} className="text-sm text-brand-700 hover:underline">◀ Back to event</a>
      <h1 className="mt-2 text-2xl font-bold">{event.name} — Register</h1>
      <RegistrationForm
        event={JSON.parse(JSON.stringify(event))}
        presaleNote={presaleNote}
        successHref={`/o/${params.orgSlug}/events/${event.slug}/success`}
        backHref={`/o/${params.orgSlug}/events/${event.slug}/register`}
      />
    </main>
  );
}
