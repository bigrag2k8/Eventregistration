import * as React from "react";
import { SignJWT, jwtVerify, decodeJwt } from "jose";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
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

// SEC-02: QR ticket + review tokens are signed with a SEPARATE key (QR_SECRET),
// so leaking one secret doesn't compromise both surfaces (sessions AND check-in).
//
// This THROWS rather than warns when unset in production, because the old
// silent "fall back to JWT_SECRET" behaviour caused a real outage: QR_SECRET was
// set on the web service but never on the worker, so the worker signed review
// links and reissued QR tickets with JWT_SECRET while the web verified them with
// QR_SECRET. Every such token failed verification — invisibly, because nothing
// logs a signature mismatch and the review page rendered the failure as
// "expired". An unscannable ticket is otherwise only discovered at the door.
//
// A per-process fallback cannot be safe for a signing key: it only means
// anything if every signer and every verifier agree, and no process can see
// another's env. Refusing to boot is what makes a disagreement surface
// immediately instead of at a customer.
// NOTE: changing QR_SECRET's VALUE still invalidates already-issued tokens — do
// that cutover between events, then use the per-event "Reissue tickets".
if (IS_PROD_RUNTIME) {
  if (!QR_SECRET_ENV) {
    throw new Error(
      "QR_SECRET is not set. Every service that signs or verifies QR tickets and review links " +
        "(web AND worker) must share the same QR_SECRET — a per-process fallback silently breaks " +
        "tickets and review links across services. Set QR_SECRET on this service, referencing the " +
        "web service's value so the two can never drift.",
    );
  }
  if (QR_SECRET_ENV === DEV_FALLBACK_QR_SECRET) {
    throw new Error("QR_SECRET is set to the public dev fallback. Set a strong, distinct value.");
  }
  if (QR_SECRET_ENV === JWT_SECRET) {
    // eslint-disable-next-line no-console
    console.warn("[auth] QR_SECRET equals JWT_SECRET — use a distinct value to isolate the QR-token blast radius (SEC-02).");
  }
}

const SECRET = new TextEncoder().encode(JWT_SECRET ?? DEV_FALLBACK_SECRET);
// Dedicated QR signing key. Falls back to the session secret when QR_SECRET is
// unset (no breakage), then to the dev value for local development only.
const QR_SECRET = new TextEncoder().encode(QR_SECRET_ENV ?? JWT_SECRET ?? DEV_FALLBACK_QR_SECRET);
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "eventflow_session";
const COOKIE_NAME = SESSION_COOKIE_NAME;

// Session lifetime by privilege. Attendees (low-stakes, just their own tickets)
// get a 7-day persistent session for good UX. Every staff role — organizer,
// staff, volunteer, admin, superadmin — touches money, refunds, and PII, so
// they get a short 12-hour session that forces a daily re-auth.
const ATTENDEE_TTL = 60 * 60 * 24 * 7; // 7 days
const STAFF_TTL = 60 * 60 * 12;        // 12 hours

export function sessionTtlSeconds(role: Role): number {
  return role === "ATTENDEE" ? ATTENDEE_TTL : STAFF_TTL;
}

// Shared session-cookie attributes. maxAge here is only a fallback — the real
// value is derived per-token from its exp (see cookieMaxAgeForToken) so the
// cookie's lifetime always matches the JWT's, regardless of role.
export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: ATTENDEE_TTL,
};

// Cookie Max-Age = the token's remaining lifetime, so a 12h staff token never
// sits behind a 7-day cookie (and vice versa). Reads the unverified exp claim of
// our own freshly-signed token — no signature check needed just to size a cookie.
function cookieMaxAgeForToken(token: string): number {
  try {
    const { exp } = decodeJwt(token);
    if (exp) return Math.max(0, exp - Math.floor(Date.now() / 1000));
  } catch {}
  return SESSION_COOKIE_OPTS.maxAge;
}

export interface JwtPayload {
  sub: string;       // user id
  role: Role;
  orgId?: string;
  email: string;
  ver?: number;      // NEW-02: session epoch (User.sessionVersion) at sign time
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signSession(payload: JwtPayload, expiresSeconds?: number) {
  // Default the token lifetime from the role (12h staff / 7d attendee); callers
  // may override with an explicit number of seconds.
  const ttl = expiresSeconds ?? sessionTtlSeconds(payload.role);
  const exp = Math.floor(Date.now() / 1000) + ttl;
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(process.env.JWT_ISSUER ?? "eventflow")
    .setExpirationTime(exp)
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

// For Server Action / Server Component contexts (e.g. the sign-out action),
// where cookies() mutations are reliably applied to the framework response.
export async function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, { ...SESSION_COOKIE_OPTS, maxAge: cookieMaxAgeForToken(token) });
}

export async function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

/**
 * Attach the session cookie to a Response returned from a Route Handler.
 *
 * CRITICAL: in App Router Route Handlers, cookies().set() from next/headers is
 * NOT applied to a NextResponse you construct yourself — most visibly on
 * NextResponse.redirect(), where the Set-Cookie header is silently dropped. The
 * magic-link sign-in returns a redirect, so attendees never received a
 * persistent cookie and were logged out on the next request. Setting the cookie
 * on the response object is the reliable way; use this in every route that
 * issues a session.
 */
export function attachSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, token, { ...SESSION_COOKIE_OPTS, maxAge: cookieMaxAgeForToken(token) });
  return res;
}

/** Clear the session cookie on a Route Handler response (mirror of the above). */
export function clearSessionCookieOn(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, "", { ...SESSION_COOKIE_OPTS, maxAge: 0 });
  return res;
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
    select: { id: true, email: true, role: true, organizationId: true, deletedAt: true, sessionVersion: true },
  });
  if (!user || user.deletedAt) return null;

  // NEW-02: reject a token whose session epoch is stale (e.g. issued before a
  // password reset bumped sessionVersion). Pre-deploy tokens carry no "ver"
  // claim; treat them as the default epoch (1) so this change logs nobody out
  // until their version is actually incremented.
  const tokenVer = typeof claims.ver === "number" ? claims.ver : 1;
  if (user.sessionVersion !== tokenVer) return null;

  // Break-glass: a protected owner (OWNER_EMAIL) is always SUPERADMIN at read
  // time, regardless of the stored role — so the owner can never be locked out,
  // even if their DB role was changed. No DB write here (hot path).
  const role: Role = isProtectedOwner(user.email) ? "SUPERADMIN" : user.role;

  return {
    sub: user.id,
    role,
    orgId: user.organizationId ?? undefined,
    email: user.email,
    ver: user.sessionVersion,
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
 * For server-component PAGES: redirect on auth failure instead of throwing.
 *
 * `requireRole` throws "UNAUTHORIZED" / "FORBIDDEN" — fine in API routes but in
 * a Server Component that surfaces as "An error occurred in the Server
 * Components render" (HTTP 500 + Sentry alert). Pages should redirect to
 * /signin or /dashboard cleanly. Middleware already pre-filters /dashboard/* to
 * staff roles, but pages that restrict below middleware (e.g. /dashboard/team
 * is organizer-only) would otherwise blow up when STAFF/VOLUNTEER browse in.
 *
 *   const session = await requireRolePage(["ORGANIZER", "ADMIN", "SUPERADMIN"]);
 */
export async function requireRolePage(allowed: Role[]): Promise<JwtPayload> {
  const { redirect } = await import("next/navigation");
  const session = await getSession();
  // The unreachable throws after redirect() keep TS's control-flow analysis
  // happy — redirect() does throw, but typed through dynamic import it loses
  // its `never` return so TS otherwise wouldn't narrow `session` to non-null.
  if (!session) { redirect("/signin"); throw new Error("unreachable"); }
  if (!allowed.includes(session.role)) { redirect("/dashboard"); throw new Error("unreachable"); }
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
}, eventEndAt?: Date) {
  // NEW-01: bound the token's cryptographic validity. A photographed/leaked QR
  // is otherwise valid forever; single-use scanning is the primary control, but
  // an expiry shrinks the replay window. Use event end + a generous 7-day buffer
  // (absorbs timezone skew, late or multi-day check-in, and reschedules) so a
  // legitimate attendee is never rejected at the door, while still reducing
  // validity from "forever" to ~a week past the event. Falls back to 30 days
  // when no end time is supplied (issueTickets always supplies one).
  const exp = eventEndAt
    ? new Date(eventEndAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    : "30d";
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("eventflow-qr")
    .setExpirationTime(exp)
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

/**
 * Post-event review token: a signed, SINGLE-PURPOSE link mailed to a verified
 * attendee so they can review without logging in. It authorizes exactly one
 * thing — submitting/viewing the review for `registrationId` — and MUST NOT be
 * treated as a session (it never issues the session cookie). Signed with the QR
 * key (isolated from JWT_SECRET, SEC-02) under a distinct issuer so a review
 * link can't be replayed as a QR ticket or vice versa. 60-day validity so a
 * late click still lands after the event.
 */
export async function signReviewToken(payload: { registrationId: string }) {
  return new SignJWT({ registrationId: payload.registrationId, typ: "review" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("eventflow-review")
    .setExpirationTime("60d")
    .sign(QR_SECRET);
}

export async function verifyReviewToken(token: string): Promise<{ registrationId: string } | null> {
  return (await verifyReviewTokenResult(token)).claim;
}

/**
 * Like verifyReviewToken, but says WHY it failed. The old catch-all reported
 * every failure as "expired", which hid a live signature mismatch (the worker
 * signed with a different key than the web verified with) behind a friendly
 * "your link lapsed" page for its entire lifetime. A bad signature is an
 * incident; a genuinely expired link is routine. They must not look the same.
 */
export async function verifyReviewTokenResult(
  token: string,
): Promise<{ claim: { registrationId: string } | null; reason?: "expired" | "invalid" }> {
  try {
    const { payload } = await jwtVerify(token, QR_SECRET, { issuer: "eventflow-review" });
    if (payload.typ !== "review" || typeof payload.registrationId !== "string") {
      return { claim: null, reason: "invalid" };
    }
    return { claim: { registrationId: payload.registrationId } };
  } catch (e: any) {
    // jose sets code ERR_JWT_EXPIRED only for a real exp lapse; anything else
    // (signature, issuer, malformed) is an invalid token, not an expired one.
    if (e?.code === "ERR_JWT_EXPIRED") return { claim: null, reason: "expired" };
    // eslint-disable-next-line no-console
    console.error("[auth] review token rejected as INVALID (not expired):", e?.code ?? e?.message);
    return { claim: null, reason: "invalid" };
  }
}

/**
 * Marketing unsubscribe token — identifies (org, email) so a one-click link can
 * suppress that recipient. Deliberately has NO expiry: CAN-SPAM requires the
 * opt-out mechanism to keep working, and a stale email's unsubscribe link must
 * never "expire" into being unremovable. Signed with QR_SECRET like the other
 * public tokens.
 */
export async function signUnsubscribeToken(payload: { organizationId: string; email: string }) {
  return new SignJWT({ organizationId: payload.organizationId, email: payload.email, typ: "unsub" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("eventflow-unsub")
    .sign(QR_SECRET);
}

export async function verifyUnsubscribeToken(
  token: string,
): Promise<{ organizationId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, QR_SECRET, { issuer: "eventflow-unsub" });
    if (payload.typ !== "unsub" || typeof payload.organizationId !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { organizationId: payload.organizationId, email: payload.email };
  } catch {
    return null;
  }
}
