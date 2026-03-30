import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import InventoryService from '../src/services/InventoryService';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

const prisma = new PrismaClient();
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIfIntegration = runIntegrationTests ? describe : describe.skip;

describeIfIntegration('Inventory Management System - Implementation Tests', () => {
  let tenantId: string;
  let supplierId: string;
  let inventoryItemId: string;
  let wineItemId: string;
  let menuItemId: string;
  let userId: string;
  let locationId: string;

  beforeAll(async () => {
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Inventory Restaurant',
        isActive: true,
      },
    });
    tenantId = tenant.id;

    // Create location
    const location = await prisma.location.create({
      data: {
        tenantId,
        name: 'Main Kitchen',
      },
    });
    locationId = location.id;

    // Create user (for audit trail)
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: 'inventory-manager@test.com',
        name: 'Inventory Manager',
        passwordHash: 'hashed',
        role: 'MANAGER',
        locationId,
      },
    });
    userId = user.id;

    // Create menu section
    const menu = await prisma.menu.create({
      data: {
        tenantId,
        name: 'Main Menu',
        isActive: true,
      },
    });

    const section = await prisma.menuSection.create({
      data: {
        tenantId,
        menuId: menu.id,
        name: 'Main Course',
        position: 1,
      },
    });

    // Create menu item for recipe testing
    const menuItem = await prisma.menuItem.create({
      data: {
        tenantId,
        sectionId: section.id,
        name: 'Grilled Salmon',
        description: 'Fresh Atlantic salmon',
        price: new Decimal('35.00'),
        isAvailable: true,
      },
    });
    menuItemId = menuItem.id;
  });

  afterAll(async () => {
    // Cleanup in order
    await prisma.menuItemToInventory.deleteMany({ where: { tenantId } });
    await prisma.stockMovement.deleteMany({ where: { tenantId } });
    await prisma.wineDetail.deleteMany({});
    await prisma.inventoryItem.deleteMany({ where: { tenantId } });
    await prisma.supplier.deleteMany({ where: { tenantId } });
    await prisma.menuItem.deleteMany({ where: { tenantId } });
    await prisma.menuSection.deleteMany({ where: { tenantId } });
    await prisma.menu.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.location.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  // ========================================
  // PHASE 1: SUPPLIERS CRUD
  // ========================================

  describe('Phase 1: Supplier Management', () => {
    test('✅ Should create a new supplier', async () => {
      const supplier = await InventoryService.createSupplier(tenantId, {
        name: 'Fresh Foods Distribution',
        contact: '+1-555-FRESH-1',
      });

      expect(supplier.name).toBe('Fresh Foods Distribution');
      expect(supplier.contact).toBe('+1-555-FRESH-1');
      expect(supplier.tenantId).toBe(tenantId);

      supplierId = supplier.id;
    });

    test('✅ Should get all suppliers', async () => {
      const suppliers = await InventoryService.getSuppliers(tenantId);

      expect(suppliers.length).toBeGreaterThan(0);
      expect(suppliers[0].name).toBeDefined();
      expect(suppliers[0].tenantId).toBe(tenantId);
    });

    test('✅ Should include inventory items count in supplier', async () => {
      const suppliers = await InventoryService.getSuppliers(tenantId);

      const supplier = suppliers.find((s) => s.id === supplierId);
      expect(supplier).toBeDefined();
      expect(supplier?.inventoryItems).toBeDefined();
    });
  });

  // ========================================
  // PHASE 2: INVENTORY ITEMS CRUD
  // ========================================

  describe('Phase 2: Inventory Items CRUD', () => {
    test('✅ Should create inventory item', async () => {
      const item = await InventoryService.createInventoryItem(tenantId, {
        name: 'Atlantic Salmon Fillet',
        category: 'seafood',
        unit: 'lbs',
        currentStock: 50,
        minStock: 10,
        unitCost: 15.5,
        supplierId,
      });

      expect(item.name).toBe('Atlantic Salmon Fillet');
      expect(item.category).toBe('seafood');
      expect(item.unit).toBe('lbs');
      expect(item.currentStock).toEqual(new Decimal('50'));
      expect(item.minStock).toEqual(new Decimal('10'));
      expect(item.supplierId).toBe(supplierId);

      inventoryItemId = item.id;
    });

    test('✅ Should get inventory item by ID', async () => {
      const item = await InventoryService.getInventoryItemById(inventoryItemId, tenantId);

      expect(item.id).toBe(inventoryItemId);
      expect(item.name).toBe('Atlantic Salmon Fillet');
    });

    test('✅ Should get all inventory items', async () => {
      const items = await InventoryService.getInventoryItems(tenantId);

      expect(items.length).toBeGreaterThan(0);
      expect(items.some((i) => i.id === inventoryItemId)).toBe(true);
    });

    test('✅ Should filter items by category', async () => {
      const items = await InventoryService.getInventoryItems(tenantId, {
        category: 'seafood',
      });

      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.category === 'seafood')).toBe(true);
    });

    test('✅ Should filter items by supplier', async () => {
      const items = await InventoryService.getInventoryItems(tenantId, {
        supplierId,
      });

      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.supplierId === supplierId)).toBe(true);
    });

    test('✅ Should search items by name', async () => {
      const items = await InventoryService.getInventoryItems(tenantId, {
        searchTerm: 'salmon',
      });

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].name.toLowerCase()).toContain('salmon');
    });

    test('✅ Should update inventory item', async () => {
      const updated = await InventoryService.updateInventoryItem(inventoryItemId, tenantId, {
        unitCost: 16.5,
        minStock: 15,
      });

      expect(updated.unitCost).toEqual(new Decimal('16.5'));
      expect(updated.minStock).toEqual(new Decimal('15'));
    });
  });

  // ========================================
  // PHASE 3: STOCK ADJUSTMENTS
  // ========================================

  describe('Phase 3: Stock Adjustments & Movement History', () => {
    test('✅ Should adjust stock - purchase', async () => {
      const result = await InventoryService.adjustStock(inventoryItemId, tenantId, {
        quantity: 20,
        movementType: 'purchase',
        reason: 'Weekly delivery from supplier',
        performedBy: userId,
      });

      expect(result.item.currentStock).toEqual(new Decimal('70')); // 50 + 20
      expect(result.movement.type).toBe('purchase');
      expect(result.movement.quantity).toEqual(new Decimal('20'));
    });

    test('✅ Should adjust stock - sale/usage', async () => {
      const result = await InventoryService.adjustStock(inventoryItemId, tenantId, {
        quantity: -5,
        movementType: 'sale',
        reason: 'Used in orders',
        performedBy: userId,
      });

      expect(result.item.currentStock).toEqual(new Decimal('65')); // 70 - 5
      expect(result.movement.type).toBe('sale');
    });

    test('✅ Should adjust stock - waste', async () => {
      const result = await InventoryService.adjustStock(inventoryItemId, tenantId, {
        quantity: -2,
        movementType: 'waste',
        reason: 'Expired batch',
        performedBy: userId,
      });

      expect(result.item.currentStock).toEqual(new Decimal('63')); // 65 - 2
      expect(result.movement.type).toBe('waste');
    });

    test('✅ Should adjust stock - manual adjustment', async () => {
      const result = await InventoryService.adjustStock(inventoryItemId, tenantId, {
        quantity: -3,
        movementType: 'adjustment',
        reason: 'Inventory count discrepancy',
        performedBy: userId,
      });

      expect(result.item.currentStock).toEqual(new Decimal('60')); // 63 - 3
    });

    test('❌ Should prevent negative stock for sale', async () => {
      await expect(
        InventoryService.adjustStock(inventoryItemId, tenantId, {
          quantity: -100,
          movementType: 'sale',
          reason: 'Invalid large sale',
          performedBy: userId,
        })
      ).rejects.toThrow('Insufficient stock');
    });

    test('✅ Should get stock movement history', async () => {
      const movements = await InventoryService.getStockMovementHistory(inventoryItemId, tenantId);

      expect(movements.length).toBeGreaterThan(0);
      expect(movements[0].inventoryItemId).toBe(inventoryItemId);
      expect(movements[0].performedBy).toBe(userId);
    });

    test('✅ Should limit movement history results', async () => {
      const movements = await InventoryService.getStockMovementHistory(
        inventoryItemId,
        tenantId,
        2
      );

      expect(movements.length).toBeLessThanOrEqual(2);
    });
  });

  // ========================================
  // PHASE 4: LOW STOCK ALERTS
  // ========================================

  describe('Phase 4: Low Stock Alerts', () => {
    test('✅ Should identify low stock items', async () => {
      // Create an item specifically that IS below min stock
      const lowStockItem = await InventoryService.createInventoryItem(tenantId, {
        name: 'Low Stock Item Test',
        category: 'vegetables',
        unit: 'kg',
        currentStock: 2,
        minStock: 5,
        unitCost: 3.0,
        supplierId,
      });

      const lowStockItems = await InventoryService.getLowStockItems(tenantId);

      expect(lowStockItems.length).toBeGreaterThan(0);
      expect(lowStockItems.some((item) => item.id === lowStockItem.id)).toBe(true);
    });

    test('✅ Should filter low stock items correctly', async () => {
      // Current stock is 60, minStock is 15, so NOT low stock
      const lowStock = await InventoryService.getLowStockItems(tenantId);
      const salmon = lowStock.find((i) => i.id === inventoryItemId);
      expect(salmon).toBeUndefined();

      // Make it low stock
      await InventoryService.adjustStock(inventoryItemId, tenantId, {
        quantity: -50,
        movementType: 'sale',
        reason: 'Testing low stock alert',
        performedBy: userId,
      });

      const lowStockNow = await InventoryService.getLowStockItems(tenantId);
      const salmonNow = lowStockNow.find((i) => i.id === inventoryItemId);
      expect(salmonNow).toBeDefined();
    });
  });

  // ========================================
  // PHASE 5: WINE CELLAR MANAGEMENT
  // ========================================

  describe('Phase 5: Wine Cellar Management', () => {
    test('✅ Should add wine to inventory', async () => {
      const wine = await InventoryService.addWine(tenantId, {
        name: 'Château Margaux 2015',
        currentStock: 5,
        minStock: 1,
        unitCost: 250.0,
        supplierId,
        vintage: '2015',
        region: 'Bordeaux, France',
        varietal: 'Cabernet Sauvignon',
        binLocation: 'Bin-A12',
        tastingNotes: 'Complex with dark cherry notes',
        pairingNotes: 'Pairs well with beef, lamb, and aged cheese',
      });

      expect(wine.item.name).toBe('Château Margaux 2015');
      expect(wine.item.category).toBe('wine');
      expect(wine.wineDetail.vintage).toBe('2015');
      expect(wine.wineDetail.region).toBe('Bordeaux, France');
      expect(wine.wineDetail.binLocation).toBe('Bin-A12');

      wineItemId = wine.item.id;
    });

    test('✅ Should get all wines', async () => {
      const wines = await InventoryService.getWines(tenantId);

      expect(wines.length).toBeGreaterThan(0);
      expect(wines.some((w) => w.id === wineItemId)).toBe(true);
    });

    test('✅ Should update wine details', async () => {
      const updated = await InventoryService.updateWine(wineItemId, tenantId, {
        tastingNotes: 'Updated: Very complex with subtle oak',
        pairingNotes: 'Updated: Perfect with beef dishes and fine dining',
        binLocation: 'Bin-A13',
      });

      expect(updated.wineDetail.tastingNotes).toContain('Updated');
      expect(updated.wineDetail.binLocation).toBe('Bin-A13');
    });

    test('✅ Should get wine pairing suggestions', async () => {
      const pairings = await InventoryService.getWinePairings(tenantId);

      expect(pairings.length).toBeGreaterThan(0);
      expect(pairings[0].wine).toBeDefined();
      expect(pairings[0].available).toBeDefined();
    });

    test('✅ Should get wine pairings by category', async () => {
      // The wine we created has pairingNotes that includes "beef"
      const pairings = await InventoryService.getWinePairings(tenantId, 'beef');

      // We should get at least the wine we created earlier with beef pairing
      expect(pairings.length).toBeGreaterThan(0);
      expect(pairings.some((p) => p.pairingNotes?.toLowerCase().includes('beef'))).toBe(true);
    });
  });

  // ========================================
  // PHASE 6: CATEGORIES & VALUATION
  // ========================================

  describe('Phase 6: Categories & Inventory Valuation', () => {
    test('✅ Should get all categories', async () => {
      const categories = await InventoryService.getCategories(tenantId);

      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('seafood');
      expect(categories).toContain('wine');
    });

    test('✅ Should calculate inventory valuation', async () => {
      const valuation = await InventoryService.calculateInventoryValuation(tenantId);

      expect(valuation.totalValue).toBeDefined();
      expect(valuation.itemCount).toBeGreaterThan(0);
      expect(valuation.valueByCategory).toBeDefined();
      expect(Object.keys(valuation.valueByCategory).length).toBeGreaterThan(0);
    });

    test('✅ Should include all categories in valuation', async () => {
      const valuation = await InventoryService.calculateInventoryValuation(tenantId);

      expect(valuation.valueByCategory['seafood']).toBeDefined();
      expect(valuation.valueByCategory['wine']).toBeDefined();
    });
  });

  // ========================================
  // PHASE 7: RECIPE/MENU ITEM TO INVENTORY MAPPING
  // ========================================

  describe('Phase 7: Recipe & Menu Item to Inventory Mapping', () => {
    test('✅ Should map menu item to inventory items', async () => {
      const mappings = await InventoryService.mapMenuItemToInventory(tenantId, menuItemId, [
        {
          inventoryItemId: inventoryItemId,
          quantityNeeded: 8,
          unit: 'oz',
        },
      ]);

      expect(mappings.length).toBe(1);
      expect(mappings[0].menuItemId).toBe(menuItemId);
      expect(mappings[0].quantityNeeded).toEqual(new Decimal('8'));
    });

    test('✅ Should get recipe for menu item', async () => {
      const recipe = await InventoryService.getMenuItemRecipe(tenantId, menuItemId);

      expect(recipe.length).toBeGreaterThan(0);
      expect(recipe[0].menuItemId).toBe(menuItemId);
      expect(recipe[0].inventoryItem).toBeDefined();
    });

    test('✅ Should check menu item availability', async () => {
      const availability = await InventoryService.checkMenuItemAvailability(tenantId, menuItemId);

      expect(availability.available).toBeDefined();
      expect(availability.missingIngredients).toBeDefined();
    });

    test('✅ Should detect insufficient ingredients', async () => {
      // Current salmon stock is 10 (after adjustments), recipe needs 8, so available
      let availability = await InventoryService.checkMenuItemAvailability(tenantId, menuItemId);
      expect(availability.available).toBe(true);

      // Reduce stock below recipe requirement
      await InventoryService.adjustStock(inventoryItemId, tenantId, {
        quantity: -5,
        movementType: 'sale',
        reason: 'Testing insufficient inventory',
        performedBy: userId,
      });

      // Now should be insufficient (5 < 8)
      availability = await InventoryService.checkMenuItemAvailability(tenantId, menuItemId);
      expect(availability.available).toBe(false);
      expect(availability.missingIngredients.length).toBeGreaterThan(0);
    });
  });

  // ========================================
  // PHASE 8: STOCK AVAILABILITY CHECKS
  // ========================================

  describe('Phase 8: Stock Availability & Deduction', () => {
    test('✅ Should check stock availability', async () => {
      // Current stock is 5 (after all adjustments)
      const availability = await InventoryService.checkStockAvailability(
        tenantId,
        inventoryItemId,
        3
      );

      expect(availability.available).toBe(true);
      expect(availability.currentStock).toEqual(new Decimal('5'));
      expect(availability.deficit).toEqual(new Decimal('0'));
    });

    test('✅ Should detect insufficient stock availability', async () => {
      const availability = await InventoryService.checkStockAvailability(
        tenantId,
        inventoryItemId,
        10
      );

      expect(availability.available).toBe(false);
      expect(availability.deficit).toEqual(new Decimal('5'));
    });

    test('✅ Should deduct inventory for order', async () => {
      const beforeStock = (await InventoryService.getInventoryItemById(inventoryItemId, tenantId))
        .currentStock;

      const movements = await InventoryService.deductInventoryForOrder(
        tenantId,
        [
          {
            inventoryItemId: inventoryItemId,
            quantity: 2,
            orderItemId: 'order-item-123',
          },
        ],
        'order-456',
        userId
      );

      expect(movements.length).toBe(1);
      expect(movements[0].type).toBe('sale');
      expect(movements[0].quantity).toEqual(new Decimal('2'));

      const afterStock = (await InventoryService.getInventoryItemById(inventoryItemId, tenantId))
        .currentStock;

      expect(afterStock).toEqual(beforeStock.minus(2));
    });

    test('❌ Should prevent deduction with insufficient stock', async () => {
      await expect(
        InventoryService.deductInventoryForOrder(
          tenantId,
          [
            {
              inventoryItemId: inventoryItemId,
              quantity: 100,
              orderItemId: 'order-item-999',
            },
          ],
          'order-999',
          userId
        )
      ).rejects.toThrow('Insufficient stock');
    });
  });

  // ========================================
  // PHASE 9: ERROR HANDLING & EDGE CASES
  // ========================================

  describe('Phase 9: Error Handling & Edge Cases', () => {
    test('❌ Should handle non-existent item', async () => {
      await expect(
        InventoryService.getInventoryItemById('non-existent-id', tenantId)
      ).rejects.toThrow('Inventory item not found');
    });

    test('❌ Should handle invalid unit for adjustment', async () => {
      await expect(
        InventoryService.adjustStock(inventoryItemId, tenantId, {
          quantity: 0,
          movementType: 'purchase',
          reason: 'Invalid adjustment',
          performedBy: userId,
        })
      ).rejects.toThrow('cannot be zero');
    });

    test('❌ Should reject deletion of item with movements', async () => {
      await expect(InventoryService.deleteInventoryItem(inventoryItemId, tenantId)).rejects.toThrow(
        'Cannot delete inventory item with existing stock movements'
      );
    });

    test('✅ Should handle item with no recipe', async () => {
      // Create new item without recipe
      const newItem = await InventoryService.createInventoryItem(tenantId, {
        name: 'Olive Oil',
        category: 'oils',
        unit: 'liters',
        currentStock: 20,
        minStock: 5,
        unitCost: 8.5,
      });

      const availability = await InventoryService.checkMenuItemAvailability(
        tenantId,
        menuItemId // Different menu item without this oil in recipe
      );

      expect(availability.available).toBeDefined();

      // Cleanup
      await prisma.inventoryItem.delete({
        where: { id: newItem.id },
      });
    });
  });
});
