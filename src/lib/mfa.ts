import crypto from "crypto";
import { authenticator } from "otplib";
import { SignJWT, jwtVerify } from "jose";

// Issuer shown in the user's authenticator app entry.
const ISSUER = "Your Events App";

const JWT_SECRET = process.env.JWT_SECRET;
const DEV_FALLBACK = "dev-secret-change-me-please-32-bytes!";
const MFA_SECRET_ENV = process.env.MFA_SECRET;
const IS_PROD_RUNTIME =
  process.env.NEXT_PHASE !== "phase-production-build" && process.env.NODE_ENV === "production";

if (IS_PROD_RUNTIME && !MFA_SECRET_ENV) {
  // Not fatal — we fall back to a key derived from JWT_SECRET — but a dedicated
  // key means a leak of the session secret can't also decrypt enrolled TOTP
  // secrets (same isolation rationale as QR_SECRET / SEC-02).
  // eslint-disable-next-line no-console
  console.warn("[mfa] MFA_SECRET not set — TOTP secrets are encrypted with a key derived from JWT_SECRET. Set a distinct MFA_SECRET to isolate MFA-secret compromise from session compromise.");
}

// AES-256 needs a 32-byte key; scrypt-derive it from the configured secret.
const ENC_KEY = crypto.scryptSync(MFA_SECRET_ENV ?? JWT_SECRET ?? DEV_FALLBACK, "eventflow-mfa-enc", 32);

// Allow one 30s step of clock skew on either side.
authenticator.options = { window: 1 };

/** Encrypt a TOTP secret for storage. Format: ivB64:tagB64:cipherB64. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Decrypt a stored TOTP secret; null if the blob is malformed or tampered. */
export function decryptSecret(blob: string): string | null {
  try {
    const [ivB, tagB, dataB] = blob.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** New random base32 TOTP secret (call at enrollment). */
export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

/** otpauth:// URI to render as a QR code in the authenticator app. */
export function mfaKeyUri(accountLabel: string, secret: string): string {
  return authenticator.keyuri(accountLabel, ISSUER, secret);
}

/** Verify a 6-digit TOTP code against the (decrypted) secret. */
export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\D/g, ""), secret });
  } catch {
    return false;
  }
}

/** Normalize a recovery code (strip spaces/dashes, lowercase) before hashing/compare. */
function normalizeRecovery(code: string): string {
  return code.replace(/[\s-]/g, "").toLowerCase();
}

/** SHA-256 hash of a recovery code for at-rest storage. */
export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeRecovery(code)).digest("hex");
}

/**
 * Generate N single-use recovery codes. Returns the plaintext (shown to the
 * user exactly once) and the hashes (stored on the user row).
 */
export function generateRecoveryCodes(n = 10): { plain: string[]; hashed: string[] } {
  const plain = Array.from({ length: n }, () => {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { plain, hashed: plain.map(hashRecoveryCode) };
}

/**
 * Given the user's stored recovery-code hashes and a submitted code, return the
 * remaining hashes (with the matched one consumed) or null if it doesn't match.
 */
export function consumeRecoveryCode(storedHashes: string[], submitted: string): string[] | null {
  const h = hashRecoveryCode(submitted);
  if (!storedHashes.includes(h)) return null;
  return storedHashes.filter((x) => x !== h);
}

// ── Pre-auth challenge token ──────────────────────────────────────────────
// Issued after the password step succeeds for an MFA-enabled account. It proves
// "factor one passed for user X", is short-lived, and carries a distinct issuer
// so it can never be used as a real session cookie.
const CHALLENGE_KEY = new TextEncoder().encode(JWT_SECRET ?? DEV_FALLBACK);
const CHALLENGE_ISSUER = "eventflow-mfa";

export async function signMfaChallenge(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, typ: "mfa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(CHALLENGE_ISSUER)
    .setExpirationTime("5m")
    .sign(CHALLENGE_KEY);
}

export async function verifyMfaChallenge(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, CHALLENGE_KEY, { issuer: CHALLENGE_ISSUER });
    return payload.typ === "mfa" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
