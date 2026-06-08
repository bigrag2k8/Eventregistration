import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Legacy URL — redirects to the org-scoped path.
 * For backward compatibility with any pre-multi-tenant links shared.
 * If multiple orgs ever use the same slug, the first PUBLISHED match wins.
 */
export default async function LegacyEventRedirect({ params }: { params: { slug: string } }) {
  const event = await prisma.event.findFirst({
    where: { slug: params.slug, status: "PUBLISHED", deletedAt: null },
    include: { organization: true },
    orderBy: { publishedAt: "asc" },
  });
  if (!event) return notFound();
  redirect(`/o/${event.organization.slug}/events/${event.slug}`);
}
