import * as React from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { isProtectedOwner } from "@/lib/owner";

const DEV_FALLBACK_SECRET = "dev-secret-change-me-please-32-bytes!";
const DEV_FALLBACK_QR_SECRET = "dev-qr-secret-change-me-please-32-bytes!";
const JWT_SECRET = process.env.JWT_SECRET;
const QR_SECRET_ENV = process.env.QR_SECRET;
const IS_PROD_RUNTIME =
  process.env.NEXT_PHASE !== "phase-production-build" && process.env.NODE_ENV === "production";

// Fail closed in production: a missing secret silently falls back to the
// public, in-repo dev value below, which would let anyone forge a SUPERADMIN
// session. Skip the check during `next build`, where runtime secrets aren't
// injected yet.
if (IS_PROD_RUNTIME && (!JWT_SECRET || JWT_SECRET === DEV_FALLBACK_SECRET)) {
  throw new Error(
    "JWT_SECRET is missing or set to the public dev fallback. Refusing to start: " +
      "a known signing key lets anyone forge sessions. Set a strong JWT_SECRET.",
  );
}
if (JWT_SECRET && JWT_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.warn("[auth] JWT_SECRET is shorter than 32 chars — consider a longer, random secret.");
}

// SEC-02: QR ticket tokens are signed with a SEPARATE key (QR_SECRET) so a leak
// of one secret doesn't compromise both surfaces (sessions AND ticket check-in).
// QR_SECRET defaults to JWT_SECRET when unset, so deploying this code changes
// nothing until an operator sets a distinct QR_SECRET. NOTE: setting a NEW
// distinct QR_SECRET invalidates already-issued QR tickets (they were signed
// with the old key) — do the cutover between events.
if (IS_PROD_RUNTIME) {
  if (QR_SECRET_ENV && QR_SECRET_ENV === DEV_FALLBACK_QR_SECRET) {
    throw new Error("QR_SECRET is set to the public dev fallback. Set a strong, distinct value.");
  }
  if (!QR_SECRET_ENV) {
    // eslint-disable-next-line no-console
    console.warn("[auth] QR_SECRET not set — QR ticket tokens share JWT_SECRET. Set a distinct QR_SECRET to isolate ticket-token compromise from session compromise (SEC-02).");
  } else if (QR_SECRET_ENV === JWT_SECRET) {
    // eslint-disable-next-line no-console
    console.warn("[auth] QR_SECRET equals JWT_SECRET — use a distinct value to isolate the QR-token blast radius (SEC-02).");
  }
}

const SECRET = new TextEncoder().encode(JWT_SECRET ?? DEV_FALLBACK_SECRET);
// Dedicated QR signing key. Falls back to the session secret when QR_SECRET is
// unset (no breakage), then to the dev value for local development only.
const QR_SECRET = new TextEncoder().encode(QR_SECRET_ENV ?? JWT_SECRET ?? DEV_FALLBACK_QR_SECRET);
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
 * edge middleware bundle (middleware imports verifySession from this module),
 * and cache() falls back to identity there — the client/edge React build
 * doesn't export it, and middleware never calls getSession.
 */
const requestMemo: <T extends (...args: any[]) => any>(fn: T) => T =
  typeof (React as any).cache === "function" ? (React as any).cache : (fn: any) => fn;

export const getSession = requestMemo(async (): Promise<JwtPayload | null> => {
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

  // Break-glass: a protected owner (OWNER_EMAIL) is always SUPERADMIN at read
  // time, regardless of the stored role — so the owner can never be locked out,
  // even if their DB role was changed. No DB write here (hot path).
  const role: Role = isProtectedOwner(user.email) ? "SUPERADMIN" : user.role;

  return {
    sub: user.id,
    role,
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
 * For API routes: catch the bare errors requireRole throws and turn them into
 * a proper JSON 401/403 instead of an HTML 500 page (which breaks clients that
 * do res.json(), e.g. the check-in scanner). Returns the session on success,
 * or a NextResponse to return immediately.
 *
 *   const gate = await requireRoleApi([...]);
 *   if (gate instanceof NextResponse) return gate;
 *   // gate is the session
 */
export async function requireRoleApi(allowed: Role[]) {
  const { NextResponse } = await import("next/server");
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!allowed.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    .sign(QR_SECRET);
}

export async function verifyTicketToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, QR_SECRET, { issuer: "eventflow-qr" });
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
