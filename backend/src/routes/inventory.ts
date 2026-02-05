import { Router } from 'express';
import { inventoryController } from '../controllers/InventoryController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';

const router = Router();

/**
 * Inventory Management Routes
 * All routes require authentication and tenant isolation
 */

// ================================
// INVENTORY ITEMS MANAGEMENT
// ================================

/**
 * GET /api/inventory/items
 * Get all inventory items with optional filters
 * Query params: category, supplierId, searchTerm, onlyLowStock
 */
router.get(
  '/items',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.getInventoryItems(req, res)
);

/**
 * GET /api/inventory/items/:id
 * Get specific inventory item details
 */
router.get(
  '/items/:id',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.getInventoryItemById(req, res)
);

/**
 * POST /api/inventory/items
 * Create new inventory item
 * Body: { name, category, unit, currentStock, minStock, unitCost, supplierId? }
 */
router.post(
  '/items',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.createInventoryItem(req, res)
);

/**
 * PUT /api/inventory/items/:id
 * Update inventory item
 * Body: { name?, category?, unit?, minStock?, unitCost?, supplierId? }
 */
router.put(
  '/items/:id',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.updateInventoryItem(req, res)
);

/**
 * DELETE /api/inventory/items/:id
 * Delete inventory item
 */
router.delete(
  '/items/:id',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.deleteInventoryItem(req, res)
);

// ================================
// STOCK MANAGEMENT
// ================================

/**
 * POST /api/inventory/items/:id/adjust
 * Adjust stock quantity (add/remove)
 * Body: { quantity, movementType, reason }
 * movementType: 'purchase' | 'sale' | 'waste' | 'adjustment'
 */
router.post(
  '/items/:id/adjust',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.adjustStock(req, res)
);

/**
 * GET /api/inventory/items/:id/history
 * Get stock movement history for an item
 * Query params: limit (default: 50, max: 500)
 */
router.get(
  '/items/:id/history',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.getStockMovementHistory(req, res)
);

/**
 * GET /api/inventory/low-stock
 * Get all items below minimum stock threshold
 */
router.get(
  '/low-stock',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.getLowStockItems(req, res)
);

// ================================
// WINE CELLAR MANAGEMENT
// ================================

/**
 * GET /api/inventory/wine-cellar
 * Get all wines in inventory
 */
router.get(
  '/wine-cellar',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.getWines(req, res)
);

/**
 * POST /api/inventory/wine-cellar
 * Add new wine to inventory
 * Body: { name, currentStock, minStock, unitCost, vintage, region, varietal, binLocation, tastingNotes?, pairingNotes?, supplierId? }
 */
router.post(
  '/wine-cellar',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.addWine(req, res)
);

/**
 * PUT /api/inventory/wine-cellar/:id
 * Update wine details
 * Body: { name?, vintage?, region?, varietal?, binLocation?, tastingNotes?, pairingNotes?, unitCost?, minStock? }
 */
router.put(
  '/wine-cellar/:id',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.updateWine(req, res)
);

/**
 * GET /api/inventory/wine-cellar/pairings
 * Get wine pairing suggestions
 * Query params: mainCourseCategory (optional)
 */
router.get(
  '/wine-cellar/pairings',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.getWinePairings(req, res)
);

// ================================
// CATEGORIES
// ================================

/**
 * GET /api/inventory/categories
 * Get all inventory categories
 */
router.get(
  '/categories',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.getCategories(req, res)
);

// ================================
// SUPPLIERS
// ================================

/**
 * GET /api/inventory/suppliers
 * Get all suppliers
 */
router.get(
  '/suppliers',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.getSuppliers(req, res)
);

/**
 * POST /api/inventory/suppliers
 * Create new supplier
 * Body: { name, contact? }
 */
router.post(
  '/suppliers',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.createSupplier(req, res)
);

// ================================
// INVENTORY VALUATION & ANALYTICS
// ================================

/**
 * GET /api/inventory/valuation
 * Calculate total inventory value and breakdown by category
 */
router.get(
  '/valuation',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.calculateInventoryValuation(req, res)
);

// ================================
// RECIPE/MENU ITEM TO INVENTORY MAPPING
// ================================

/**
 * POST /api/inventory/menu-items/:menuItemId/recipe
 * Map a menu item to inventory items (define recipe/ingredients)
 * Body: { inventoryMappings: [{ inventoryItemId, quantityNeeded, unit }] }
 */
router.post(
  '/menu-items/:menuItemId/recipe',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.mapMenuItemToInventory(req, res)
);

/**
 * GET /api/inventory/menu-items/:menuItemId/recipe
 * Get recipe for a menu item (all mapped ingredients)
 */
router.get(
  '/menu-items/:menuItemId/recipe',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.getMenuItemRecipe(req, res)
);

/**
 * GET /api/inventory/menu-items/:menuItemId/availability
 * Check if menu item can be prepared (all ingredients in stock)
 */
router.get(
  '/menu-items/:menuItemId/availability',
  authenticate,
  ensureTenantAccess,
  (req, res) => inventoryController.checkMenuItemAvailability(req, res)
);

export default router;
