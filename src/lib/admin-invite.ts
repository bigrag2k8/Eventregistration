import crypto from "crypto";

/**
 * Platform-admin (SUPERADMIN) invites. Separate from org invites because platform
 * admins are not tied to an organization. Tokens are random + single-use + short
 * lived, and accepting one requires a STRICT password (stronger than the 8-char
 * minimum used for normal accounts), since the resulting account is the most
 * privileged identity short of the break-glass owner.
 */
export const ADMIN_INVITE_TTL_HOURS = 72;

export function generateAdminInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function adminInviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + ADMIN_INVITE_TTL_HOURS * 60 * 60 * 1000);
}

export const STRONG_PASSWORD_HINT =
  "At least 12 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.";

/** Returns a human-readable error if the password is too weak, else null. */
export function strongPasswordError(pw: string): string | null {
  if (pw.length < 12) return "Password must be at least 12 characters.";
  if (pw.length > 72) return "Password must be at most 72 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must include a symbol.";
  return null;
}
