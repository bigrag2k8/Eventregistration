-- Post-event marketing: org-level attendee blasts + per-org unsubscribe list.
CREATE TABLE "marketing_campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "promotedEventId" TEXT,
    "recipientsCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_campaigns_organizationId_idx" ON "marketing_campaigns"("organizationId");
ALTER TABLE "marketing_campaigns"
  ADD CONSTRAINT "marketing_campaigns_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "marketing_unsubscribes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketing_unsubscribes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketing_unsubscribes_organizationId_email_key" ON "marketing_unsubscribes"("organizationId", "email");
CREATE INDEX "marketing_unsubscribes_organizationId_idx" ON "marketing_unsubscribes"("organizationId");
ALTER TABLE "marketing_unsubscribes"
  ADD CONSTRAINT "marketing_unsubscribes_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
