import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaClient, TableStatus } from '@prisma/client';
import { TableService } from '../src/services/TableService';

const prisma = new PrismaClient();
const tableService = new TableService();
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIfIntegration = runIntegrationTests ? describe : describe.skip;

describeIfIntegration('TableService', () => {
  let testTenantId: string;
  let testLocationId: string;
  let testTableId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Setup test data
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant - Table Service',
        isActive: true,
      },
    });

    testTenantId = tenant.id;

    const location = await prisma.location.create({
      data: {
        tenantId: testTenantId,
        name: 'Test Location',
        address: '123 Test Street',
      },
    });

    testLocationId = location.id;

    const table = await prisma.table.create({
      data: {
        tenantId: testTenantId,
        locationId: testLocationId,
        name: 'Test Table 1',
        capacity: 4,
        status: TableStatus.AVAILABLE,
        x: 10,
        y: 20,
        width: 1.0,
        height: 1.0,
      },
    });

    testTableId = table.id;

    const user = await prisma.user.create({
      data: {
        tenantId: testTenantId,
        email: `testserver-${Date.now()}@example.com`,
        name: 'Test Server',
        passwordHash: 'hashedpassword',
        role: 'STAFF',
        positions: ['SERVER'],
      },
    });

    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.table.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.location.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
    await prisma.$disconnect();
  });

  describe('getTablesByLocation', () => {
    it('should retrieve all tables for a location', async () => {
      const tables = await tableService.getTablesByLocation(testLocationId, testTenantId);
      expect(tables).toBeDefined();
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      expect(tables[0].locationId).toBe(testLocationId);
    });

    it('should return empty array for non-existent location', async () => {
      const tables = await tableService.getTablesByLocation('non-existent-id', testTenantId);
      expect(Array.isArray(tables)).toBe(true);
    });

    it('should respect tenant isolation', async () => {
      const tables = await tableService.getTablesByLocation(testLocationId, 'different-tenant-id');
      expect(tables.length).toBe(0);
    });
  });

  describe('getTableById', () => {
    it('should retrieve a specific table by ID', async () => {
      const table = await tableService.getTableById(testTableId, testTenantId);
      expect(table).toBeDefined();
      expect(table?.id).toBe(testTableId);
      expect(table?.tenantId).toBe(testTenantId);
    });

    it('should return null for non-existent table', async () => {
      const table = await tableService.getTableById('non-existent-id', testTenantId);
      expect(table).toBeNull();
    });

    it('should enforce tenant isolation', async () => {
      const table = await tableService.getTableById(testTableId, 'different-tenant-id');
      expect(table).toBeNull();
    });
  });

  describe('updateTableStatus', () => {
    it('should update table status to OCCUPIED', async () => {
      const updated = await tableService.updateTableStatus(testTableId, testTenantId, TableStatus.OCCUPIED);
      expect(updated.status).toBe(TableStatus.OCCUPIED);
    });

    it('should update table status to RESERVED', async () => {
      const updated = await tableService.updateTableStatus(testTableId, testTenantId, TableStatus.RESERVED);
      expect(updated.status).toBe(TableStatus.RESERVED);
    });

    it('should update table status to CLEANING', async () => {
      const updated = await tableService.updateTableStatus(testTableId, testTenantId, TableStatus.CLEANING);
      expect(updated.status).toBe(TableStatus.CLEANING);
    });

    it('should update table status back to AVAILABLE', async () => {
      const updated = await tableService.updateTableStatus(testTableId, testTenantId, TableStatus.AVAILABLE);
      expect(updated.status).toBe(TableStatus.AVAILABLE);
    });
  });

  describe('getFloorPlan', () => {
    it('should return all tables with floor plan coordinates', async () => {
      const floorPlan = await tableService.getFloorPlan(testLocationId, testTenantId);
      expect(Array.isArray(floorPlan)).toBe(true);
      expect(floorPlan.length).toBeGreaterThan(0);
      floorPlan.forEach((table: any) => {
        expect(table).toHaveProperty('x');
        expect(table).toHaveProperty('y');
        expect(table).toHaveProperty('width');
        expect(table).toHaveProperty('height');
        expect(table).toHaveProperty('capacity');
        expect(table).toHaveProperty('status');
      });
    });

    it('should return empty array for non-existent location', async () => {
      const floorPlan = await tableService.getFloorPlan('non-existent-location', testTenantId);
      expect(Array.isArray(floorPlan)).toBe(true);
    });
  });

  describe('seatGuests', () => {
    it('should seat guests at an available table', async () => {
      const result = await tableService.seatGuests(testTableId, 2, testTenantId, testUserId);
      expect(result.table).toBeDefined();
      expect(result.order).toBeDefined();
      expect(result.table.status).toBe(TableStatus.OCCUPIED);
      expect(result.order.guestCount).toBe(2);
    });

    it('should throw error when seating at occupied table', async () => {
      // Table should still be occupied from previous test
      await expect(
        tableService.seatGuests(testTableId, 2, testTenantId, testUserId)
      ).rejects.toThrow('Table is already occupied');
      
      // Release the table for subsequent tests
      await tableService.releaseTable(testTableId, testTenantId);
    });

    it('should throw error when guest count exceeds capacity', async () => {
      // Create a new available table
      const table = await prisma.table.create({
        data: {
          tenantId: testTenantId,
          locationId: testLocationId,
          name: 'Small Table',
          capacity: 2,
          status: TableStatus.AVAILABLE,
          x: 30,
          y: 40,
          width: 0.8,
          height: 0.8,
        },
      });

      await expect(
        tableService.seatGuests(table.id, 5, testTenantId, testUserId)
      ).rejects.toThrow('Guest count (5) exceeds table capacity (2)');

      // Cleanup
      await prisma.table.delete({ where: { id: table.id } });
    });

    it('should create associated order when seating guests', async () => {
      // Create a new available table
      const table = await prisma.table.create({
        data: {
          tenantId: testTenantId,
          locationId: testLocationId,
          name: 'Order Test Table',
          capacity: 4,
          status: TableStatus.AVAILABLE,
          x: 50,
          y: 60,
          width: 1.0,
          height: 1.0,
        },
      });

      const result = await tableService.seatGuests(table.id, 3, testTenantId, testUserId);
      expect(result.order.status).toBe('OPEN');
      expect(result.order.guestCount).toBe(3);
      expect(result.order.serverId).toBe(testUserId);

      // Cleanup
      await prisma.table.delete({ where: { id: table.id } });
    });
  });

  describe('releaseTable', () => {
    it('should release an occupied table', async () => {
      // Create a new table and seat guests
      const table = await prisma.table.create({
        data: {
          tenantId: testTenantId,
          locationId: testLocationId,
          name: 'Release Test Table',
          capacity: 4,
          status: TableStatus.AVAILABLE,
          x: 70,
          y: 80,
          width: 1.0,
          height: 1.0,
        },
      });

      await tableService.seatGuests(table.id, 2, testTenantId, testUserId);

      const result = await tableService.releaseTable(table.id, testTenantId);
      expect(result.table.status).toBe(TableStatus.AVAILABLE);

      // Cleanup
      await prisma.table.delete({ where: { id: table.id } });
    });

    it('should throw error when releasing non-occupied table', async () => {
      const table = await prisma.table.create({
        data: {
          tenantId: testTenantId,
          locationId: testLocationId,
          name: 'Not Occupied Table',
          capacity: 4,
          status: TableStatus.AVAILABLE,
          x: 90,
          y: 100,
          width: 1.0,
          height: 1.0,
        },
      });

      await expect(tableService.releaseTable(table.id, testTenantId)).rejects.toThrow(
        'Table is not occupied'
      );

      // Cleanup
      await prisma.table.delete({ where: { id: table.id } });
    });

    it('should close associated order when releasing table', async () => {
      const table = await prisma.table.create({
        data: {
          tenantId: testTenantId,
          locationId: testLocationId,
          name: 'Close Order Table',
          capacity: 4,
          status: TableStatus.AVAILABLE,
          x: 110,
          y: 120,
          width: 1.0,
          height: 1.0,
        },
      });

      const { order: openOrder } = await tableService.seatGuests(table.id, 2, testTenantId, testUserId);

      await tableService.releaseTable(table.id, testTenantId);

      const closedOrder = await prisma.order.findUnique({
        where: { id: openOrder.id },
      });

      expect(closedOrder?.status).toBe('CLOSED');

      // Cleanup
      await prisma.table.delete({ where: { id: table.id } });
    });
  });

  describe('checkTableAvailability', () => {
    it('should return available tables for a location', async () => {
      const available = await tableService.checkTableAvailability(testLocationId, testTenantId);
      expect(Array.isArray(available)).toBe(true);
      available.forEach((table: any) => {
        expect(table.status).toBe(TableStatus.AVAILABLE);
      });
    });

    it('should filter available tables by capacity', async () => {
      const available = await tableService.checkTableAvailability(testLocationId, testTenantId, 4);
      expect(Array.isArray(available)).toBe(true);
      available.forEach((table: any) => {
        expect(table.capacity).toBeGreaterThanOrEqual(4);
      });
    });

    it('should return empty array if no tables match criteria', async () => {
      const available = await tableService.checkTableAvailability(testLocationId, testTenantId, 50);
      expect(Array.isArray(available)).toBe(true);
    });
  });

  describe('getTableStatus', () => {
    it('should return status summary for all tables in location', async () => {
      const summary = await tableService.getTableStatus(testLocationId, testTenantId);
      expect(summary).toBeDefined();
      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('occupied');
      expect(summary).toHaveProperty('available');
      expect(summary).toHaveProperty('reserved');
      expect(summary).toHaveProperty('cleaning');
      expect(summary).toHaveProperty('maintenance');
      expect(summary).toHaveProperty('tables');
      expect(Array.isArray(summary.tables)).toBe(true);
    });

    it('should return accurate status counts', async () => {
      const summary = await tableService.getTableStatus(testLocationId, testTenantId);
      const total = summary.occupied + summary.available + summary.reserved + summary.cleaning + summary.maintenance;
      expect(total).toBe(summary.total);
    });
  });

  describe('validateTableOccupancy', () => {
    it('should return true for occupied table', async () => {
      // First seat guests
      const table = await prisma.table.create({
        data: {
          tenantId: testTenantId,
          locationId: testLocationId,
          name: 'Occupancy Test Table',
          capacity: 4,
          status: TableStatus.AVAILABLE,
          x: 130,
          y: 140,
          width: 1.0,
          height: 1.0,
        },
      });

      await tableService.seatGuests(table.id, 2, testTenantId, testUserId);

      const isOccupied = await tableService.validateTableOccupancy(table.id, testTenantId);
      expect(isOccupied).toBe(true);

      // Cleanup
      await tableService.releaseTable(table.id, testTenantId);
      await prisma.table.delete({ where: { id: table.id } });
    });

    it('should return false for available table', async () => {
      const isOccupied = await tableService.validateTableOccupancy(testTableId, testTenantId);
      expect(isOccupied).toBe(false);
    });

    it('should throw error for non-existent table', async () => {
      await expect(
        tableService.validateTableOccupancy('non-existent-id', testTenantId)
      ).rejects.toThrow('Table not found');
    });
  });
});
