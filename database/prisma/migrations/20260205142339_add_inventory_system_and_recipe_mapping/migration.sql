-- CreateTable
CREATE TABLE "MenuItemToInventory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantityNeeded" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItemToInventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuItemToInventory_tenantId_idx" ON "MenuItemToInventory"("tenantId");

-- CreateIndex
CREATE INDEX "MenuItemToInventory_menuItemId_idx" ON "MenuItemToInventory"("menuItemId");

-- CreateIndex
CREATE INDEX "MenuItemToInventory_inventoryItemId_idx" ON "MenuItemToInventory"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemToInventory_menuItemId_inventoryItemId_key" ON "MenuItemToInventory"("menuItemId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_idx" ON "InventoryItem"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryItem_category_idx" ON "InventoryItem"("category");

-- CreateIndex
CREATE INDEX "InventoryItem_supplierId_idx" ON "InventoryItem"("supplierId");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_idx" ON "MenuItem"("tenantId");

-- CreateIndex
CREATE INDEX "MenuItem_sectionId_idx" ON "MenuItem"("sectionId");

-- AddForeignKey
ALTER TABLE "MenuItemToInventory" ADD CONSTRAINT "MenuItemToInventory_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemToInventory" ADD CONSTRAINT "MenuItemToInventory_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
