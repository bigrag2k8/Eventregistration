-- Platform-wide singleton config (one row). Holds the maintenance-mode switch.
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceUntil" TIMESTAMP(3),
    "maintenanceMessage" TEXT,
    "maintenanceStartedById" TEXT,
    "maintenanceStartedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row so every read is an upsert-free findUnique.
INSERT INTO "platform_config" ("id", "maintenanceMode", "updatedAt")
VALUES ('singleton', false, CURRENT_TIMESTAMP);
