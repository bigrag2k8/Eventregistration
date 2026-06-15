"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const schema = z.object({
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
});

export async function updateProfileAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "ATTENDEE") redirect("/account/signin");

  const parsed = schema.safeParse({
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  });
  if (!parsed.success) redirect("/account/profile?error=invalid");

  await prisma.user.update({
    where: { id: session.sub },
    data: {
      firstName: parsed.data.firstName || null,
      lastName: parsed.data.lastName || null,
      phone: parsed.data.phone || null,
    },
  });

  revalidatePath("/account/profile");
  redirect("/account/profile?saved=1");
}
