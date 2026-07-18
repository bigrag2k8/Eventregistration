import { prisma } from "@/lib/db";

/**
 * The org's marketing audience: every distinct email that has a CONFIRMED
 * registration for any of the org's events, MINUS anyone who unsubscribed from
 * this org's marketing. Case-insensitive dedup on email.
 *
 * Deliberately NOT in actions.ts ("use server"): every export from a "use
 * server" file becomes an individually invocable server-action endpoint, so a
 * caller-supplied organizationId here would be a cross-tenant PII read (F-01).
 * This is a plain server-side helper — callers must derive organizationId
 * from the authenticated session, never accept it from a client.
 */
export async function marketingAudience(organizationId: string): Promise<{ email: string; firstName: string | null }[]> {
  const [regs, unsubs] = await Promise.all([
    prisma.registration.findMany({
      where: { status: "CONFIRMED", event: { organizationId, deletedAt: null } },
      select: { email: true, firstName: true },
    }),
    prisma.marketingUnsubscribe.findMany({ where: { organizationId }, select: { email: true } }),
  ]);
  const blocked = new Set(unsubs.map((u) => u.email.toLowerCase()));
  const byEmail = new Map<string, { email: string; firstName: string | null }>();
  for (const r of regs) {
    const key = r.email.toLowerCase();
    if (blocked.has(key) || byEmail.has(key)) continue;
    byEmail.set(key, { email: r.email, firstName: r.firstName });
  }
  return [...byEmail.values()];
}
