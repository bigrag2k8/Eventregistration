import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-me-please-32-bytes!"
);
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

export async function getSession(): Promise<JwtPayload | null> {
  const tok = cookies().get(COOKIE_NAME)?.value;
  if (!tok) return null;
  return verifySession(tok);
}

export function requireRole(allowed: Role[], session: JwtPayload | null) {
  if (!session) throw new Error("UNAUTHORIZED");
  if (!allowed.includes(session.role)) throw new Error("FORBIDDEN");
  return session;
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
