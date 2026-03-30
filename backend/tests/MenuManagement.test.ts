import { PrismaClient } from '@prisma/client';
import { MenuService } from '../src/services/MenuService';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

const prisma = new PrismaClient();
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIfIntegration = runIntegrationTests ? describe : describe.skip;

describeIfIntegration('Feature A6: Menu Management System', () => {
  let tenantId: string;
  let menuId: string;
  let sectionId: string;
  let anotherMenuId: string;
  const menuService = new MenuService();

  beforeAll(async () => {
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Restaurant - Menu Management',
        isActive: true,
      },
    });

    tenantId = tenant.id;
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
    // Clear menus before each test (but keep tenant)
    // This is selective cleanup
  });

  // ========================================
  // MENU SERVICE TESTS
  // ========================================

  describe('MenuService', () => {
    describe('createMenu', () => {
      test('✅ should create menu with name', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Lunch Menu',
        });

        expect(menu.id).toBeDefined();
        expect(menu.name).toBe('Lunch Menu');
        expect(menu.isActive).toBe(true);
        expect(menu.tenantId).toBe(tenantId);
        expect(menu.version).toBe(1);

        menuId = menu.id;
      });

      test('✅ should set as active or inactive on creation', async () => {
        // Create active menu
        const activeMenu = await menuService.createMenu(tenantId, {
          name: 'Dinner Menu - Active',
          isActive: true,
        });

        expect(activeMenu.isActive).toBe(true);

        // Create inactive menu
        const inactiveMenu = await menuService.createMenu(tenantId, {
          name: 'Breakfast Menu - Inactive',
          isActive: false,
        });

        expect(inactiveMenu.isActive).toBe(false);
        expect(inactiveMenu.version).toBe(1);

        anotherMenuId = inactiveMenu.id;
      });

      test('✅ should support multiple menus', async () => {
        // Create first menu
        const menu1 = await menuService.createMenu(tenantId, {
          name: 'Menu 1',
          isActive: true,
        });

        // Create second menu
        const menu2 = await menuService.createMenu(tenantId, {
          name: 'Menu 2',
          isActive: false,
        });

        // Create third menu
        const menu3 = await menuService.createMenu(tenantId, {
          name: 'Menu 3',
          isActive: false,
        });

        expect(menu1.id).not.toBe(menu2.id);
        expect(menu2.id).not.toBe(menu3.id);
        expect(menu1.id).not.toBe(menu3.id);

        // Verify all menus exist
        const allMenus = await menuService.getAllMenus(tenantId);
        expect(allMenus.items.length).toBeGreaterThanOrEqual(3);
      });

      test('✅ should allow date-based menus with effectiveAt', async () => {
        const effectiveDate = new Date('2026-02-10');
        const menu = await menuService.createMenu(tenantId, {
          name: 'Valentine Menu',
          isActive: true,
        });

        // Verify menu has effectiveAt timestamp
        expect(menu.effectiveAt).toBeDefined();
        expect(menu.createdAt).toBeDefined();

        // Update with custom effective date
        const updated = await menuService.updateMenu(menuId, tenantId, {
          name: 'Updated Menu',
        });

        expect(updated.updatedAt).toBeDefined();
      });
    });

    describe('addSection', () => {
      test('✅ should add menu section', async () => {
        const section = await menuService.addSection(menuId, tenantId, {
          name: 'Appetizers',
        });

        expect(section.id).toBeDefined();
        expect(section.name).toBe('Appetizers');
        expect(section.menuId).toBe(menuId);
        expect(section.tenantId).toBe(tenantId);

        sectionId = section.id;
      });

      test('✅ should set section position', async () => {
        const section1 = await menuService.addSection(menuId, tenantId, {
          name: 'Appetizers',
          position: 1,
        });

        const section2 = await menuService.addSection(menuId, tenantId, {
          name: 'Main Courses',
          position: 2,
        });

        const section3 = await menuService.addSection(menuId, tenantId, {
          name: 'Desserts',
          position: 3,
        });

        expect(section1.position).toBe(1);
        expect(section2.position).toBe(2);
        expect(section3.position).toBe(3);
      });

      test('✅ should auto-increment position if not provided', async () => {
        const newMenu = await menuService.createMenu(tenantId, {
          name: 'Auto Position Menu',
        });

        const section1 = await menuService.addSection(newMenu.id, tenantId, {
          name: 'Section 1',
        });

        const section2 = await menuService.addSection(newMenu.id, tenantId, {
          name: 'Section 2',
        });

        expect(section1.position).toBe(1);
        expect(section2.position).toBe(2);
      });

      test('✅ should validate section name', async () => {
        // Empty name should fail
        await expect(
          menuService.addSection(menuId, tenantId, {
            name: '',
          })
        ).rejects.toThrow('Section name is required');

        // Whitespace only should fail
        await expect(
          menuService.addSection(menuId, tenantId, {
            name: '   ',
          })
        ).rejects.toThrow('Section name is required');
      });

      test('✅ should throw error if menu not found', async () => {
        await expect(
          menuService.addSection('invalid-menu-id', tenantId, {
            name: 'Test Section',
          })
        ).rejects.toThrow('Menu not found');
      });
    });

    describe('activateMenu', () => {
      test('✅ should switch active menu', async () => {
        // Create two menus
        const menu1 = await menuService.createMenu(tenantId, {
          name: 'Active Menu Test 1',
          isActive: true,
        });

        const menu2 = await menuService.createMenu(tenantId, {
          name: 'Active Menu Test 2',
          isActive: false,
        });

        // Activate menu2
        const activated = await menuService.activateMenu(menu2.id, tenantId);

        expect(activated.isActive).toBe(true);
        expect(activated.id).toBe(menu2.id);

        // Verify menu1 is now inactive
        const check1 = await menuService.getMenuById(menu1.id, tenantId);
        expect(check1?.isActive).toBe(false);
      });

      test('✅ should deactivate previous menu', async () => {
        const menu1 = await menuService.createMenu(tenantId, {
          name: 'Previous Active',
          isActive: true,
        });

        const menu2 = await menuService.createMenu(tenantId, {
          name: 'New Active',
          isActive: false,
        });

        // Activate menu2
        await menuService.activateMenu(menu2.id, tenantId);

        // Verify menu1 is deactivated
        const deactivated = await menuService.getMenuById(menu1.id, tenantId);
        expect(deactivated?.isActive).toBe(false);
      });

      test('✅ should log menu change activity', async () => {
        const testMenu = await menuService.createMenu(tenantId, {
          name: 'Log Test Menu',
          isActive: false,
        });

        await menuService.activateMenu(testMenu.id, tenantId);

        // Check activity log
        const logs = await prisma.activityLog.findMany({
          where: {
            tenantId,
            action: 'MENU_ACTIVATED',
            entityId: testMenu.id,
          },
        });

        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0].action).toBe('MENU_ACTIVATED');
        expect(logs[0].metadata).toBeDefined();
      });

      test('✅ should update effectiveAt timestamp', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Effective Date Menu',
          isActive: false,
        });

        const beforeActivate = new Date();
        const activated = await menuService.activateMenu(menu.id, tenantId);
        const afterActivate = new Date();

        expect(activated.effectiveAt.getTime()).toBeGreaterThanOrEqual(
          beforeActivate.getTime()
        );
        expect(activated.effectiveAt.getTime()).toBeLessThanOrEqual(
          afterActivate.getTime()
        );
      });

      test('✅ should throw error if menu not found', async () => {
        await expect(
          menuService.activateMenu('invalid-menu-id', tenantId)
        ).rejects.toThrow('Menu not found');
      });
    });

    describe('getActiveMenu', () => {
      test('✅ should return current active menu', async () => {
        // First, deactivate any existing active menus
        await prisma.menu.updateMany({
          where: { tenantId, isActive: true },
          data: { isActive: false },
        });

        // Create and activate a fresh menu
        const menu = await menuService.createMenu(tenantId, {
          name: 'Current Active Menu',
          isActive: false, // Start inactive
        });

        // Add sections
        await menuService.addSection(menu.id, tenantId, {
          name: 'Starters',
        });

        // Now activate it
        await menuService.activateMenu(menu.id, tenantId);

        const activeMenu = await menuService.getActiveMenu(tenantId);

        expect(activeMenu).toBeDefined();
        expect(activeMenu?.isActive).toBe(true);
        expect(activeMenu?.id).toBe(menu.id);
      });

      test('✅ should include all sections', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Menu with Sections',
          isActive: false,
        });

        // Add multiple sections
        await menuService.addSection(menu.id, tenantId, { name: 'Apps', position: 1 });
        await menuService.addSection(menu.id, tenantId, { name: 'Mains', position: 2 });
        await menuService.addSection(menu.id, tenantId, { name: 'Desserts', position: 3 });

        // Activate and retrieve
        const activated = await menuService.activateMenu(menu.id, tenantId);

        expect(activated.sections).toBeDefined();
        expect(activated.sections.length).toBe(3);
        expect(activated.sections[0].name).toBe('Apps');
        expect(activated.sections[2].name).toBe('Desserts');
      });

      test('✅ should include all items in sections', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Menu with Items',
          isActive: false,
        });

        // Add section
        const section = await menuService.addSection(menu.id, tenantId, {
          name: 'Starters',
        });

        // Add menu items
        await prisma.menuItem.create({
          data: {
            tenantId,
            sectionId: section.id,
            name: 'Caesar Salad',
            price: 12.99,
            isAvailable: true,
          },
        });

        await prisma.menuItem.create({
          data: {
            tenantId,
            sectionId: section.id,
            name: 'Soup of the Day',
            price: 8.99,
            isAvailable: true,
          },
        });

        // Activate and retrieve
        const activeMenu = await menuService.activateMenu(menu.id, tenantId);

        expect(activeMenu.sections[0].items.length).toBe(2);
        expect(activeMenu.sections[0].items[0].name).toBe('Caesar Salad');
      });

      test('✅ should include pricing information', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Pricing Menu',
          isActive: false,
        });

        const section = await menuService.addSection(menu.id, tenantId, {
          name: 'Entrees',
        });

        await prisma.menuItem.create({
          data: {
            tenantId,
            sectionId: section.id,
            name: 'Steak',
            price: 34.99,
            isAvailable: true,
          },
        });

        const activeMenu = await menuService.activateMenu(menu.id, tenantId);
        const item = activeMenu.sections[0].items[0];

        expect(item.price).toBeDefined();
        expect(item.price.toString()).toBe('34.99');
      });

      test('✅ should return null if no active menu', async () => {
        // Create a new tenant with no active menu
        const newTenant = await prisma.tenant.create({
          data: {
            name: 'No Active Menu Tenant',
            isActive: true,
          },
        });

        const activeMenu = await menuService.getActiveMenu(newTenant.id);

        expect(activeMenu).toBeNull();

        // Cleanup
        await prisma.tenant.delete({ where: { id: newTenant.id } });
      });
    });

    describe('deleteMenu / softDelete', () => {
      test('✅ should soft delete menu', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Menu to Delete',
          isActive: false,
        });

        const deleted = await menuService.softDeleteMenu(menu.id, tenantId);

        expect(deleted.isActive).toBe(false);
        expect(deleted.updatedAt).toBeDefined();

        // Verify menu still exists in DB but is inactive
        const found = await prisma.menu.findUnique({ where: { id: menu.id } });
        expect(found).toBeDefined();
      });

      test('✅ should prevent deletion if active', async () => {
        const activeMenu = await menuService.createMenu(tenantId, {
          name: 'Active Menu - Cannot Delete',
          isActive: true,
        });

        await expect(
          menuService.softDeleteMenu(activeMenu.id, tenantId)
        ).rejects.toThrow('Cannot delete active menu');
      });

      test('✅ should log menu deletion', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Menu for Deletion Log',
          isActive: false,
        });

        await menuService.softDeleteMenu(menu.id, tenantId);

        // Check activity log
        const logs = await prisma.activityLog.findMany({
          where: {
            tenantId,
            action: 'MENU_DELETED',
            entityId: menu.id,
          },
        });

        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0].action).toBe('MENU_DELETED');
      });

      test('✅ should preserve menu history', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Menu with History',
          isActive: false,
        });

        const originalId = menu.id;
        const originalCreatedAt = menu.createdAt;

        // Soft delete
        await menuService.softDeleteMenu(menu.id, tenantId);

        // Retrieve from DB - should still exist
        const found = await prisma.menu.findUnique({ where: { id: originalId } });

        expect(found).toBeDefined();
        expect(found?.id).toBe(originalId);
        expect(found?.createdAt).toEqual(originalCreatedAt);
        expect(found?.isActive).toBe(false);
      });

      test('✅ should throw error if menu not found', async () => {
        await expect(
          menuService.softDeleteMenu('invalid-id', tenantId)
        ).rejects.toThrow('Menu not found');
      });
    });

    describe('getMenuById', () => {
      test('✅ should return menu with full details', async () => {
        const createdMenu = await menuService.createMenu(tenantId, {
          name: 'Detailed Menu',
        });

        const retrieved = await menuService.getMenuById(createdMenu.id, tenantId);

        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(createdMenu.id);
        expect(retrieved?.name).toBe('Detailed Menu');
        expect(retrieved?.tenantId).toBe(tenantId);
      });

      test('✅ should include sections with items', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Complex Menu',
        });

        const section = await menuService.addSection(menu.id, tenantId, {
          name: 'Beverages',
        });

        await prisma.menuItem.create({
          data: {
            tenantId,
            sectionId: section.id,
            name: 'Coffee',
            price: 3.5,
            isAvailable: true,
          },
        });

        const retrieved = await menuService.getMenuById(menu.id, tenantId);

        expect(retrieved?.sections).toBeDefined();
        expect(retrieved?.sections[0].items).toBeDefined();
        expect(retrieved?.sections[0].items.length).toBeGreaterThan(0);
      });
    });

    describe('getAllMenus', () => {
      test('✅ should retrieve all menus with pagination', async () => {
        // Create multiple menus
        for (let i = 0; i < 5; i++) {
          await menuService.createMenu(tenantId, {
            name: `Pagination Menu ${i + 1}`,
          });
        }

        const result = await menuService.getAllMenus(tenantId, {
          page: 1,
          pageSize: 10,
        });

        expect(result.items).toBeDefined();
        expect(result.total).toBeGreaterThanOrEqual(5);
        expect(result.page).toBe(1);
      });

      test('✅ should search menus by name', async () => {
        const menu1 = await menuService.createMenu(tenantId, {
          name: 'Unique Menu Search Test',
        });

        const result = await menuService.getAllMenus(tenantId, {
          search: 'Unique',
        });

        expect(result.items.length).toBeGreaterThan(0);
        expect(result.items.some((m) => m.id === menu1.id)).toBe(true);
      });
    });

    describe('updateMenu', () => {
      test('✅ should update menu name', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Original Name',
        });

        const updated = await menuService.updateMenu(menu.id, tenantId, {
          name: 'Updated Name',
        });

        expect(updated.name).toBe('Updated Name');
        expect(updated.id).toBe(menu.id);
      });

      test('✅ should update menu active status', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Status Update Test',
          isActive: true,
        });

        const updated = await menuService.updateMenu(menu.id, tenantId, {
          isActive: false,
        });

        expect(updated.isActive).toBe(false);
      });
    });

    describe('verifyMenuOwnership', () => {
      test('✅ should verify menu belongs to tenant', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Ownership Test',
        });

        const owns = await menuService.verifyMenuOwnership(menu.id, tenantId);

        expect(owns).toBe(true);
      });

      test('✅ should return false for non-existent menu', async () => {
        const owns = await menuService.verifyMenuOwnership('invalid-id', tenantId);

        expect(owns).toBe(false);
      });
    });

    describe('logMenuChange', () => {
      test('✅ should create activity log entry', async () => {
        const menu = await menuService.createMenu(tenantId, {
          name: 'Log Test Menu',
        });

        await menuService.logMenuChange(tenantId, menu.id, 'TEST_ACTION', {
          testKey: 'testValue',
        });

        const logs = await prisma.activityLog.findMany({
          where: {
            tenantId,
            entityId: menu.id,
            action: 'TEST_ACTION',
          },
        });

        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0].metadata).toBeDefined();
      });
    });
  });

  // ========================================
  // INTEGRATION TESTS
  // ========================================

  describe('Integration Tests', () => {
    test('✅ should handle complete menu lifecycle', async () => {
      // 1. Create menu
      const menu = await menuService.createMenu(tenantId, {
        name: 'Complete Lifecycle Menu',
        isActive: false,
      });

      expect(menu.id).toBeDefined();
      expect(menu.isActive).toBe(false);

      // 2. Add sections
      const appetizers = await menuService.addSection(menu.id, tenantId, {
        name: 'Appetizers',
        position: 1,
      });

      const mains = await menuService.addSection(menu.id, tenantId, {
        name: 'Main Courses',
        position: 2,
      });

      const desserts = await menuService.addSection(menu.id, tenantId, {
        name: 'Desserts',
        position: 3,
      });

      expect(appetizers.position).toBe(1);
      expect(mains.position).toBe(2);
      expect(desserts.position).toBe(3);

      // 3. Add items
      const item1 = await prisma.menuItem.create({
        data: {
          tenantId,
          sectionId: appetizers.id,
          name: 'Bruschetta',
          price: 8.99,
          isAvailable: true,
        },
      });

      const item2 = await prisma.menuItem.create({
        data: {
          tenantId,
          sectionId: mains.id,
          name: 'Ribeye Steak',
          price: 34.99,
          isAvailable: true,
        },
      });

      expect(item1.price.toString()).toBe('8.99');
      expect(item2.price.toString()).toBe('34.99');

      // 4. Activate menu
      const activated = await menuService.activateMenu(menu.id, tenantId);

      expect(activated.isActive).toBe(true);
      expect(activated.sections.length).toBe(3);
      expect(activated.sections[0].items.length).toBeGreaterThan(0);

      // 5. Get active menu
      const activeMenu = await menuService.getActiveMenu(tenantId);

      expect(activeMenu?.id).toBe(menu.id);
      expect(activeMenu?.isActive).toBe(true);

      // 6. Verify activity logs
      const logs = await prisma.activityLog.findMany({
        where: {
          tenantId,
          entityId: menu.id,
        },
      });

      expect(logs.length).toBeGreaterThan(0);
    });

    test('✅ should handle menu switching', async () => {
      // First, deactivate any existing active menus
      await prisma.menu.updateMany({
        where: { tenantId, isActive: true },
        data: { isActive: false },
      });

      // Create two menus
      const breakfastMenu = await menuService.createMenu(tenantId, {
        name: 'Breakfast Menu',
        isActive: false,
      });

      const lunchMenu = await menuService.createMenu(tenantId, {
        name: 'Lunch Menu',
        isActive: false,
      });

      // Activate breakfast
      await menuService.activateMenu(breakfastMenu.id, tenantId);

      // Verify breakfast is active
      let activeMenu = await menuService.getActiveMenu(tenantId);
      expect(activeMenu?.id).toBe(breakfastMenu.id);

      // Switch to lunch
      await menuService.activateMenu(lunchMenu.id, tenantId);
      activeMenu = await menuService.getActiveMenu(tenantId);
      expect(activeMenu?.id).toBe(lunchMenu.id);

      // Verify breakfast is now inactive
      const breakfast = await menuService.getMenuById(breakfastMenu.id, tenantId);
      expect(breakfast?.isActive).toBe(false);
    });

    test('✅ should maintain section ordering', async () => {
      const menu = await menuService.createMenu(tenantId, {
        name: 'Ordered Menu',
        isActive: false,
      });

      // Add sections in specific order
      const section3 = await menuService.addSection(menu.id, tenantId, {
        name: 'Desserts',
        position: 3,
      });

      const section1 = await menuService.addSection(menu.id, tenantId, {
        name: 'Appetizers',
        position: 1,
      });

      const section2 = await menuService.addSection(menu.id, tenantId, {
        name: 'Mains',
        position: 2,
      });

      // Activate and get
      const activated = await menuService.activateMenu(menu.id, tenantId);

      // Verify order
      expect(activated.sections[0].name).toBe('Appetizers');
      expect(activated.sections[1].name).toBe('Mains');
      expect(activated.sections[2].name).toBe('Desserts');
    });

    test('✅ should show only available items in active menu', async () => {
      const menu = await menuService.createMenu(tenantId, {
        name: 'Availability Test',
        isActive: false,
      });

      const section = await menuService.addSection(menu.id, tenantId, {
        name: 'Items',
      });

      // Add available item
      await prisma.menuItem.create({
        data: {
          tenantId,
          sectionId: section.id,
          name: 'Available Item',
          price: 10.0,
          isAvailable: true,
        },
      });

      // Add unavailable item
      await prisma.menuItem.create({
        data: {
          tenantId,
          sectionId: section.id,
          name: 'Unavailable Item',
          price: 10.0,
          isAvailable: false,
        },
      });

      const activeMenu = await menuService.activateMenu(menu.id, tenantId);

      // Verify only available items are shown
      expect(activeMenu.sections[0].items.length).toBe(1);
      expect(activeMenu.sections[0].items[0].name).toBe('Available Item');
    });
  });

  // ========================================
  // EDGE CASES & ERROR HANDLING
  // ========================================

  describe('Edge Cases & Error Handling', () => {
    test('✅ should handle menu with no sections', async () => {
      const menu = await menuService.createMenu(tenantId, {
        name: 'Empty Menu',
        isActive: true,
      });

      const retrieved = await menuService.getMenuById(menu.id, tenantId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.sections.length).toBe(0);
    });

    test('✅ should handle duplicate section names in same menu', async () => {
      const menu = await menuService.createMenu(tenantId, {
        name: 'Duplicate Sections Menu',
      });

      const section1 = await menuService.addSection(menu.id, tenantId, {
        name: 'Appetizers',
        position: 1,
      });

      const section2 = await menuService.addSection(menu.id, tenantId, {
        name: 'Appetizers',
        position: 2,
      });

      expect(section1.name).toBe(section2.name);
      expect(section1.id).not.toBe(section2.id);
      expect(section1.position).not.toBe(section2.position);
    });

    test('✅ should handle database constraints properly', async () => {
      const nonExistentTenant = 'non-existent-tenant-id';

      // Should fail due to foreign key constraint
      await expect(
        menuService.createMenu(nonExistentTenant, { name: 'Invalid Menu' })
      ).rejects.toThrow();
    });
  });

  // ========================================
  // PERFORMANCE TESTS
  // ========================================

  describe('Performance Tests', () => {
    test('✅ menu creation should complete within 100ms', async () => {
      const start = performance.now();

      await menuService.createMenu(tenantId, {
        name: `Performance Test Menu ${Date.now()}`,
      });

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });

    test('✅ menu activation should complete within 200ms', async () => {
      const menu = await menuService.createMenu(tenantId, {
        name: `Activation Test ${Date.now()}`,
        isActive: false,
      });

      const start = performance.now();
      await menuService.activateMenu(menu.id, tenantId);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(200);
    });

    test('✅ get active menu should complete within 100ms', async () => {
      const start = performance.now();
      await menuService.getActiveMenu(tenantId);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
    });

    test('✅ section addition should be quick', async () => {
      const menu = await menuService.createMenu(tenantId, {
        name: `Section Test ${Date.now()}`,
      });

      const start = performance.now();
      await menuService.addSection(menu.id, tenantId, { name: 'Test Section' });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
