import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consumeMagicLink } from "@/lib/magic-link";
import { signSession, attachSessionCookie } from "@/lib/auth";
import { isProtectedOwner } from "@/lib/owner";
import { clientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

/** Only same-site relative redirects (no open redirect via ?next). */
function safeNext(next: string | null) {
  if (!next) return "/account";
  if (!next.startsWith("/") || next.startsWith("//")) return "/account";
  return next;
}

/**
 * Public origin to build redirect targets from. Behind Railway's proxy,
 * `req.url` reports the container's internal bind address (0.0.0.0:8080), so a
 * redirect built from it sends the browser to an unreachable URL. Prefer the
 * configured public app URL, then the proxy's forwarded host, then the request.
 */
function publicBase(req: Request) {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const next = safeNext(url.searchParams.get("next"));
  const ip = clientIp(req);

  const email = token ? await consumeMagicLink(token) : null;
  if (!email) {
    await audit({ action: "auth.magic_link_invalid", metadata: { reason: "bad_or_expired_token" }, ipAddress: ip });
    return NextResponse.redirect(new URL("/account/signin?error=invalid", publicBase(req)));
  }

  // Find-or-create the account. An existing row (staff or attendee) signs in at
  // its real role — equivalent to email-based password reset, no escalation.
  // A new row is a global attendee: role ATTENDEE, no org, no password.
  let user = await prisma.user.findUnique({ where: { email } });
  const wasNewAccount = !user;
  if (user?.deletedAt) {
    return NextResponse.redirect(new URL("/account/signin?error=invalid", publicBase(req)));
  }
  // Staff and volunteer accounts are password-only — they must not obtain a
  // session through the passwordless magic link. Send them to /signin to use
  // their password. (New magic-link accounts are always ATTENDEE, so this only
  // affects an existing staff/volunteer who tried the attendee sign-in.)
  if (user && (user.role === "STAFF" || user.role === "VOLUNTEER")) {
    await audit({
      userId: user.id, action: "auth.magic_link_invalid",
      metadata: { reason: "staff_password_only", role: user.role }, ipAddress: ip,
    });
    return NextResponse.redirect(new URL("/signin?error=use_password", publicBase(req)));
  }
  // Break-glass: a protected owner (OWNER_EMAIL) is always SUPERADMIN — created
  // as one if new, elevated if their stored role drifted.
  const owner = isProtectedOwner(email);
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        role: owner ? "SUPERADMIN" : "ATTENDEE",
        organizationId: null,
        passwordHash: null,
        emailVerified: true,
      },
    });
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        emailVerified: true,
        ...(owner && user.role !== "SUPERADMIN" ? { role: "SUPERADMIN" } : {}),
      },
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

  // Seed the account's name from a registration if it has none yet (magic-link
  // accounts start nameless), so the profile and header show it going forward.
  if (!user.firstName && !user.lastName) {
    try {
      const named = await prisma.registration.findFirst({
        where: { email: { equals: user.email, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        select: { firstName: true, lastName: true },
      });
      if (named && (named.firstName || named.lastName)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { firstName: named.firstName || null, lastName: named.lastName || null },
        });
      }
    } catch (e: any) {
      console.error("[auth/verify] name seed failed:", e?.message);
    }
  }

  // The token must carry the effective role (the owner's elevation, which the
  // edge middleware reads from the JWT claims).
  const effectiveRole = owner ? "SUPERADMIN" : user.role;
  const sessionToken = await signSession({
    sub: user.id,
    role: effectiveRole,
    email: user.email,
    orgId: user.organizationId ?? undefined,
    ver: user.sessionVersion,
  });

  await audit({
    userId: user.id, organizationId: user.organizationId, action: "auth.magic_link_signin",
    metadata: { role: effectiveRole, newAccount: wasNewAccount }, ipAddress: ip,
  });

  // Staff who used a magic link land in their dashboard; attendees go to /account.
  const dest =
    effectiveRole === "STAFF" || effectiveRole === "VOLUNTEER"
      ? "/checkin"
      : effectiveRole === "ATTENDEE"
        ? next
        : "/dashboard";

  // Set the cookie ON the redirect response — cookies().set() does not attach
  // to a constructed NextResponse.redirect() in route handlers (the original
  // "logged out on refresh" bug for magic-link attendees).
  const res = NextResponse.redirect(new URL(dest, publicBase(req)));
  attachSessionCookie(res, sessionToken);
  return res;
}
