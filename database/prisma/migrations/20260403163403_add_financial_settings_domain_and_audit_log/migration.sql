-- CreateTable
CREATE TABLE "FinancialSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0875,
    "taxLabel" TEXT NOT NULL DEFAULT 'Tax',
    "serviceChargeRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0,
    "serviceChargeLabel" TEXT NOT NULL DEFAULT 'Service Charge',
    "serviceChargeApply" BOOLEAN NOT NULL DEFAULT false,
    "tipPolicy" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "defaultTipPercent" DECIMAL(5,4) NOT NULL DEFAULT 0.18,
    "roundingPolicy" TEXT NOT NULL DEFAULT 'NONE',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "currencyLocale" TEXT NOT NULL DEFAULT 'en-US',
    "currencySymbol" TEXT NOT NULL DEFAULT '$',
    "payoutSchedule" TEXT NOT NULL DEFAULT 'WEEKLY',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "FinancialSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialSettings_tenantId_key" ON "FinancialSettings"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_tenantId_idx" ON "FinancialAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "FinancialAuditLog_createdAt_idx" ON "FinancialAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "FinancialSettings" ADD CONSTRAINT "FinancialSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAuditLog" ADD CONSTRAINT "FinancialAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
