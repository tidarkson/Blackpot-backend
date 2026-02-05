-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SpecialRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "allergens" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "orderNumber" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "allergenWarnings" TEXT;

-- CreateTable
CREATE TABLE "SpecialRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "SpecialRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpecialRequest_orderId_idx" ON "SpecialRequest"("orderId");

-- CreateIndex
CREATE INDEX "SpecialRequest_tenantId_idx" ON "SpecialRequest"("tenantId");

-- CreateIndex
CREATE INDEX "SpecialRequest_status_idx" ON "SpecialRequest"("status");

-- CreateIndex
CREATE INDEX "SpecialRequest_priority_idx" ON "SpecialRequest"("priority");

-- AddForeignKey
ALTER TABLE "SpecialRequest" ADD CONSTRAINT "SpecialRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialRequest" ADD CONSTRAINT "SpecialRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
