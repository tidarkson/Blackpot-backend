/*
  Warnings:

  - The `allergens` column on the `MenuItem` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "availabilityWindows" JSONB,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "cost" DECIMAL(10,2),
ADD COLUMN     "dietary" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "kdsStation" TEXT,
ADD COLUMN     "modifiers" JSONB,
ADD COLUMN     "position" INTEGER,
ADD COLUMN     "preparationTime" INTEGER,
DROP COLUMN "allergens",
ADD COLUMN     "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "TenantSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "dateFormat" TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
    "timeFormat" TEXT NOT NULL DEFAULT '12h',
    "logoUrl" TEXT,
    "receiptFooter" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantIntegrationSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stripePublishableKeyEnc" TEXT,
    "stripeWebhookSecretEnc" TEXT,
    "stripeTestMode" BOOLEAN NOT NULL DEFAULT true,
    "printerIp" TEXT,
    "printerPort" INTEGER,
    "kdsStations" JSONB,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "alertsEmail" TEXT,
    "slackWebhookUrlEnc" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantIntegrationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE INDEX "TenantSettings_tenantId_idx" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantIntegrationSettings_tenantId_key" ON "TenantIntegrationSettings"("tenantId");

-- CreateIndex
CREATE INDEX "TenantIntegrationSettings_tenantId_idx" ON "TenantIntegrationSettings"("tenantId");

-- CreateIndex
CREATE INDEX "SystemAuditLog_tenantId_idx" ON "SystemAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "SystemAuditLog_category_idx" ON "SystemAuditLog"("category");

-- CreateIndex
CREATE INDEX "SystemAuditLog_createdAt_idx" ON "SystemAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantIntegrationSettings" ADD CONSTRAINT "TenantIntegrationSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAuditLog" ADD CONSTRAINT "SystemAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
