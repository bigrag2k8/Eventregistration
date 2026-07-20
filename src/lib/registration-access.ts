import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Fetch a Registration by id ONLY if the supplied key matches its accessToken —
 * the app-wide "prove you're this attendee via a link" gate (`?reg=<id>&key=<token>`).
 * Returns the registration (with whatever `include` you pass) or null. This is the
 * one place that guard should live; historically it was copy-pasted inline in the
 * success/refund-request pages and the ics/refund/checkout API routes.
 */
export async function getRegistrationByAccessToken<T extends Prisma.RegistrationInclude>(
  id: string | undefined | null,
  key: string | undefined | null,
  include?: T,
): Promise<Prisma.RegistrationGetPayload<{ include: T }> | null> {
  if (!id || !key) return null;
  const reg = await prisma.registration.findUnique({ where: { id }, include });
  if (!reg || !reg.accessToken || reg.accessToken !== key) return null;
  return reg as Prisma.RegistrationGetPayload<{ include: T }>;
}
