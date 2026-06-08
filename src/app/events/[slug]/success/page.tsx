import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LegacySuccessRedirect({
  params, searchParams,
}: { params: { slug: string }; searchParams: { reg?: string } }) {
  const event = await prisma.event.findFirst({
    where: { slug: params.slug, deletedAt: null },
    include: { organization: true },
    orderBy: { publishedAt: "asc" },
  });
  if (!event) return notFound();
  const q = searchParams.reg ? `?reg=${searchParams.reg}` : "";
  redirect(`/o/${event.organization.slug}/events/${event.slug}/success${q}`);
}
