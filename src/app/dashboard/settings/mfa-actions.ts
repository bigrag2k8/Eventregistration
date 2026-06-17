"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";
import {
  generateMfaSecret, mfaKeyUri, verifyTotp,
  encryptSecret, decryptSecret, generateRecoveryCodes,
} from "@/lib/mfa";
import { audit } from "@/lib/audit";

const MFA_ROLES = ["ORGANIZER", "ADMIN", "SUPERADMIN"] as const;

/**
 * Begin enrollment: mint a TOTP secret, stash it encrypted (mfaEnabled stays
 * false until a code is verified), and return the QR + manual key for the app.
 */
export async function startMfaSetupAction(): Promise<{ qrDataUrl: string; secret: string }> {
  const session = requireRole([...MFA_ROLES], await getSession());
  const secret = generateMfaSecret();
  await prisma.user.update({
    where: { id: session.sub },
    data: { mfaSecret: encryptSecret(secret), mfaEnabled: false },
  });
  const uri = mfaKeyUri(session.email, secret);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { qrDataUrl, secret };
}

/**
 * Finish enrollment: verify the first code against the stashed secret, then flip
 * MFA on and issue single-use recovery codes (returned once, in plaintext).
 */
export async function confirmMfaSetupAction(
  code: string,
): Promise<{ ok: boolean; recoveryCodes?: string[]; error?: string }> {
  const session = requireRole([...MFA_ROLES], await getSession());
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { mfaSecret: true },
  });
  if (!user?.mfaSecret) return { ok: false, error: "Setup expired — start again." };
  const secret = decryptSecret(user.mfaSecret);
  if (!secret || !verifyTotp(secret, code)) {
    return { ok: false, error: "That code didn’t match. Check your app’s clock and try again." };
  }
  const { plain, hashed } = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: session.sub },
    data: { mfaEnabled: true, mfaRecoveryCodes: hashed },
  });
  await audit({ userId: session.sub, action: "auth.mfa_enabled" });
  revalidatePath("/dashboard/settings");
  return { ok: true, recoveryCodes: plain };
}

/** Turn MFA off and wipe the secret + recovery codes. */
export async function disableMfaAction(): Promise<void> {
  const session = requireRole([...MFA_ROLES], await getSession());
  await prisma.user.update({
    where: { id: session.sub },
    data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [] },
  });
  await audit({ userId: session.sub, action: "auth.mfa_disabled" });
  revalidatePath("/dashboard/settings");
}
