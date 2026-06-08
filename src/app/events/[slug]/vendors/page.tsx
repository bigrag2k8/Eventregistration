import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LegacyVendorsRedirect({ params }: { params: { slug: string } }) {
  const event = await prisma.event.findFirst({
    where: { slug: params.slug, status: "PUBLISHED", deletedAt: null },
    include: { organization: true },
    orderBy: { publishedAt: "asc" },
  });
  if (!event) return notFound();
  redirect(`/o/${event.organization.slug}/events/${event.slug}/vendors`);
}
