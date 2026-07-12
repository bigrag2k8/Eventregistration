"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyReviewToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { recomputeOrgRating, recomputeEventRating, reviewAuthorName } from "@/server/reviews";

// Optional sub-rating: empty string (skipped) → undefined; otherwise 1..5.
const subRating = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().int().min(1).max(5).optional(),
);

const schema = z.object({
  token: z.string().min(10),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  ratingVenue: subRating,
  ratingValue: subRating,
  ratingOrganization: subRating,
});

/**
 * Submit (or update) a post-event review. Authenticated ONLY by the signed
 * review token in the form — never a session. Enforces: valid token, the event
 * has ended, the registration is a CONFIRMED (verified) attendee, and one review
 * per registration (the @unique upsert). Recomputes the org's cached rating so
 * the public page updates.
 */
export async function submitReviewAction(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/review/${formData.get("token") ?? ""}?error=invalid`);
  const { token, rating, comment, ratingVenue, ratingValue, ratingOrganization } = parsed.data;

  const claim = await verifyReviewToken(token);
  if (!claim) redirect(`/review/${token}?error=expired`);

  // Rate-limit on the (token-derived) registration id — the token is signed, so
  // this bounds how fast a single valid link can be hammered.
  const ip = (headers().get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean).pop() ?? "anon";
  const rl = await rateLimit(`review-submit:${claim.registrationId}:${ip}`, 10, 60);
  if (!rl.allowed) redirect(`/review/${token}?error=rate`);

  const reg = await prisma.registration.findUnique({
    where: { id: claim.registrationId },
    include: {
      event: { select: { id: true, endAt: true, isPrivate: true, organizationId: true } },
      tickets: { select: { checkIn: { select: { id: true } } } },
    },
  });
  if (!reg) redirect(`/review/${token}?error=expired`);
  if (reg.status !== "CONFIRMED") redirect(`/review/${token}?error=ineligible`);
  if (reg.event.endAt >= new Date()) redirect(`/review/${token}?error=too_early`);

  const attended = reg.tickets.some((t) => t.checkIn);
  const authorName = reviewAuthorName(reg.firstName, reg.lastName);
  const cleanComment = comment?.trim() ? comment.trim() : null;

  const subs = {
    ratingVenue: ratingVenue ?? null,
    ratingValue: ratingValue ?? null,
    ratingOrganization: ratingOrganization ?? null,
  };
  await prisma.review.upsert({
    where: { registrationId: reg.id },
    // Editing keeps the original createdAt; a re-submit re-publishes (a prior
    // hide is intentionally NOT auto-restored — only status stays as set by
    // moderation on create, PUBLISHED).
    update: { rating, comment: cleanComment, attended, ...subs },
    create: {
      registrationId: reg.id,
      eventId: reg.event.id,
      organizationId: reg.event.organizationId,
      rating,
      comment: cleanComment,
      authorName,
      attended,
      ...subs,
    },
  });

  await recomputeOrgRating(reg.event.organizationId);
  await recomputeEventRating(reg.event.id);

  const org = await prisma.organization.findUnique({
    where: { id: reg.event.organizationId },
    select: { slug: true },
  });
  if (org) revalidatePath(`/o/${org.slug}`);

  redirect(`/review/${token}?submitted=1`);
}
