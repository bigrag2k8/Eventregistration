import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, signSession, setSessionCookie } from "@/lib/auth";

const schema = z.object({
  token: z.string().min(10),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  password: z.string().min(8).max(72),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fill in all fields correctly." }, { status: 400 });
  const { token, firstName, lastName, password } = parsed.data;

  const invite = await prisma.pendingInvite.findUnique({
    where: { token }, include: { organization: true },
  });
  if (!invite) return NextResponse.json({ error: "Invalid invite link." }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: `This invite is ${invite.status.toLowerCase()}.` }, { status: 410 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: "This invite has expired." }, { status: 410 });

  // Email collision: if someone already has an account with this email, refuse rather than overwrite
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing) {
    return NextResponse.json({
      error: "An account with this email already exists. Please sign in instead — you may need to ask your organization admin to switch you over.",
    }, { status: 409 });
  }

  const { user } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: invite.email,
        passwordHash: await hashPassword(password),
        firstName,
        lastName,
        role: invite.role,
        organizationId: invite.organizationId,
        emailVerified: true, // they clicked a single-use link to their inbox
      },
    });
    await tx.pendingInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: user.id },
    });
    return { user };
  });

  const sessionToken = await signSession({
    sub: user.id,
    role: user.role,
    email: user.email,
    orgId: invite.organizationId,
  });
  await setSessionCookie(sessionToken);

  return NextResponse.json({ id: user.id, orgSlug: invite.organization.slug });
}
