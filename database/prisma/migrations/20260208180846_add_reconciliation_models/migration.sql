-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'LOCKED', 'COMPLETED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DiscrepancyType" AS ENUM ('CASH_SHORTAGE', 'CASH_OVERAGE', 'UNMATCHED_TRANSACTION', 'REVERSED_TRANSACTION');

-- CreateEnum
CREATE TYPE "DiscrepancySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DiscrepancyStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessDayId" TEXT NOT NULL,
    "reconciliationDate" TIMESTAMP(3) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "expectedCash" DECIMAL(12,2) NOT NULL,
    "actualCash" DECIMAL(12,2),
    "cardExpected" DECIMAL(12,2) NOT NULL,
    "cardActual" DECIMAL(12,2),
    "cashDiscrepancy" DECIMAL(12,2),
    "cardDiscrepancy" DECIMAL(12,2),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "denomination" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "settlementAmount" DECIMAL(12,2) NOT NULL,
    "processorFees" DECIMAL(10,2) NOT NULL,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "settlementDate" TIMESTAMP(3) NOT NULL,
    "cardBrand" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discrepancy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "type" "DiscrepancyType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "severity" "DiscrepancySeverity" NOT NULL DEFAULT 'LOW',
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reconciliation_tenantId_idx" ON "Reconciliation"("tenantId");

-- CreateIndex
CREATE INDEX "Reconciliation_reconciliationDate_idx" ON "Reconciliation"("reconciliationDate");

-- CreateIndex
CREATE INDEX "Reconciliation_status_idx" ON "Reconciliation"("status");

-- CreateIndex
CREATE INDEX "Reconciliation_createdAt_idx" ON "Reconciliation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reconciliation_tenantId_reconciliationDate_key" ON "Reconciliation"("tenantId", "reconciliationDate");

-- CreateIndex
CREATE INDEX "CashCount_tenantId_idx" ON "CashCount"("tenantId");

-- CreateIndex
CREATE INDEX "CashCount_reconciliationId_idx" ON "CashCount"("reconciliationId");

-- CreateIndex
CREATE INDEX "CashCount_recordedAt_idx" ON "CashCount"("recordedAt");

-- CreateIndex
CREATE INDEX "CardSettlement_tenantId_idx" ON "CardSettlement"("tenantId");

-- CreateIndex
CREATE INDEX "CardSettlement_reconciliationId_idx" ON "CardSettlement"("reconciliationId");

-- CreateIndex
CREATE INDEX "CardSettlement_cardBrand_idx" ON "CardSettlement"("cardBrand");

-- CreateIndex
CREATE INDEX "CardSettlement_status_idx" ON "CardSettlement"("status");

-- CreateIndex
CREATE INDEX "Discrepancy_tenantId_idx" ON "Discrepancy"("tenantId");

-- CreateIndex
CREATE INDEX "Discrepancy_reconciliationId_idx" ON "Discrepancy"("reconciliationId");

-- CreateIndex
CREATE INDEX "Discrepancy_type_idx" ON "Discrepancy"("type");

-- CreateIndex
CREATE INDEX "Discrepancy_severity_idx" ON "Discrepancy"("severity");

-- CreateIndex
CREATE INDEX "Discrepancy_status_idx" ON "Discrepancy"("status");

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSettlement" ADD CONSTRAINT "CardSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSettlement" ADD CONSTRAINT "CardSettlement_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
