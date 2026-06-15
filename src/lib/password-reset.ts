import crypto from "crypto";
import { prisma } from "@/lib/db";

const TTL_MS = 15 * 60 * 1000; // 15 minutes

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Mint a password-reset token for `email`. Returns the RAW token (to embed in
 * the email) only when there's an eligible account: an existing, non-deleted
 * user that actually has a password. Passwordless attendee accounts return null
 * (they sign in with magic links). Returns null without revealing why, so the
 * caller can respond generically.
 */
export async function createPasswordReset(email: string, ipAddress?: string | null) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, deletedAt: true, passwordHash: true },
  });
  if (!user || user.deletedAt || !user.passwordHash) return null;

  const raw = crypto.randomBytes(24).toString("base64url");
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + TTL_MS),
      ipAddress: ipAddress ?? null,
    },
  });
  return raw;
}

/**
 * Validate and burn a reset token. Returns the userId on success, or null if
 * the token is unknown, expired, or already used. Single-use is enforced by a
 * conditional update so two concurrent submissions can't both succeed.
 */
export async function consumePasswordReset(rawToken: string): Promise<string | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);

  const row = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt < new Date()) return null;

  const burned = await prisma.passwordReset.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (burned.count === 0) return null;

  return row.userId;
}
