import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { VendorApplicationForm } from "@/components/VendorApplicationForm";

export const dynamic = "force-dynamic";

export default async function VendorRegistrationPage({ params }: { params: { slug: string } }) {
  const event = await prisma.event.findFirst({
    where: { slug: params.slug, status: "PUBLISHED", deletedAt: null },
    include: {
      organization: true,
      ticketTypes: {
        where: { isVendorTier: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!event || !event.vendorRegistrationEnabled) return notFound();

  return (
    <main>
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur ring-1 ring-slate-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href={`/events/${event.slug}`} className="text-sm text-brand-700">◀ Back to event</Link>
          <span className="font-semibold">Vendor Application</span>
          <span />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Become a vendor at {event.name}</h1>
        <p className="mt-2 text-slate-600">
          Submit your application below. The organizer reviews every submission and will email you with an
          approval or follow-up questions. Approved vendors receive a payment link to secure their booth.
        </p>
        {event.vendorApplicationNotes && (
          <div className="mt-4 rounded-lg bg-brand-50 p-4 ring-1 ring-brand-200">
            <div className="text-sm font-medium text-brand-900">From the organizer</div>
            <p className="mt-1 whitespace-pre-line text-sm text-brand-800">{event.vendorApplicationNotes}</p>
          </div>
        )}

        <VendorApplicationForm
          eventId={event.id}
          eventSlug={event.slug}
          ticketTypes={JSON.parse(JSON.stringify(event.ticketTypes))}
        />
      </div>
    </main>
  );
}
