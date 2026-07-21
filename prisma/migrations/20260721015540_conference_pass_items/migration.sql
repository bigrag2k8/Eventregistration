-- CreateTable
CREATE TABLE "registration_items" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,

    CONSTRAINT "registration_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registration_items_registrationId_idx" ON "registration_items"("registrationId");

-- CreateIndex
CREATE INDEX "registration_items_ticketTypeId_idx" ON "registration_items"("ticketTypeId");

-- AddForeignKey
ALTER TABLE "registration_items" ADD CONSTRAINT "registration_items_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_items" ADD CONSTRAINT "registration_items_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
