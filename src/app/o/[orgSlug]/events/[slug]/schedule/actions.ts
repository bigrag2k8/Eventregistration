"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getRegistrationByAccessToken } from "@/lib/registration-access";
import { reserveOrWaitlistSession, releaseSession } from "@/server/sessions";
import { sendSessionPromotionEmail } from "@/lib/email";

function scheduleBase(orgSlug: string, slug: string, reg: string, key: string) {
  return `/o/${orgSlug}/events/${slug}/schedule?reg=${encodeURIComponent(reg)}&key=${encodeURIComponent(key)}`;
}

/** Reserve a seat (or join the waitlist) in a capacity-limited session. */
export async function reserveSessionAction(formData: FormData) {
  const orgSlug = String(formData.get("orgSlug"));
  const slug = String(formData.get("slug"));
  const reg = String(formData.get("reg"));
  const key = String(formData.get("key"));
  const sessionId = String(formData.get("sessionId"));

  const registration = await getRegistrationByAccessToken(reg, key);
  if (!registration) redirect(`/o/${orgSlug}/events/${slug}`);
  const base = scheduleBase(orgSlug, slug, reg, key);

  const result = await reserveOrWaitlistSession(registration.id, sessionId);
  if (!result.ok) redirect(`${base}&error=${result.reason}`);
  revalidatePath(base);
  redirect(base);
}

/** Release a held seat, or leave the waitlist. Promotes the next waitlister. */
export async function releaseSessionAction(formData: FormData) {
  const orgSlug = String(formData.get("orgSlug"));
  const slug = String(formData.get("slug"));
  const reg = String(formData.get("reg"));
  const key = String(formData.get("key"));
  const sessionId = String(formData.get("sessionId"));

  const registration = await getRegistrationByAccessToken(reg, key);
  if (!registration) redirect(`/o/${orgSlug}/events/${slug}`);
  const base = scheduleBase(orgSlug, slug, reg, key);

  const { promotedReservationId } = await releaseSession(registration.id, sessionId);
  if (promotedReservationId) {
    // Best-effort: a failed promo email must not fail the release.
    await sendSessionPromotionEmail(promotedReservationId).catch(() => {});
  }
  revalidatePath(base);
  redirect(base);
}
