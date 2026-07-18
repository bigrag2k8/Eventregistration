import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, signSession, attachSessionCookie } from "@/lib/auth";
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
  contactPhone: z.string().min(7, "Phone number is required").max(40),
  addressLine1: z.string().min(1, "Street address is required").max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1, "City is required").max(100),
  state: z.string().min(1, "State / province is required").max(100),
  zipCode: z.string().min(1, "ZIP / postal code is required").max(20),
  country: z.string().min(1, "Country is required").max(100),
  ref: z.string().max(40).optional(),
});

/** Generate a unique referral code for a new org (retry on the rare collision). */
async function newReferralCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = crypto.randomBytes(6).toString("hex").slice(0, 10);
    const taken = await prisma.organization.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  return crypto.randomBytes(10).toString("hex");
}

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
  const {
    email, password, firstName, lastName, orgName, orgSlug,
    contactPhone, addressLine1, addressLine2, city, state, zipCode, country, ref,
  } = parsed.data;

  if (RESERVED_SLUGS.has(orgSlug)) {
    return NextResponse.json({ error: `"${orgSlug}" is reserved. Please choose another URL slug.` }, { status: 409 });
  }

  const [existingUser, existingOrg] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.organization.findUnique({ where: { slug: orgSlug } }),
  ]);
  if (existingUser) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  if (existingOrg) return NextResponse.json({ error: `The URL slug "${orgSlug}" is already taken. Try another.` }, { status: 409 });

  // Resolve the referral code (if any) to the referring org. Self-reference is
  // impossible here — this org doesn't exist yet. An unknown code is ignored.
  const referrer = ref
    ? await prisma.organization.findUnique({ where: { referralCode: ref }, select: { id: true } })
    : null;
  const referralCode = await newReferralCode();

  let user, org;
  try {
    ({ user, org } = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug: orgSlug,
          contactEmail: email,
          contactPhone,
          addressLine1,
          addressLine2: addressLine2 || null,
          city,
          state,
          zipCode,
          country,
          planSelected: false, // Locks dashboard until they pick a plan
          subscriptionPlan: "FREE",
          subscriptionStatus: "NONE",
          referralCode,
          referredByOrgId: referrer?.id ?? null,
        },
      });
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: await hashPassword(password),
          firstName,
          lastName,
          phone: contactPhone,
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
  const res = NextResponse.json({ id: user.id, email: user.email, orgSlug: org.slug });
  attachSessionCookie(res, token);
  return res;
}
