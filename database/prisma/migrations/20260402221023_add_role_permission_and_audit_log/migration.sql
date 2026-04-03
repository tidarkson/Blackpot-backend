-- AlterTable
ALTER TABLE "User" ADD COLUMN     "customRoleName" TEXT;

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RolePermission_tenantId_idx" ON "RolePermission"("tenantId");

-- CreateIndex
CREATE INDEX "RolePermission_deletedAt_idx" ON "RolePermission"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_tenantId_roleName_key" ON "RolePermission"("tenantId", "roleName");

-- CreateIndex
CREATE INDEX "RoleAuditLog_tenantId_idx" ON "RoleAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "RoleAuditLog_roleName_idx" ON "RoleAuditLog"("roleName");

-- CreateIndex
CREATE INDEX "RoleAuditLog_createdAt_idx" ON "RoleAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "User_customRoleName_idx" ON "User"("customRoleName");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAuditLog" ADD CONSTRAINT "RoleAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
