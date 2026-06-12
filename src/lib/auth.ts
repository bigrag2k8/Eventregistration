import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

const DEV_FALLBACK_SECRET = "dev-secret-change-me-please-32-bytes!";
const JWT_SECRET = process.env.JWT_SECRET;

// Fail closed in production: a missing secret silently falls back to the
// public, in-repo dev value below, which would let anyone forge a SUPERADMIN
// session or a valid QR ticket (the same key signs both). Skip the check during
// `next build`, where runtime secrets aren't injected yet.
if (
  process.env.NEXT_PHASE !== "phase-production-build" &&
  process.env.NODE_ENV === "production" &&
  (!JWT_SECRET || JWT_SECRET === DEV_FALLBACK_SECRET)
) {
  throw new Error(
    "JWT_SECRET is missing or set to the public dev fallback. Refusing to start: " +
      "a known signing key lets anyone forge sessions and QR tickets. Set a strong JWT_SECRET.",
  );
}
if (JWT_SECRET && JWT_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.warn("[auth] JWT_SECRET is shorter than 32 chars — consider a longer, random secret.");
}

const SECRET = new TextEncoder().encode(JWT_SECRET ?? DEV_FALLBACK_SECRET);
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "eventflow_session";

export interface JwtPayload {
  sub: string;       // user id
  role: Role;
  orgId?: string;
  email: string;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signSession(payload: JwtPayload, expires = "7d") {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(process.env.JWT_ISSUER ?? "eventflow")
    .setExpirationTime(expires)
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      issuer: process.env.JWT_ISSUER ?? "eventflow",
    });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

/**
 * Verifies the session cookie AND re-validates the user against the database,
 * so removing a team member or changing their role takes effect immediately
 * instead of whenever their 7-day JWT happens to expire. Role/orgId/email come
 * from the DB, not the (possibly stale) token claims.
 *
 * Wrapped in React cache() so repeated calls within one request cost a single
 * primary-key lookup. Prisma is imported dynamically to keep it out of the
 * edge middleware bundle (middleware imports verifySession from this module).
 */
export const getSession = cache(async (): Promise<JwtPayload | null> => {
  const tok = cookies().get(COOKIE_NAME)?.value;
  if (!tok) return null;
  const claims = await verifySession(tok);
  if (!claims) return null;

  const { prisma } = await import("@/lib/db");
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, role: true, organizationId: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return null;

  return {
    sub: user.id,
    role: user.role,
    orgId: user.organizationId ?? undefined,
    email: user.email,
  };
});

export function requireRole(allowed: Role[], session: JwtPayload | null) {
  if (!session) throw new Error("UNAUTHORIZED");
  if (!allowed.includes(session.role)) throw new Error("FORBIDDEN");
  return session;
}

/**
 * Returns a Prisma `where` snippet that scopes a query to the caller's
 * organization, EXCEPT for SUPERADMIN, who can view/manage records across
 * every organization. Use anywhere we currently inline
 * `{ organizationId: session.orgId }`.
 */
export function orgScope(session: JwtPayload): { organizationId?: string } {
  if (session.role === "SUPERADMIN") return {};
  return session.orgId ? { organizationId: session.orgId } : { organizationId: "__none__" };
}

/**
 * QR ticket signing: short-lived stateless signature.
 * Validation also requires DB lookup for single-use enforcement.
 */
export async function signTicketToken(payload: {
  ticketId: string;
  registrationId: string;
  eventId: string;
  ticketTypeId: string;
}) {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("eventflow-qr")
    .sign(SECRET);
}

export async function verifyTicketToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: "eventflow-qr" });
    return payload as {
      ticketId: string;
      registrationId: string;
      eventId: string;
      ticketTypeId: string;
    };
  } catch {
    return null;
  }
}
