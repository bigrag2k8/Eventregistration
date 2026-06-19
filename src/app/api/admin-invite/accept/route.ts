import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, signSession, attachSessionCookie } from "@/lib/auth";
import { strongPasswordError } from "@/lib/admin-invite";
import { sendAdminInviteOwnerNotice } from "@/lib/invites";
import { ownerEmails } from "@/lib/owner";
import { audit } from "@/lib/audit";

const schema = z.object({
  token: z.string().min(10),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  password: z.string().min(12).max(72),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fill in all fields correctly." }, { status: 400 });
  const { token, firstName, lastName, password } = parsed.data;

  // Enforce the strict policy server-side (don't trust the client checklist).
  const pwErr = strongPasswordError(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const invite = await prisma.adminInvite.findUnique({ where: { token } });
  if (!invite) return NextResponse.json({ error: "Invalid invite link." }, { status: 404 });
  if (invite.status !== "PENDING") return NextResponse.json({ error: `This invite is ${invite.status.toLowerCase()}.` }, { status: 410 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: "This invite has expired." }, { status: 410 });

  // If an account already exists for this email, refuse rather than overwrite.
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists. Please sign in instead." }, { status: 409 });
  }

  let user;
  try {
    ({ user } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invite.email,
          passwordHash: await hashPassword(password),
          firstName,
          lastName,
          role: "SUPERADMIN",
          organizationId: null, // platform admins are org-less
          emailVerified: true, // proved inbox control via the single-use link
        },
      });
      await tx.adminInvite.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: user.id },
      });
      return { user };
    }));
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "An account with this email already exists. Please sign in instead." }, { status: 409 });
    }
    throw e;
  }

  await audit({
    userId: user.id, action: "admin.invite_accepted", targetType: "User", targetId: user.id,
    metadata: { email: user.email, invitedBy: invite.invitedBy },
  });
  // Tell the owner(s) the admin account is now live (non-blocking).
  await sendAdminInviteOwnerNotice({
    toEmails: ownerEmails(),
    subject: "Security: a platform admin account was activated",
    body: `The platform administrator invite for <strong>${user.email}</strong> was accepted — the SUPERADMIN account is now active.`,
  }).catch(() => {});

  const sessionToken = await signSession({
    sub: user.id,
    role: user.role,
    email: user.email,
    ver: user.sessionVersion,
  });

  const res = NextResponse.json({ id: user.id });
  attachSessionCookie(res, sessionToken);
  return res;
}
