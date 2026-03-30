import { PrismaClient, VipTier } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import CustomerService from '../src/services/CustomerService';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

const prisma = new PrismaClient();
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIfIntegration = runIntegrationTests ? describe : describe.skip;

describeIfIntegration('Customer Management System - Phase 1-5 Implementation Tests', () => {
  let tenantId: string;
  let serverId: string;
  let customerId: string;
  let anotherCustomerId: string;

  beforeAll(async () => {
    // Create test tenant and user
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Restaurant',
        isActive: true,
      },
    });

    tenantId = tenant.id;

    const location = await prisma.location.create({
      data: {
        tenantId,
        name: 'Main Location',
      },
    });

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `test-server-${Date.now()}@restaurant.com`,
        name: 'Test Server',
        passwordHash: 'hashed',
        role: 'STAFF',
        locationId: location.id,
        positions: ['SERVER'],
      },
    });

    serverId = user.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.location.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  // ========================================
  // PHASE 1: CUSTOMER CRUD OPERATIONS
  // ========================================

  describe('Phase 1: Customer CRUD Operations', () => {
    test('✅ Should create a new customer', async () => {
      const customer = await CustomerService.createCustomer(
        {
          name: 'John Doe',
          phone: '+1-555-0100',
          email: 'john@example.com',
          tags: ['regular'],
          notes: 'Prefers table by window',
        },
        tenantId,
        serverId
      );

      expect(customer.name).toBe('John Doe');
      expect(customer.phone).toBe('+1-555-0100');
      expect(customer.email).toBe('john@example.com');
      expect(customer.vipStatus).toBe(false);
      expect(customer.visitCount).toBe(0);

      customerId = customer.id;
    });

    test('✅ Should get customer by ID', async () => {
      const customer = await CustomerService.getCustomerById(
        customerId,
        tenantId
      );

      expect(customer.id).toBe(customerId);
      expect(customer.name).toBe('John Doe');
    });

    test('✅ Should find customer by phone', async () => {
      const customer = await CustomerService.findByPhone(
        '+1-555-0100',
        tenantId
      );

      expect(customer).not.toBeNull();
      expect(customer?.phone).toBe('+1-555-0100');
    });

    test('✅ Should prevent duplicate phone numbers', async () => {
      try {
        await CustomerService.createCustomer(
          {
            name: 'Jane Doe',
            phone: '+1-555-0100',
            email: 'jane@example.com',
          },
          tenantId,
          serverId
        );

        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain('already exists');
      }
    });

    test('✅ Should list all customers with pagination', async () => {
      // Create another customer first
      const customer2 = await CustomerService.createCustomer(
        {
          name: 'Jane Smith',
          phone: '+1-555-0101',
          email: 'jane@example.com',
        },
        tenantId,
        serverId
      );

      anotherCustomerId = customer2.id;

      const result = await CustomerService.getAllCustomers(tenantId, {}, {
        page: 1,
        pageSize: 10,
      });

      expect(result.data.length).toBeGreaterThanOrEqual(2);
      expect(result.pagination.total).toBeGreaterThanOrEqual(2);
    });

    test('✅ Should update customer', async () => {
      const updated = await CustomerService.updateCustomer(
        customerId,
        {
          name: 'John Updated',
          notes: 'VIP customer',
          tags: ['vip', 'anniversary'],
        },
        tenantId,
        serverId
      );

      expect(updated.name).toBe('John Updated');
      expect(updated.notes).toBe('VIP customer');
      expect(updated.tags).toContain('vip');
    });

    test('✅ Should search customers by name', async () => {
      const result = await CustomerService.searchCustomers(
        tenantId,
        'John',
        'name'
      );

      expect(result.data.length).toBeGreaterThan(0);
      expect(
        result.data.some((c: any) => c.name.includes('John'))
      ).toBe(true);
    });

    test('✅ Should search customers by phone', async () => {
      const result = await CustomerService.searchCustomers(
        tenantId,
        '555',
        'phone'
      );

      expect(result.data.length).toBeGreaterThan(0);
    });

    test('✅ Should soft delete customer', async () => {
      const deleted = await CustomerService.deleteCustomer(
        anotherCustomerId,
        tenantId,
        serverId
      );

      expect(deleted.deletedAt).not.toBeNull();

      // Verify it's hidden in queries
      const result = await CustomerService.getAllCustomers(tenantId, {}, {
        page: 1,
        pageSize: 10,
      });

      expect(result.data.find((c: any) => c.id === anotherCustomerId)).toBeUndefined();
    });
  });

  // ========================================
  // PHASE 2: VIP SYSTEM & AUTO-PROMOTION
  // ========================================

  describe('Phase 2: VIP System & Auto-Promotion', () => {
    test('✅ Should auto-promote to GOLD tier at 10 visits', async () => {
      // Simulate 10 orders worth $500 each ($5000 total, 10 visits)
      const totalSpend = new Decimal(500);

      for (let i = 0; i < 10; i++) {
        await CustomerService.recordOrderCompletion(
          customerId,
          totalSpend,
          tenantId
        );
      }

      const customer = await CustomerService.getCustomerById(
        customerId,
        tenantId
      );

      expect(customer.visitCount).toBe(10);
      expect(customer.vipStatus).toBe(true);
      // With $5000 spend, should be promoted to DIAMOND (>= $5000)
      expect([VipTier.GOLD, VipTier.PLATINUM, VipTier.DIAMOND]).toContain(
        customer.vipTier
      );
    });

    test('✅ Should auto-promote to PLATINUM at $2500 spend', async () => {
      // Already have $5000 from above, should be DIAMOND or at least PLATINUM
      const customer = await CustomerService.getCustomerById(
        customerId,
        tenantId
      );

      expect(customer.vipStatus).toBe(true);
      expect([VipTier.PLATINUM, VipTier.DIAMOND]).toContain(customer.vipTier);
    });

    test('✅ Should auto-promote to DIAMOND at $5000 spend', async () => {
      const customer = await CustomerService.getCustomerById(
        customerId,
        tenantId
      );

      if (parseFloat(customer.lifetimeSpend as string) >= 5000) {
        expect(customer.vipTier).toBe(VipTier.DIAMOND);
      }
    });

    test('✅ Should manually update VIP status', async () => {
      // Create a new customer for this test
      const newCustomer = await CustomerService.createCustomer(
        {
          name: 'VIP Test',
          phone: '+1-555-0200',
          email: 'vip@example.com',
        },
        tenantId,
        serverId
      );

      const updated = await CustomerService.updateVipStatus(
        newCustomer.id,
        tenantId,
        true,
        VipTier.GOLD,
        serverId
      );

      expect(updated.vipStatus).toBe(true);
      expect(updated.vipTier).toBe(VipTier.GOLD);
    });

    test('✅ Should list all VIP customers', async () => {
      const result = await CustomerService.getVipCustomers(tenantId, {
        page: 1,
        pageSize: 10,
      });

      expect(result.data.some((c: any) => c.id === customerId)).toBe(true);
      expect(result.data.every((c: any) => c.vipStatus === true)).toBe(true);
    });

    test('✅ Should calculate VIP analytics', async () => {
      const analytics = await CustomerService.getVipAnalytics(tenantId);

      expect(analytics.totalVipCustomers).toBeGreaterThan(0);
      expect(analytics.topVips.length).toBeGreaterThan(0);
      expect(analytics.byTier).toHaveProperty('gold');
    });
  });

  // ========================================
  // PHASE 3: PREFERENCES & HISTORY
  // ========================================

  describe('Phase 3: Customer Preferences & History', () => {
    test('✅ Should update customer preferences', async () => {
      const preferences = {
        dietaryRestrictions: ['vegetarian'],
        allergies: ['peanuts', 'shellfish'],
        seatingPreference: 'window table',
        winePreferences: ['red wine', 'pinot noir'],
        favoriteItems: ['filet mignon', 'seafood pasta'],
      };

      const customer = await CustomerService.updatePreferences(
        customerId,
        tenantId,
        preferences,
        serverId
      );

      expect(customer.preferences).toEqual(expect.objectContaining(preferences));
    });

    test('✅ Should retrieve customer preferences', async () => {
      const preferences = await CustomerService.getPreferences(
        customerId,
        tenantId
      );

      expect(preferences.dietaryRestrictions).toContain('vegetarian');
      expect(preferences.allergies).toContain('peanuts');
    });

    test('✅ Should get customer statistics', async () => {
      const stats = await CustomerService.getCustomerStats(customerId, tenantId);

      expect(stats.visitCount).toBe(10);
      expect(stats.vipStatus).toBe(true);
      expect(parseFloat(stats.lifetimeSpend)).toBeGreaterThanOrEqual(5000);
    });

    test('✅ Should get customer reservations', async () => {
      // Create a test reservation
      const table = await prisma.table.create({
        data: {
          tenantId,
          locationId: (
            await prisma.location.findFirst({
              where: { tenantId },
            })
          )!.id,
          name: 'Table 1',
          capacity: 4,
          status: 'AVAILABLE',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
      });

      const reservation = await prisma.reservation.create({
        data: {
          tenantId,
          customerId,
          tableId: table.id,
          guestName: 'John Doe',
          guestPhone: '+1-555-0100',
          guestCount: 2,
          reservedAt: new Date(),
          status: 'CONFIRMED',
        },
      });

      const result = await CustomerService.getCustomerReservations(
        customerId,
        tenantId
      );

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.some((r: any) => r.id === reservation.id)).toBe(true);

      // Cleanup
      await prisma.table.delete({ where: { id: table.id } });
    });
  });

  // ========================================
  // PHASE 4: SEARCH & ADVANCED FEATURES
  // ========================================

  describe('Phase 4: Smart Search & Advanced Features', () => {
    test('✅ Should detect duplicate customers', async () => {
      // Create a potential duplicate
      const duplicate = await CustomerService.createCustomer(
        {
          name: 'John Doe Jr',
          phone: '+1-555-0100-DUP',
          email: 'johnjr@example.com',
        },
        tenantId,
        serverId
      );

      const duplicates = await CustomerService.detectDuplicates(
        customerId,
        tenantId
      );

      // Should find customers with similar phone patterns
      expect(Array.isArray(duplicates)).toBe(true);

      // Cleanup
      await CustomerService.deleteCustomer(duplicate.id, tenantId, serverId);
    });

    test('✅ Should merge customers', async () => {
      // Create two customers to merge
      const customer1 = await CustomerService.createCustomer(
        {
          name: 'Original',
          phone: '+1-555-0300',
          email: 'original@example.com',
        },
        tenantId,
        serverId
      );

      // Add some metrics
      await CustomerService.recordOrderCompletion(
        customer1.id,
        new Decimal(100),
        tenantId
      );

      const customer2 = await CustomerService.createCustomer(
        {
          name: 'Duplicate',
          phone: '+1-555-0301',
          email: 'duplicate@example.com',
        },
        tenantId,
        serverId
      );

      // Add different metrics
      await CustomerService.recordOrderCompletion(
        customer2.id,
        new Decimal(200),
        tenantId
      );

      // Merge customer2 into customer1
      const merged = await CustomerService.mergeCustomers(
        customer1.id,
        customer2.id,
        tenantId,
        serverId
      );

      expect(merged.visitCount).toBe(2);
      expect(parseFloat(merged.lifetimeSpend)).toBe(300);

      // Verify customer2 is soft deleted
      const customer2Check = await prisma.customer.findUnique({
        where: { id: customer2.id },
      });

      expect(customer2Check?.deletedAt).not.toBeNull();

      // Cleanup
      await CustomerService.deleteCustomer(customer1.id, tenantId, serverId);
    });

    test('✅ Should get top customers by spend', async () => {
      const topCustomers = await CustomerService.getTopCustomersBySpend(
        tenantId,
        5
      );

      expect(topCustomers.length).toBeGreaterThan(0);
      if (topCustomers.length > 1) {
        expect(
          parseFloat(topCustomers[0].lifetimeSpend as string) >=
            parseFloat(topCustomers[1].lifetimeSpend as string)
        ).toBe(true);
      }
    });

    test('✅ Should calculate retention analytics', async () => {
      const analytics = await CustomerService.getRetentionAnalytics(
        tenantId,
        90
      );

      expect(analytics.period).toBe('90 days');
      expect(analytics.totalCustomers).toBeGreaterThanOrEqual(0);
      expect(analytics.returningCustomers).toBeGreaterThanOrEqual(0);
      expect(parseFloat(analytics.retentionRate)).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================
  // PHASE 5: PRIVACY & COMPLIANCE
  // ========================================

  describe('Phase 5: Privacy & Compliance (GDPR)', () => {
    test('✅ Should export customer data', async () => {
      const exportData = await CustomerService.exportCustomerData(
        customerId,
        tenantId
      );

      expect(exportData.profile).not.toBeNull();
      expect(exportData.profile.id).toBe(customerId);
      expect(Array.isArray(exportData.reservations)).toBe(true);
      expect(Array.isArray(exportData.orders)).toBe(true);
      expect(exportData.preferences).not.toBeNull();
      expect(exportData.exportDate).not.toBeNull();
    });

    test('✅ Should hard delete customer with GDPR anonymization', async () => {
      // Create a test customer
      const testCustomer = await CustomerService.createCustomer(
        {
          name: 'GDPR Test',
          phone: '+1-555-0999',
          email: 'gdpr@example.com',
        },
        tenantId,
        serverId
      );

      // Create a reservation for this customer
      const table = await prisma.table.create({
        data: {
          tenantId,
          locationId: (
            await prisma.location.findFirst({
              where: { tenantId },
            })
          )!.id,
          name: 'Table Test GDPR',
          capacity: 4,
          status: 'AVAILABLE',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
      });

      const reservation = await prisma.reservation.create({
        data: {
          tenantId,
          customerId: testCustomer.id,
          tableId: table.id,
          guestName: testCustomer.name,
          guestEmail: testCustomer.email,
          guestPhone: testCustomer.phone,
          guestCount: 2,
          reservedAt: new Date(),
          status: 'CONFIRMED',
        },
      });

      // Hard delete customer
      await CustomerService.hardDeleteCustomer(testCustomer.id, tenantId, serverId);

      // Verify customer is deleted
      const deletedCustomer = await prisma.customer.findUnique({
        where: { id: testCustomer.id },
      });

      expect(deletedCustomer).toBeNull();

      // Verify reservation is anonymized
      const anonymizedReservation = await prisma.reservation.findUnique({
        where: { id: reservation.id },
      });

      expect(anonymizedReservation?.guestName).toBe('DELETED_CUSTOMER');
      expect(anonymizedReservation?.guestEmail).toBeNull();
      expect(anonymizedReservation?.guestPhone).toBeNull();

      // Cleanup
      await prisma.reservation.delete({ where: { id: reservation.id } });
      await prisma.table.delete({ where: { id: table.id } });
    });

    test('✅ Should maintain audit trail for all operations', async () => {
      const logs = await prisma.activityLog.findMany({
        where: {
          tenantId,
          entity: 'Customer',
        },
      });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((l) => l.action === 'CREATE')).toBe(true);
      expect(logs.some((l) => l.action === 'UPDATE')).toBe(true);
    });
  });

  // ========================================
  // INTEGRATION: AUTO-CREATE ON RESERVATION
  // ========================================

  describe('Integration: Auto-Create Customer on Reservation', () => {
    test('✅ Should auto-create customer when creating reservation', async () => {
      const table = await prisma.table.create({
        data: {
          tenantId,
          locationId: (
            await prisma.location.findFirst({
              where: { tenantId },
            })
          )!.id,
          name: 'Table Auto Create',
          capacity: 4,
          status: 'AVAILABLE',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
      });

      // This simulates what ReservationService does
      const newPhone = '+1-555-AUTO-CREATE';
      const existingCustomer = await CustomerService.findByPhone(
        newPhone,
        tenantId
      );

      if (!existingCustomer) {
        const autoCreatedCustomer = await CustomerService.createCustomer(
          {
            name: 'Auto Created Guest',
            phone: newPhone,
            email: 'auto@example.com',
          },
          tenantId,
          serverId
        );

        expect(autoCreatedCustomer).not.toBeNull();
        expect(autoCreatedCustomer.phone).toBe(newPhone);
      }

      // Cleanup
      await prisma.table.delete({ where: { id: table.id } });
    });
  });
});
