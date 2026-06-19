-- Platform-admin (SUPERADMIN) invites. Not tied to an organization, so they get
-- their own table. Reuses the existing "InviteStatus" enum. Accepting one creates
-- a SUPERADMIN account with a strict password.
CREATE TABLE "admin_invites" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedBy" TEXT,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_invites_token_key" ON "admin_invites"("token");

CREATE INDEX "admin_invites_email_idx" ON "admin_invites"("email");
