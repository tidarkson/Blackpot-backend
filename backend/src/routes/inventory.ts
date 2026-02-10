import { Router } from 'express';
import { inventoryController } from '../controllers/InventoryController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';
import { inventoryCreationLimiter, inventoryUpdateLimiter, inventoryRetrievalLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * ✅ ACCEPTANCE CRITERIA: Inventory Endpoints with Rate Limiting
 * All inventory operations are protected with appropriate rate limits
 * Creation operations: 100 per minute (e.g., POST /api/inventory/items)
 * Read operations: 200 per minute (e.g., GET /api/inventory/items)
 * Update operations: 100 per minute (e.g., PUT /api/inventory/items/:id)
 * Premium accounts have 3x higher limits
 */

// ================================
// INVENTORY ITEMS MANAGEMENT
// ================================

/**
 * GET /api/inventory/items
 * Rate Limit: 200 per minute per account
 * Rationale: Read operations have higher limits than writes
 * Premium: 600 per minute
 * Get all inventory items with optional filters
 * Query params: category, supplierId, searchTerm, onlyLowStock
 */
router.get(
  '/items',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.getInventoryItems(req, res)
);

/**
 * GET /api/inventory/items/:id
 * Rate Limit: 200 per minute per account
 * Get specific inventory item details
 */
router.get(
  '/items/:id',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.getInventoryItemById(req, res)
);

/**
 * POST /api/inventory/items
 * Rate Limit: 100 per minute per account
 * Rationale: Creation operations are write-intensive
 * Premium: 300 per minute
 * Create new inventory item
 * Body: { name, category, unit, currentStock, minStock, unitCost, supplierId? }
 */
router.post(
  '/items',
  authenticate,
  ensureTenantAccess,
  inventoryCreationLimiter,
  (req, res) => inventoryController.createInventoryItem(req, res)
);

/**
 * PUT /api/inventory/items/:id
 * Rate Limit: 100 per minute per account
 * Rationale: Update operations are write-intensive but less frequent than reads
 * Premium: 300 per minute
 * Update inventory item
 * Body: { name?, category?, unit?, minStock?, unitCost?, supplierId? }
 */
router.put(
  '/items/:id',
  authenticate,
  ensureTenantAccess,
  inventoryUpdateLimiter,
  (req, res) => inventoryController.updateInventoryItem(req, res)
);

/**
 * DELETE /api/inventory/items/:id
 * Rate Limit: 100 per minute per account
 * Delete inventory item
 */
router.delete(
  '/items/:id',
  authenticate,
  ensureTenantAccess,
  inventoryUpdateLimiter,
  (req, res) => inventoryController.deleteInventoryItem(req, res)
);

// ================================
// STOCK MANAGEMENT
// ================================

/**
 * POST /api/inventory/items/:id/adjust
 * Rate Limit: 100 per minute per account
 * Adjust stock quantity (add/remove)
 * Body: { quantity, movementType, reason }
 * movementType: 'purchase' | 'sale' | 'waste' | 'adjustment'
 */
router.post(
  '/items/:id/adjust',
  authenticate,
  ensureTenantAccess,
  inventoryCreationLimiter,
  (req, res) => inventoryController.adjustStock(req, res)
);

/**
 * GET /api/inventory/items/:id/history
 * Rate Limit: 200 per minute per account
 * Get stock movement history for an item
 * Query params: limit (default: 50, max: 500)
 */
router.get(
  '/items/:id/history',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.getStockMovementHistory(req, res)
);

/**
 * GET /api/inventory/low-stock
 * Rate Limit: 200 per minute per account
 * Get all items below minimum stock threshold
 */
router.get(
  '/low-stock',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.getLowStockItems(req, res)
);

// ================================
// WINE CELLAR MANAGEMENT
// ================================

/**
 * GET /api/inventory/wine-cellar
 * Rate Limit: 200 per minute per account
 * Get all wines in inventory
 */
router.get(
  '/wine-cellar',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.getWines(req, res)
);

/**
 * POST /api/inventory/wine-cellar
 * Rate Limit: 100 per minute per account
 * Add new wine to inventory
 * Body: { name, currentStock, minStock, unitCost, vintage, region, varietal, binLocation, tastingNotes?, pairingNotes?, supplierId? }
 */
router.post(
  '/wine-cellar',
  authenticate,
  ensureTenantAccess,
  inventoryCreationLimiter,
  (req, res) => inventoryController.addWine(req, res)
);

/**
 * PUT /api/inventory/wine-cellar/:id
 * Rate Limit: 100 per minute per account
 * Update wine details
 * Body: { name?, vintage?, region?, varietal?, binLocation?, tastingNotes?, pairingNotes?, unitCost?, minStock? }
 */
router.put(
  '/wine-cellar/:id',
  authenticate,
  ensureTenantAccess,
  inventoryUpdateLimiter,
  (req, res) => inventoryController.updateWine(req, res)
);

/**
 * GET /api/inventory/wine-cellar/pairings
 * Rate Limit: 200 per minute per account
 * Get wine pairing suggestions
 * Query params: mainCourseCategory (optional)
 */
router.get(
  '/wine-cellar/pairings',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.getWinePairings(req, res)
);

// ================================
// CATEGORIES
// ================================

/**
 * GET /api/inventory/categories
 * Rate Limit: 200 per minute per account
 * Get all inventory categories
 */
router.get(
  '/categories',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.getCategories(req, res)
);

// ================================
// SUPPLIERS
// ================================

/**
 * GET /api/inventory/suppliers
 * Rate Limit: 200 per minute per account
 * Get all suppliers
 */
router.get(
  '/suppliers',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.getSuppliers(req, res)
);

/**
 * POST /api/inventory/suppliers
 * Rate Limit: 100 per minute per account
 * Create new supplier
 * Body: { name, contact? }
 */
router.post(
  '/suppliers',
  authenticate,
  ensureTenantAccess,
  inventoryCreationLimiter,
  (req, res) => inventoryController.createSupplier(req, res)
);

// ================================
// INVENTORY VALUATION & ANALYTICS
// ================================

/**
 * GET /api/inventory/valuation
 * Rate Limit: 200 per minute per account
 * Calculate total inventory value and breakdown by category
 */
router.get(
  '/valuation',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.calculateInventoryValuation(req, res)
);

// ================================
// RECIPE/MENU ITEM TO INVENTORY MAPPING
// ================================

/**
 * POST /api/inventory/menu-items/:menuItemId/recipe
 * Rate Limit: 100 per minute per account
 * Map a menu item to inventory items (define recipe/ingredients)
 * Body: { inventoryMappings: [{ inventoryItemId, quantityNeeded, unit }] }
 */
router.post(
  '/menu-items/:menuItemId/recipe',
  authenticate,
  ensureTenantAccess,
  inventoryCreationLimiter,
  (req, res) => inventoryController.mapMenuItemToInventory(req, res)
);

/**
 * GET /api/inventory/menu-items/:menuItemId/recipe
 * Rate Limit: 200 per minute per account
 * Get recipe for a menu item (all mapped ingredients)
 */
router.get(
  '/menu-items/:menuItemId/recipe',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.getMenuItemRecipe(req, res)
);

/**
 * GET /api/inventory/menu-items/:menuItemId/availability
 * Rate Limit: 200 per minute per account
 * Check if menu item can be prepared (all ingredients in stock)
 */
router.get(
  '/menu-items/:menuItemId/availability',
  authenticate,
  ensureTenantAccess,
  inventoryRetrievalLimiter,
  (req, res) => inventoryController.checkMenuItemAvailability(req, res)
);

export default router;
