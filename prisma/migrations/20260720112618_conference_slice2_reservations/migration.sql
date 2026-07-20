-- CreateEnum
CREATE TYPE "SessionReservationStatus" AS ENUM ('SEAT', 'WAITLIST');

-- AlterEnum
ALTER TYPE "EmailKind" ADD VALUE 'SESSION_WAITLIST_PROMOTED';

-- AlterTable
ALTER TABLE "event_sessions" ADD COLUMN     "capacity" INTEGER;

-- CreateTable
CREATE TABLE "session_reservations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "status" "SessionReservationStatus" NOT NULL DEFAULT 'SEAT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_reservations_sessionId_status_position_idx" ON "session_reservations"("sessionId", "status", "position");

-- CreateIndex
CREATE INDEX "session_reservations_registrationId_idx" ON "session_reservations"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "session_reservations_sessionId_registrationId_key" ON "session_reservations"("sessionId", "registrationId");

-- AddForeignKey
ALTER TABLE "session_reservations" ADD CONSTRAINT "session_reservations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reservations" ADD CONSTRAINT "session_reservations_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
