import crypto from "crypto";
import { prisma } from "@/lib/db";

const TTL_MS = 15 * 60 * 1000; // 15 minutes

/** SHA-256 the raw token; only the hash is ever stored. */
function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Mint a single-use sign-in token for `email`. Returns the RAW token to embed
 * in the email link — the DB stores only its hash. Caller is responsible for
 * not leaking whether the email maps to an existing account.
 */
export async function createMagicLink(email: string, ipAddress?: string | null) {
  const raw = crypto.randomBytes(24).toString("base64url");
  await prisma.magicLink.create({
    data: {
      email: email.toLowerCase(),
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + TTL_MS),
      ipAddress: ipAddress ?? null,
    },
  });
  return raw;
}

/**
 * Validate and burn a token. Returns the associated email on success, or null
 * if the token is unknown, expired, or already used. Single-use is enforced by
 * a conditional update: the row only flips to used when it's still unused, so
 * two concurrent clicks can't both succeed.
 */
export async function consumeMagicLink(rawToken: string): Promise<string | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);

  const link = await prisma.magicLink.findUnique({ where: { tokenHash } });
  if (!link) return null;
  if (link.usedAt) return null;
  if (link.expiresAt < new Date()) return null;

  // Conditional burn: updateMany with usedAt=null guard returns count 0 if a
  // racing request already consumed it.
  const burned = await prisma.magicLink.updateMany({
    where: { id: link.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (burned.count === 0) return null;

  return link.email;
}
