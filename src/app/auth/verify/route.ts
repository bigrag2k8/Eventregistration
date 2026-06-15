import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consumeMagicLink } from "@/lib/magic-link";
import { signSession, setSessionCookie } from "@/lib/auth";

/** Only same-site relative redirects (no open redirect via ?next). */
function safeNext(next: string | null) {
  if (!next) return "/account";
  if (!next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const next = safeNext(url.searchParams.get("next"));

  const email = token ? await consumeMagicLink(token) : null;
  if (!email) {
    return NextResponse.redirect(new URL("/account/signin?error=invalid", req.url));
  }

  // Find-or-create the account. An existing row (staff or attendee) signs in at
  // its real role — equivalent to email-based password reset, no escalation.
  // A new row is a global attendee: role ATTENDEE, no org, no password.
  let user = await prisma.user.findUnique({ where: { email } });
  if (user?.deletedAt) {
    return NextResponse.redirect(new URL("/account/signin?error=invalid", req.url));
  }
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        role: "ATTENDEE",
        organizationId: null,
        passwordHash: null,
        emailVerified: true,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), emailVerified: true },
    });
  }

  // Link any guest records that share this email but were never owned. Runs on
  // every sign-in (idempotent — the userId IS NULL guard makes re-runs cheap and
  // self-healing), so registrations created as a guest between sign-ins get
  // adopted. Case-insensitive: magic-link emails are lowercased, but guest
  // registration/waitlist emails are stored as-entered. RefundRequests carry no
  // email of their own — they follow their Registration via the FK.
  try {
    await prisma.$transaction([
      prisma.registration.updateMany({
        where: { email: { equals: user.email, mode: "insensitive" }, userId: null },
        data: { userId: user.id },
      }),
      prisma.waitlist.updateMany({
        where: { email: { equals: user.email, mode: "insensitive" }, userId: null },
        data: { userId: user.id },
      }),
    ]);
  } catch (e: any) {
    // Non-fatal — sign-in must still succeed; the next sign-in retries the link.
    console.error("[auth/verify] guest-record backfill failed:", e?.message);
  }

  const sessionToken = await signSession({
    sub: user.id,
    role: user.role,
    email: user.email,
    orgId: user.organizationId ?? undefined,
  });
  await setSessionCookie(sessionToken);

  // Staff who used a magic link land in their dashboard; attendees go to /account.
  const dest =
    user.role === "STAFF" || user.role === "VOLUNTEER"
      ? "/checkin"
      : user.role === "ATTENDEE"
        ? next
        : "/dashboard";

  return NextResponse.redirect(new URL(dest, req.url));
}
