import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, signSession, setSessionCookie } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "checkin", "dashboard", "events",
  "o", "vendor", "vendors", "signin", "signup", "signout", "static",
  "_next", "favicon.ico", "robots.txt", "sitemap.xml", "invite",
]);

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  orgName: z.string().min(2).max(120),
  orgSlug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(60),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`signup:${ip}`, 10, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const first = Object.values(flat.fieldErrors).flat()[0] ?? "Please check all fields.";
    return NextResponse.json({ error: String(first) }, { status: 400 });
  }
  const { email, password, firstName, lastName, orgName, orgSlug } = parsed.data;

  if (RESERVED_SLUGS.has(orgSlug)) {
    return NextResponse.json({ error: `"${orgSlug}" is reserved. Please choose another URL slug.` }, { status: 409 });
  }

  const [existingUser, existingOrg] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.organization.findUnique({ where: { slug: orgSlug } }),
  ]);
  if (existingUser) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  if (existingOrg) return NextResponse.json({ error: `The URL slug "${orgSlug}" is already taken. Try another.` }, { status: 409 });

  let user, org;
  try {
    ({ user, org } = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug: orgSlug,
          contactEmail: email,
          planSelected: false, // Locks dashboard until they pick a plan
          subscriptionPlan: "FREE",
          subscriptionStatus: "NONE",
        },
      });
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: await hashPassword(password),
          firstName,
          lastName,
          role: "ORGANIZER",
          organizationId: org.id,
          emailVerified: false,
        },
      });
      return { user, org };
    }));
  } catch (e: any) {
    // Two simultaneous signups can both pass the pre-checks above; the loser
    // hits the unique constraint on email or slug. Return the same friendly
    // 409 instead of a generic 500.
    if (e?.code === "P2002") {
      const field = (e.meta?.target as string[] | undefined)?.join(",") ?? "";
      const msg = field.includes("slug")
        ? `The URL slug "${orgSlug}" is already taken. Try another.`
        : "An account with this email already exists.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    throw e;
  }

  const token = await signSession({ sub: user.id, role: user.role, email: user.email, orgId: org.id, ver: user.sessionVersion });
  await setSessionCookie(token);
  return NextResponse.json({ id: user.id, email: user.email, orgSlug: org.slug });
}
