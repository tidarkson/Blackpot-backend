import { PrismaClient } from '@prisma/client';
import { MenuItemService } from '../src/services/MenuItemService';
import { MenuService } from '../src/services/MenuService';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

const prisma = new PrismaClient();
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIfIntegration = runIntegrationTests ? describe : describe.skip;

describeIfIntegration('Feature A7: Menu Items Management', () => {
  let menuItemService: MenuItemService;
  let menuService: MenuService;
  let tenantId: string;
  let menuId: string;
  let sectionId: string;
  let itemId: string;

  beforeAll(async () => {
    menuItemService = new MenuItemService();
    menuService = new MenuService();

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Restaurant - Menu Items',
        isActive: true,
      },
    });

    tenantId = tenant.id;

    // Create test menu
    const menu = await menuService.createMenu(tenantId, {
      name: 'Test Menu',
      isActive: true,
    });

    menuId = menu.id;

    // Create test section
    const section = await menuItemService.createSection(tenantId, {
      menuId,
      name: 'Appetizers',
      position: 1,
    });

    sectionId = section.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.menuItem.deleteMany({ where: { tenantId } });
    await prisma.menuSection.deleteMany({ where: { tenantId } });
    await prisma.menu.deleteMany({ where: { tenantId } });
    await prisma.activityLog.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear menu items before each test but keep menu and section
    await prisma.menuItem.deleteMany({
      where: { tenantId, sectionId },
    });
  });

  // ========================================
  // CREATE MENU ITEM TESTS
  // ========================================

  describe('MenuItemService.createMenuItem', () => {
    test('✓ should create item with name, description, price', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Caesar Salad',
        description: 'Fresh romaine lettuce with croutons and parmesan',
        price: 12.99,
        isAvailable: true,
      });

      expect(item.id).toBeDefined();
      expect(item.name).toBe('Caesar Salad');
      expect(item.description).toBe('Fresh romaine lettuce with croutons and parmesan');
      expect(item.price.toString()).toBe('12.99');
      expect(item.tenantId).toBe(tenantId);
      expect(item.isAvailable).toBe(true);

      itemId = item.id;
    });

    test('✓ should assign to section', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Bruschetta',
        description: 'Toasted bread with tomatoes and basil',
        price: 8.99,
      });

      expect(item.sectionId).toBe(sectionId);

      // Verify section relationship
      const fullItem = await menuItemService.getItemById(item.id, tenantId);
      expect(fullItem?.section).toBeDefined();
      expect(fullItem?.section?.id).toBe(sectionId);
    });

    test('✓ should set availability', async () => {
      const availableItem = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Available Appetizer',
        price: 10.00,
        isAvailable: true,
      });

      expect(availableItem.isAvailable).toBe(true);

      const unavailableItem = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Unavailable Appetizer',
        price: 10.00,
        isAvailable: false,
      });

      expect(unavailableItem.isAvailable).toBe(false);
    });

    test('✓ should handle modifiers (toppings, sides)', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Burger',
        price: 14.99,
      });

      const itemWithModifiers = await menuItemService.addModifiers(item.id, tenantId, [
        {
          name: 'Cheese',
          type: 'topping',
          options: ['Cheddar', 'Swiss', 'American'],
          isRequired: true,
          maxSelections: 1,
        },
        {
          name: 'Toppings',
          type: 'topping',
          options: ['Lettuce', 'Tomato', 'Onion', 'Pickles'],
          isRequired: false,
          maxSelections: 4,
        },
        {
          name: 'Sides',
          type: 'side',
          options: ['Fries', 'Coleslaw', 'Fruit'],
          isRequired: true,
          maxSelections: 1,
        },
      ]);

      expect(itemWithModifiers.modifiers).toBeDefined();
      expect(itemWithModifiers.modifiers.length).toBe(3);
      expect(itemWithModifiers.modifiers[0].name).toBe('Cheese');
      expect(itemWithModifiers.modifiers[0].type).toBe('topping');

      // Verify activity log was created
      const logs = await prisma.activityLog.findMany({
        where: {
          tenantId,
          action: 'MODIFIERS_ADDED',
          entityId: item.id,
        },
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].metadata).toHaveProperty('modifiersCount', 3);
    });

    test('✓ should validate section exists', async () => {
      const invalidSectionId = 'invalid-section-id';

      await expect(
        menuItemService.createItem(tenantId, {
          sectionId: invalidSectionId,
          name: 'Invalid Item',
          price: 10.00,
        })
      ).rejects.toThrow('Section not found');
    });

    test('✓ should default isAvailable to true', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Default Availability Item',
        price: 9.99,
      });

      expect(item.isAvailable).toBe(true);
    });

    test('✓ should allow null description', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'No Description Item',
        price: 7.99,
        description: null,
      });

      expect(item.description).toBeNull();
    });
  });

  // ========================================
  // UPDATE PRICE TESTS
  // ========================================

  describe('MenuItemService.updatePrice', () => {
    let priceItem: any;

    beforeEach(async () => {
      priceItem = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Price Test Item',
        price: 10.00,
      });
    });

    test('✓ should update item price', async () => {
      const updated = await menuItemService.updatePrice(priceItem.id, tenantId, 15.99);

      expect(updated.price.toString()).toBe('15.99');
    });

    test('✓ should log price change', async () => {
      const oldPrice = priceItem.price.toNumber();
      const newPrice = 20.00;

      await menuItemService.updatePrice(priceItem.id, tenantId, newPrice, 'Seasonal adjustment');

      const logs = await prisma.activityLog.findMany({
        where: {
          tenantId,
          action: 'PRICE_UPDATE',
          entityId: priceItem.id,
        },
      });

      expect(logs.length).toBeGreaterThan(0);
      const log = logs[logs.length - 1];
      const metadata = log.metadata as any;
      expect(metadata).toHaveProperty('oldPrice', oldPrice);
      expect(metadata).toHaveProperty('newPrice', newPrice);
      expect(metadata).toHaveProperty('reason', 'Seasonal adjustment');
    });

    test('✓ should validate price > 0', async () => {
      await expect(
        menuItemService.updatePrice(priceItem.id, tenantId, 0)
      ).rejects.toThrow('Price must be greater than 0');

      await expect(
        menuItemService.updatePrice(priceItem.id, tenantId, -5)
      ).rejects.toThrow('Price must be greater than 0');
    });

    test('✓ should verify item exists', async () => {
      const invalidId = 'invalid-item-id';

      await expect(
        menuItemService.updatePrice(invalidId, tenantId, 10.99)
      ).rejects.toThrow('Menu item not found');
    });

    test('✓ should support decimal prices', async () => {
      const updated = await menuItemService.updatePrice(priceItem.id, tenantId, 12.49);

      expect(updated.price.toString()).toBe('12.49');
    });

    test('✓ should record reason in log', async () => {
      await menuItemService.updatePrice(priceItem.id, tenantId, 18.00, 'Market increase');

      const logs = await prisma.activityLog.findMany({
        where: {
          tenantId,
          action: 'PRICE_UPDATE',
          entityId: priceItem.id,
        },
      });

      const latestLog = logs[logs.length - 1];
      const metadata = latestLog.metadata as any;
      expect(metadata?.reason).toBe('Market increase');
    });
  });

  // ========================================
  // SET AVAILABILITY TESTS
  // ========================================

  describe('MenuItemService.setAvailability', () => {
    let availItem: any;

    beforeEach(async () => {
      availItem = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Availability Test Item',
        price: 10.00,
        isAvailable: true,
      });
    });

    test('✓ should mark item as available', async () => {
      const updated = await menuItemService.setAvailability(availItem.id, tenantId, true);

      expect(updated.isAvailable).toBe(true);
    });

    test('✓ should mark item as unavailable', async () => {
      const updated = await menuItemService.setAvailability(availItem.id, tenantId, false);

      expect(updated.isAvailable).toBe(false);
    });

    test('✓ should support time-based availability', async () => {
      const updated = await menuItemService.setAvailability(
        availItem.id,
        tenantId,
        true,
        {
          startTime: '11:00',
          endTime: '14:00',
          daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
        }
      );

      expect(updated.isAvailable).toBe(true);

      // Verify time-based schedule was logged
      const logs = await prisma.activityLog.findMany({
        where: {
          tenantId,
          action: 'ITEM_MARKED_AVAILABLE',
          entityId: availItem.id,
        },
      });

      expect(logs.length).toBeGreaterThan(0);
      const latestLog = logs[logs.length - 1];
      const metadata = latestLog.metadata as any;
      expect(metadata?.timeBasedSchedule).toBeDefined();
      expect(metadata?.timeBasedSchedule?.startTime).toBe('11:00');
      expect(metadata?.timeBasedSchedule?.endTime).toBe('14:00');
    });

    test('✓ should log availability change', async () => {
      await menuItemService.setAvailability(availItem.id, tenantId, false);

      const logs = await prisma.activityLog.findMany({
        where: {
          tenantId,
          action: 'ITEM_MARKED_UNAVAILABLE',
          entityId: availItem.id,
        },
      });

      expect(logs.length).toBeGreaterThan(0);
      const metadata = logs[0].metadata as any;
      expect(metadata?.isAvailable).toBe(false);
    });

    test('✓ should verify item exists', async () => {
      const invalidId = 'invalid-item-id';

      await expect(
        menuItemService.setAvailability(invalidId, tenantId, true)
      ).rejects.toThrow('Menu item not found');
    });

    test('✓ should toggle availability multiple times', async () => {
      // Mark unavailable
      let updated = await menuItemService.setAvailability(availItem.id, tenantId, false);
      expect(updated.isAvailable).toBe(false);

      // Mark available again
      updated = await menuItemService.setAvailability(availItem.id, tenantId, true);
      expect(updated.isAvailable).toBe(true);

      // Mark unavailable again
      updated = await menuItemService.setAvailability(availItem.id, tenantId, false);
      expect(updated.isAvailable).toBe(false);
    });
  });

  // ========================================
  // GET MENU ITEMS TESTS
  // ========================================

  describe('MenuItemService.getMenuItems', () => {
    let item1: any;
    let item2: any;
    let item3: any;

    beforeEach(async () => {
      item1 = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Available Item 1',
        price: 10.00,
        isAvailable: true,
      });

      item2 = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Available Item 2',
        price: 12.00,
        isAvailable: true,
      });

      item3 = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Unavailable Item',
        price: 15.00,
        isAvailable: false,
      });
    });

    test('✓ should return items for menu', async () => {
      const menu = await menuItemService.getMenuItems(menuId, tenantId);

      expect(menu.id).toBe(menuId);
      expect(menu.sections).toBeDefined();
      expect(Array.isArray(menu.sections)).toBe(true);

      const itemSection = menu.sections.find((s: any) => s.id === sectionId);
      expect(itemSection?.items).toBeDefined();
    });

    test('✓ should filter by section', async () => {
      const menu = await menuItemService.getMenuItems(menuId, tenantId);

      const appetizersSection = menu.sections.find((s: any) => s.id === sectionId);
      expect(appetizersSection).toBeDefined();
      expect(appetizersSection?.items?.length).toBeGreaterThan(0);
    });

    test('✓ should exclude unavailable items by default', async () => {
      const menu = await menuItemService.getMenuItems(menuId, tenantId);

      const itemSection = menu.sections.find((s: any) => s.id === sectionId);
      const itemNames = itemSection?.items?.map((i: any) => i.name) || [];

      expect(itemNames).toContain('Available Item 1');
      expect(itemNames).toContain('Available Item 2');
      expect(itemNames).not.toContain('Unavailable Item');
    });

    test('✓ should include unavailable items when requested', async () => {
      const menu = await menuItemService.getMenuItems(menuId, tenantId, {
        includeUnavailable: true,
      });

      const itemSection = menu.sections.find((s: any) => s.id === sectionId);
      const itemNames = itemSection?.items?.map((i: any) => i.name) || [];

      expect(itemNames).toContain('Available Item 1');
      expect(itemNames).toContain('Available Item 2');
      expect(itemNames).toContain('Unavailable Item');
    });

    test('✓ should include modifiers', async () => {
      // Add modifiers to an item
      await menuItemService.addModifiers(item1.id, tenantId, [
        {
          name: 'Toppings',
          type: 'topping',
          options: ['Extra cheese', 'Bacon'],
        },
      ]);

      const menu = await menuItemService.getMenuItems(menuId, tenantId, {
        withModifiers: true,
      });

      const itemSection = menu.sections.find((s: any) => s.id === sectionId);
      expect(itemSection?.items).toBeDefined();

      // Should have modifiers property
      const item = itemSection?.items?.find((i: any) => i.id === item1.id);
      expect(item?.modifiers).toBeDefined();
    });

    test('✓ should verify menu exists', async () => {
      const invalidMenuId = 'invalid-menu-id';

      await expect(
        menuItemService.getMenuItems(invalidMenuId, tenantId)
      ).rejects.toThrow('Menu not found');
    });

    test('✓ should return menu with all sections in order', async () => {
      // Create another section
      const section2 = await menuItemService.createSection(tenantId, {
        menuId,
        name: 'Main Courses',
        position: 2,
      });

      const menu = await menuItemService.getMenuItems(menuId, tenantId);

      expect(menu.sections.length).toBeGreaterThanOrEqual(2);

      // Verify sections are in order
      const positions = menu.sections.map((s: any) => s.position);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
      }
    });
  });

  // ========================================
  // DELETE MENU ITEM TESTS
  // ========================================

  describe('MenuItemService.deleteMenuItem', () => {
    let deleteItem: any;

    beforeEach(async () => {
      deleteItem = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Delete Test Item',
        price: 10.00,
        isAvailable: true,
      });
    });

    test('✓ should soft delete item', async () => {
      await menuItemService.deleteItem(deleteItem.id, tenantId);

      const item = await menuItemService.getItemById(deleteItem.id, tenantId);
      expect(item?.isAvailable).toBe(false);
    });

    test('✓ should keep in archived menu', async () => {
      const beforeDelete = await menuItemService.getItemById(deleteItem.id, tenantId);
      expect(beforeDelete).toBeDefined();

      await menuItemService.deleteItem(deleteItem.id, tenantId);

      const afterDelete = await menuItemService.getItemById(deleteItem.id, tenantId);
      expect(afterDelete).toBeDefined();
      expect(afterDelete?.id).toBe(deleteItem.id);
    });

    test('✓ should prevent active menu deletion by marking unavailable', async () => {
      // Create an item in an active menu
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Active Menu Item',
        price: 10.00,
        isAvailable: true,
      });

      // Soft delete it
      await menuItemService.deleteItem(item.id, tenantId);

      // Item should still exist but be unavailable
      const deletedItem = await menuItemService.getItemById(item.id, tenantId);
      expect(deletedItem).toBeDefined();
      expect(deletedItem?.isAvailable).toBe(false);
    });

    test('✓ should handle deleting non-existent item', async () => {
      const invalidId = 'invalid-item-id';

      await expect(
        menuItemService.deleteItem(invalidId, tenantId)
      ).rejects.toThrow('Menu item not found');
    });

    test('✓ should exclude deleted items from getMenuItems by default', async () => {
      const item1 = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Item to Delete',
        price: 10.00,
      });

      const item2 = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Item to Keep',
        price: 12.00,
      });

      // Delete item1
      await menuItemService.deleteItem(item1.id, tenantId);

      // Get menu items
      const menu = await menuItemService.getMenuItems(menuId, tenantId);
      const itemSection = menu.sections.find((s: any) => s.id === sectionId);
      const itemNames = itemSection?.items?.map((i: any) => i.name) || [];

      expect(itemNames).not.toContain('Item to Delete');
      expect(itemNames).toContain('Item to Keep');
    });

    test('✓ should show deleted items with includeUnavailable flag', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Deleted Item Show',
        price: 10.00,
      });

      await menuItemService.deleteItem(item.id, tenantId);

      const menu = await menuItemService.getMenuItems(menuId, tenantId, {
        includeUnavailable: true,
      });

      const itemSection = menu.sections.find((s: any) => s.id === sectionId);
      const deletedItem = itemSection?.items?.find((i: any) => i.id === item.id);

      expect(deletedItem).toBeDefined();
      expect(deletedItem?.isAvailable).toBe(false);
    });
  });

  // ========================================
  // INTEGRATION TESTS
  // ========================================

  describe('MenuItemService - Integration', () => {
    test('✅ should handle complete menu item lifecycle', async () => {
      // 1. Create item
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Lifecycle Item',
        description: 'Test lifecycle',
        price: 10.00,
        isAvailable: true,
      });

      expect(item.id).toBeDefined();

      // 2. Add modifiers
      const itemWithMods = await menuItemService.addModifiers(item.id, tenantId, [
        {
          name: 'Toppings',
          type: 'topping',
          options: ['Cheese', 'Bacon'],
        },
      ]);

      expect(itemWithMods.modifiers?.length).toBe(1);

      // 3. Update price
      const updatedPrice = await menuItemService.updatePrice(item.id, tenantId, 15.99);
      expect(updatedPrice.price.toString()).toBe('15.99');

      // 4. Set unavailable
      const unavailable = await menuItemService.setAvailability(item.id, tenantId, false);
      expect(unavailable.isAvailable).toBe(false);

      // 5. Set available again
      const available = await menuItemService.setAvailability(item.id, tenantId, true);
      expect(available.isAvailable).toBe(true);

      // 6. Delete item
      await menuItemService.deleteItem(item.id, tenantId);

      // 7. Verify deletion
      const deleted = await menuItemService.getItemById(item.id, tenantId);
      expect(deleted?.isAvailable).toBe(false);
    });

    test('✅ should maintain data consistency across operations', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Consistency Item',
        price: 10.00,
      });

      const originalId = item.id;

      // Update price multiple times
      await menuItemService.updatePrice(item.id, tenantId, 12.00);
      await menuItemService.updatePrice(item.id, tenantId, 14.00);
      await menuItemService.updatePrice(item.id, tenantId, 16.00);

      // Verify final state
      const finalItem = await menuItemService.getItemById(originalId, tenantId);
      expect(Number(finalItem?.price)).toBe(16);
      expect(finalItem?.sectionId).toBe(sectionId);
    });

    test('✅ should generate complete activity log', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Activity Log Item',
        price: 10.00,
      });

      // Perform multiple operations
      await menuItemService.updatePrice(item.id, tenantId, 12.00);
      await menuItemService.setAvailability(item.id, tenantId, false);
      await menuItemService.addModifiers(item.id, tenantId, [
        {
          name: 'Toppings',
          type: 'topping',
        },
      ]);

      // Check activity logs
      const logs = await prisma.activityLog.findMany({
        where: {
          tenantId,
          entityId: item.id,
        },
      });

      expect(logs.length).toBeGreaterThanOrEqual(3);

      const actions = logs.map((l) => l.action);
      expect(actions).toContain('PRICE_UPDATE');
      expect(actions).toContain('ITEM_MARKED_UNAVAILABLE');
      expect(actions).toContain('MODIFIERS_ADDED');
    });

    test('✅ should filter menu items correctly across operations', async () => {
      // Create multiple items
      const item1 = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Filter Item 1',
        price: 10.00,
        isAvailable: true,
      });

      const item2 = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Filter Item 2',
        price: 20.00,
        isAvailable: true,
      });

      const item3 = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Filter Item 3',
        price: 30.00,
        isAvailable: false,
      });

      // Get available items
      const menu = await menuItemService.getMenuItems(menuId, tenantId);
      const itemSection = menu.sections.find((s: any) => s.id === sectionId);
      const itemNames = itemSection?.items?.map((i: any) => i.name) || [];

      expect(itemNames).toContain('Filter Item 1');
      expect(itemNames).toContain('Filter Item 2');
      expect(itemNames).not.toContain('Filter Item 3');

      // Delete an item
      await menuItemService.deleteItem(item1.id, tenantId);

      // Get available items again
      const menuAfterDelete = await menuItemService.getMenuItems(menuId, tenantId);
      const itemSectionAfter = menuAfterDelete.sections.find((s: any) => s.id === sectionId);
      const itemNamesAfter = itemSectionAfter?.items?.map((i: any) => i.name) || [];

      expect(itemNamesAfter).not.toContain('Filter Item 1');
      expect(itemNamesAfter).toContain('Filter Item 2');
    });
  });

  // ========================================
  // ERROR HANDLING TESTS
  // ========================================

  describe('MenuItemService - Error Handling', () => {
    test('✅ should handle invalid tenant ID', async () => {
      const invalidTenantId = 'invalid-tenant-id';

      await expect(
        menuItemService.createItem(invalidTenantId, {
          sectionId,
          name: 'Invalid Tenant Item',
          price: 10.00,
        })
      ).rejects.toThrow();
    });

    test('✅ should handle invalid section ID in create', async () => {
      await expect(
        menuItemService.createItem(tenantId, {
          sectionId: 'invalid-section-id',
          name: 'Invalid Section Item',
          price: 10.00,
        })
      ).rejects.toThrow('Section not found');
    });

    test('✅ should handle invalid item ID in update', async () => {
      await expect(
        menuItemService.updateItem('invalid-item-id', tenantId, {
          name: 'Updated Name',
        })
      ).rejects.toThrow('Menu item not found');
    });

    test('✅ should handle negative price', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Error Test Item',
        price: 10.00,
      });

      await expect(
        menuItemService.updatePrice(item.id, tenantId, -5)
      ).rejects.toThrow('Price must be greater than 0');
    });

    test('✅ should handle zero price', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Zero Price Test',
        price: 10.00,
      });

      await expect(
        menuItemService.updatePrice(item.id, tenantId, 0)
      ).rejects.toThrow('Price must be greater than 0');
    });
  });

  // ========================================
  // PERFORMANCE TESTS
  // ========================================

  describe('MenuItemService - Performance', () => {
    test('✅ should handle bulk item creation efficiently', async () => {
      const startTime = performance.now();

      // Create 20 items
      const items = [];
      for (let i = 0; i < 20; i++) {
        const item = await menuItemService.createItem(tenantId, {
          sectionId,
          name: `Bulk Item ${i}`,
          price: 10.00 + i,
        });
        items.push(item);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(items.length).toBe(20);
      // Should complete in reasonable time (less than 5 seconds for 20 items)
      expect(duration).toBeLessThan(5000);
    });

    test('✅ should retrieve menu items efficiently', async () => {
      const startTime = performance.now();

      const menu = await menuItemService.getMenuItems(menuId, tenantId);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(menu.sections).toBeDefined();
      // Should retrieve in less than 500ms
      expect(duration).toBeLessThan(500);
    });

    test('✅ should handle price updates efficiently', async () => {
      const item = await menuItemService.createItem(tenantId, {
        sectionId,
        name: 'Price Performance Item',
        price: 10.00,
      });

      const startTime = performance.now();

      // Update price 10 times
      for (let i = 0; i < 10; i++) {
        await menuItemService.updatePrice(item.id, tenantId, 10.00 + i);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in less than 2 seconds
      expect(duration).toBeLessThan(2000);
    });
  });
});
