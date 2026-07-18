"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/auth";

/** Idempotent opt-out — safe to call twice (unique on org+email). Public: the
 *  signed token IS the authorization, no session required. */
export async function unsubscribeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const claim = await verifyUnsubscribeToken(token);
  if (!claim) redirect(`/unsubscribe/${token}?error=1`);

  await prisma.marketingUnsubscribe.upsert({
    where: { organizationId_email: { organizationId: claim.organizationId, email: claim.email } },
    create: { organizationId: claim.organizationId, email: claim.email },
    update: {},
  });
  redirect(`/unsubscribe/${token}?done=1`);
}
