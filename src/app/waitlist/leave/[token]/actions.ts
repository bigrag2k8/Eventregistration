"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export async function leaveWaitlistAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect(`/waitlist/leave/_?error=missing_token`);

  const entry = await prisma.waitlist.findFirst({
    where: { leaveToken: token, status: { in: ["WAITING", "PROMOTED"] } },
    select: { id: true },
  });
  if (!entry) redirect(`/waitlist/leave/${token}?error=not_found`);

  await prisma.waitlist.update({
    where: { id: entry.id },
    data: { status: "LEFT" },
  });

  redirect(`/waitlist/leave/${token}?confirmed=1`);
}
