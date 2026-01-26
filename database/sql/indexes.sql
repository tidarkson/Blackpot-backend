-- ================================================================
-- BLACKPOT RESTAURANT POS - PERFORMANCE INDEXES
-- ================================================================
-- Corrected column names based on actual Prisma schema
-- Created: January 26, 2026
-- ================================================================

-- PHASE 1: CRITICAL INDEXES
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_table_status ON "Order"("tableId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at ON "Order"("tenantId", "createdAt" DESC) WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_server ON "Order"("serverId", "createdAt" DESC) WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_courses_kitchen ON "OrderCourse"("kitchenStationId") WHERE "completedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reservations_date ON "Reservation"("tenantId", DATE("reservedAt")) WHERE "cancelledAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_menu_items_section ON "MenuItem"("sectionId", "isAvailable") WHERE "isAvailable" = true;

-- PHASE 2: USER & ACCESS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON "User"(email) WHERE "isActive" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_location ON "User"("locationId") WHERE "isActive" = true;

-- PHASE 3: TABLES
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tables_location_status ON "Table"("locationId", status) WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tables_tenant ON "Table"("tenantId") WHERE "deletedAt" IS NULL;

-- PHASE 4: PAYMENTS & FINANCIAL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_order ON "Payment"("orderId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_date ON "Payment"("tenantId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tips_server ON "Tip"("serverId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_service_charges_order ON "ServiceCharge"("orderId");

-- PHASE 5: INVENTORY
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_tenant ON "InventoryItem"("tenantId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_movements_item ON "StockMovement"("inventoryItemId", "createdAt" DESC);

-- PHASE 6: KITCHEN
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kitchen_location ON "KitchenStation"("locationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_course ON "OrderItem"("orderCourseId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_courses_order ON "OrderCourse"("orderId");

-- PHASE 7: TENANT ISOLATION
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_location_tenant ON "Location"("tenantId") WHERE "isActive" = true;

-- PHASE 8: BUSINESS OPERATIONS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_days_date ON "BusinessDay"("tenantId", DATE(date));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_end_of_day_close_date ON "EndOfDayClose"("businessDayId");

-- PHASE 9: AUDIT
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_tenant ON "ActivityLog"("tenantId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_user ON "ActivityLog"("userId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user ON "Notification"("userId") WHERE "readAt" IS NULL;

-- PHASE 10: COMPLEX QUERIES
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_complete ON "Order"("tableId", "serverId", "createdAt") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_menu_item_section_price ON "MenuItem"("sectionId", price) WHERE "isAvailable" = true;

-- PHASE 11: COMPOSITE
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_menu_sections ON "MenuSection"("menuId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receipts_payment ON "Receipt"("paymentId");

-- Refresh statistics
ANALYZE;
