"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { recomputeOrgRating, recomputeEventRating } from "@/server/reviews";

async function revalidateOrg(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { slug: true } });
  if (org) revalidatePath(`/o/${org.slug}`);
  revalidatePath("/dashboard/reviews");
}

const replySchema = z.object({ reviewId: z.string().min(1), reply: z.string().max(2000) });

/**
 * Organizer reply to one of their org's reviews. Organizers can respond but
 * never delete or edit the review itself. Passing an empty reply clears it.
 */
export async function replyToReviewAction(formData: FormData) {
  const session = requireRole(["ORGANIZER", "ADMIN", "SUPERADMIN"], await getSession());
  if (!session.orgId) throw new Error("No organization linked");
  const parsed = replySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/dashboard/reviews?error=invalid");
  const { reviewId, reply } = parsed.data;

  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { organizationId: true } });
  if (!review || review.organizationId !== session.orgId) redirect("/dashboard/reviews?error=notfound");

  const trimmed = reply.trim();
  await prisma.review.update({
    where: { id: reviewId },
    data: {
      organizerReply: trimmed || null,
      organizerRepliedAt: trimmed ? new Date() : null,
    },
  });
  await audit({
    organizationId: session.orgId, userId: session.sub,
    action: "review.reply", targetType: "Review", targetId: reviewId,
    metadata: { cleared: !trimmed },
  });
  await revalidateOrg(session.orgId);
  redirect("/dashboard/reviews?saved=1");
}

const modSchema = z.object({ reviewId: z.string().min(1), op: z.enum(["hide", "unhide"]) });

/**
 * Moderation: SUPERADMIN hides (or restores) a review. Hiding removes it from
 * the public page and the rating aggregate; restoring re-publishes it. Never a
 * hard delete — the row stays for the audit trail.
 */
export async function setReviewStatusAction(formData: FormData) {
  const session = requireRole(["SUPERADMIN"], await getSession());
  const parsed = modSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/dashboard/reviews?error=invalid");
  const { reviewId, op } = parsed.data;

  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { organizationId: true, eventId: true } });
  if (!review) redirect("/dashboard/reviews?error=notfound");

  await prisma.review.update({
    where: { id: reviewId },
    data: { status: op === "hide" ? "HIDDEN" : "PUBLISHED" },
  });
  await recomputeOrgRating(review.organizationId);
  await recomputeEventRating(review.eventId);
  await audit({
    organizationId: review.organizationId, userId: session.sub,
    action: `review.${op}`, targetType: "Review", targetId: reviewId,
  });
  await revalidateOrg(review.organizationId);
  redirect("/dashboard/reviews?saved=1");
}
