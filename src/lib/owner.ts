/**
 * Protected platform owner ("break-glass") accounts.
 *
 * Designated by the OWNER_EMAIL environment variable (comma-separated to allow a
 * primary + backup). An owner is ALWAYS treated as SUPERADMIN and can never be
 * demoted or removed through the application. This is the "always able to get
 * back in" guarantee — and it is a property of infrastructure you control (the
 * env var on Railway), NOT a hardcoded credential or hidden route in the code.
 *
 * Security note: whoever controls an OWNER_EMAIL inbox can obtain SUPERADMIN via
 * the normal sign-in flow. Keep that inbox locked down (strong password + MFA on
 * the email provider). This is the single most privileged identity on the
 * platform.
 *
 * Pure + env-only so it is safe to import in the edge middleware bundle.
 */
export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isProtectedOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.toLowerCase());
}
