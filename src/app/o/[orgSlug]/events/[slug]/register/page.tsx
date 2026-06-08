import { notFound } from "next/navigation";
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <a href={`/o/${params.orgSlug}/events/${event.slug}`} className="text-sm text-brand-700 hover:underline">◀ Back to event</a>
      <h1 className="mt-2 text-2xl font-bold">{event.name} — Register</h1>
      <RegistrationForm
        event={JSON.parse(JSON.stringify(event))}
        successHref={`/o/${params.orgSlug}/events/${event.slug}/success`}
        backHref={`/o/${params.orgSlug}/events/${event.slug}/register`}
      />
    </main>
  );
}
