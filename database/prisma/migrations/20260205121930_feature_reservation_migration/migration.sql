-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'SEATED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "guestEmail" TEXT,
    "partySize" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "notes" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "seatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Waitlist_tenantId_idx" ON "Waitlist"("tenantId");

-- CreateIndex
CREATE INDEX "Waitlist_status_idx" ON "Waitlist"("status");

-- CreateIndex
CREATE INDEX "Waitlist_guestPhone_idx" ON "Waitlist"("guestPhone");

-- CreateIndex
CREATE INDEX "Waitlist_addedAt_idx" ON "Waitlist"("addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_tenantId_guestPhone_addedAt_key" ON "Waitlist"("tenantId", "guestPhone", "addedAt");

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
