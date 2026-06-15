import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { RegistrationForm } from "@/components/RegistrationForm";

export const dynamic = "force-dynamic";

interface Props {
  params: { orgSlug: string; slug: string };
  searchParams: { waitlist?: string };
}

export default async function RegisterPage({ params, searchParams }: Props) {
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

  let waitlistEntry: { firstName: string; lastName: string; email: string } | null = null;
  if (searchParams.waitlist) {
    const entry = await prisma.waitlist.findFirst({
      where: {
        eventId: event.id,
        magicToken: searchParams.waitlist,
        status: "PROMOTED",
        expiresAt: { gt: new Date() },
      },
      select: { firstName: true, lastName: true, email: true },
    });
    if (entry) waitlistEntry = entry;
  }

  // Prefill priority: a waitlist reservation (the seat is held for that exact
  // email) wins; otherwise fall back to the signed-in attendee's saved profile.
  let prefill: { firstName: string; lastName: string; email: string; phone?: string } | undefined =
    waitlistEntry ?? undefined;
  if (!prefill) {
    const session = await getSession();
    if (session?.role === "ATTENDEE") {
      const me = await prisma.user.findUnique({
        where: { id: session.sub },
        select: { firstName: true, lastName: true, email: true, phone: true },
      });
      if (me) {
        prefill = {
          firstName: me.firstName ?? "",
          lastName: me.lastName ?? "",
          email: me.email,
          phone: me.phone ?? undefined,
        };
      }
    }
  }

  // Presale banner: only while the window is open, and only if there's a paid
  // ticket the discount can actually apply to. Date renders in the event's timezone.
  const presalePct = event.presalePercent != null ? Number(event.presalePercent) : 0;
  const presaleActive =
    presalePct > 0 &&
    event.presaleEndsAt != null &&
    event.presaleEndsAt > new Date() &&
    event.ticketTypes.some((t) => t.priceCents > 0);
  const presaleNote = presaleActive
    ? `All tickets shown include a ${presalePct}% early-bird discount until ${formatInTimeZone(
        event.presaleEndsAt!, event.timezone, "MMM d, h:mm a zzz",
      )} — prices return to regular after that.`
    : undefined;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <a href={`/o/${params.orgSlug}/events/${event.slug}`} className="text-sm text-brand-700 hover:underline">◀ Back to event</a>
      <h1 className="mt-2 text-2xl font-bold">{event.name} — Register</h1>
      {waitlistEntry && (
        <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          A seat is reserved for you from the waitlist. Complete registration to claim it.
        </div>
      )}
      <RegistrationForm
        event={JSON.parse(JSON.stringify(event))}
        presaleNote={presaleNote}
        presaleActive={presaleActive}
        presalePct={presalePct}
        successHref={`/o/${params.orgSlug}/events/${event.slug}/success`}
        backHref={`/o/${params.orgSlug}/events/${event.slug}/register`}
        waitlistToken={waitlistEntry ? searchParams.waitlist : undefined}
        prefill={prefill}
      />
    </main>
  );
}
