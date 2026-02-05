-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('CIRCLE', 'SQUARE', 'RECTANGLE');

-- AlterTable
ALTER TABLE "Table" ADD COLUMN     "sectionId" TEXT,
ADD COLUMN     "serverId" TEXT,
ADD COLUMN     "shape" "TableShape" NOT NULL DEFAULT 'RECTANGLE';

-- CreateTable
CREATE TABLE "TableSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableSection_tenantId_idx" ON "TableSection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TableSection_tenantId_name_key" ON "TableSection"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Table_sectionId_idx" ON "Table"("sectionId");

-- CreateIndex
CREATE INDEX "Table_serverId_idx" ON "Table"("serverId");

-- AddForeignKey
ALTER TABLE "TableSection" ADD CONSTRAINT "TableSection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TableSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
