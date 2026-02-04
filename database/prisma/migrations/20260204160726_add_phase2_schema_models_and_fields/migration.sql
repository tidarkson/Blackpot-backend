-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "lockedDate" TIMESTAMP(3),
ADD COLUMN     "reconciliationStatus" TEXT,
ADD COLUMN     "shiftId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "reconciledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ShiftReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "totalRevenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalCovers" INTEGER NOT NULL DEFAULT 0,
    "averageCheck" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reconciliationDate" TIMESTAMP(3) NOT NULL,
    "totalOrders" INTEGER NOT NULL,
    "matchedOrders" INTEGER NOT NULL,
    "discrepancyCount" INTEGER NOT NULL DEFAULT 0,
    "totalDiscrepancy" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reconciliationStatus" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftReport_tenantId_idx" ON "ShiftReport"("tenantId");

-- CreateIndex
CREATE INDEX "ShiftReport_reportDate_idx" ON "ShiftReport"("reportDate");

-- CreateIndex
CREATE INDEX "ShiftReport_createdAt_idx" ON "ShiftReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftReport_tenantId_reportDate_key" ON "ShiftReport"("tenantId", "reportDate");

-- CreateIndex
CREATE INDEX "ReconciliationLog_tenantId_idx" ON "ReconciliationLog"("tenantId");

-- CreateIndex
CREATE INDEX "ReconciliationLog_reconciliationDate_idx" ON "ReconciliationLog"("reconciliationDate");

-- CreateIndex
CREATE INDEX "ReconciliationLog_reconciliationStatus_idx" ON "ReconciliationLog"("reconciliationStatus");

-- CreateIndex
CREATE INDEX "ReconciliationLog_createdAt_idx" ON "ReconciliationLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationLog_tenantId_reconciliationDate_key" ON "ReconciliationLog"("tenantId", "reconciliationDate");

-- CreateIndex
CREATE INDEX "Payment_reconciledAt_idx" ON "Payment"("reconciledAt");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationLog" ADD CONSTRAINT "ReconciliationLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
