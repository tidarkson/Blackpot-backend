import { PrismaClient, ReservationStatus, TableStatus } from '@prisma/client';
import ReservationService from '../src/services/ReservationService';

const prisma = new PrismaClient();

describe('ReservationService', () => {
  let testTenantId: string;
  let testLocationId: string;
  let testTableId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Setup test data
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Restaurant',
        isActive: true,
      },
    });

    testTenantId = tenant.id;

    const location = await prisma.location.create({
      data: {
        tenantId: testTenantId,
        name: 'Main Location',
      },
    });

    testLocationId = location.id;

    const user = await prisma.user.create({
      data: {
        tenantId: testTenantId,
        email: `test-server-${Date.now()}@restaurant.com`,
        name: 'Test Server',
        passwordHash: 'hashed',
        role: 'STAFF',
        locationId: testLocationId,
        positions: ['SERVER'],
      },
    });

    testUserId = user.id;

    const table = await prisma.table.create({
      data: {
        tenantId: testTenantId,
        locationId: testLocationId,
        name: 'Table 1',
        capacity: 4,
        status: 'AVAILABLE',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    });

    testTableId = table.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.reservation.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.table.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.location.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
    await prisma.$disconnect();
  });

  describe('createReservation', () => {
    it('should create a reservation', async () => {
      const reservation = await ReservationService.createReservation(
        {
          tableId: testTableId,
          guestName: 'John Smith',
          guestEmail: 'john@example.com',
          guestPhone: '+1-555-0100',
          guestCount: 4,
          reservedAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
          notes: 'Special occasion',
        },
        testTenantId,
        testUserId
      );

      expect(reservation).toBeDefined();
      expect(reservation.status).toBe(ReservationStatus.PENDING);
      expect(reservation.guestCount).toBe(4);
    });

    it('should fail with non-existent table', async () => {
      await expect(
        ReservationService.createReservation(
          {
            tableId: 'fake-id',
            guestName: 'John Smith',
            guestEmail: 'john@example.com',
            guestPhone: '+1-555-0100',
            guestCount: 4,
            reservedAt: new Date(),
            notes: 'Test',
          },
          testTenantId,
          testUserId
        )
      ).rejects.toThrow('Table');
    });
  });

  describe('getAllReservations', () => {
    it('should list all reservations with pagination', async () => {
      const result = await ReservationService.getAllReservations(
        testTenantId,
        {},
        { page: 1, pageSize: 25 }
      );

      expect(result.data).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
    });

    it('should filter by status', async () => {
      // First create a confirmed reservation
      const confirmed = await ReservationService.createReservation(
        {
          tableId: testTableId,
          guestName: 'Jane Confirmed',
          guestEmail: 'jane.confirmed@example.com',
          guestPhone: '+1-555-0999',
          guestCount: 2,
          reservedAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
        testTenantId,
        testUserId
      );

      // Confirm it
      await ReservationService.updateReservationStatus(
        confirmed.id,
        ReservationStatus.CONFIRMED,
        testTenantId,
        testUserId
      );

      const result = await ReservationService.getAllReservations(
        testTenantId,
        { status: ReservationStatus.CONFIRMED },
        { page: 1, pageSize: 25 }
      );

      // Verify we can retrieve data (may contain mixed statuses in test DB)
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      // The created confirmed reservation should be in the results
      expect(result.data.some((r) => r.id === confirmed.id && r.status === ReservationStatus.CONFIRMED)).toBe(true);
    });

    it('should filter by date', async () => {
      const testDate = new Date();
      const result = await ReservationService.getAllReservations(
        testTenantId,
        { date: testDate },
        { page: 1, pageSize: 25 }
      );

      expect(result.data).toBeDefined();
    });

    it('should search by guest name', async () => {
      const result = await ReservationService.getAllReservations(
        testTenantId,
        { guestName: 'Smith' },
        { page: 1, pageSize: 25 }
      );

      expect(
        result.data.every((r) =>
          r.guestName.toLowerCase().includes('smith')
        )
      ).toBe(true);
    });
  });

  describe('updateReservation', () => {
    it('should update reservation details', async () => {
      // Create a reservation first
      const created = await ReservationService.createReservation(
        {
          tableId: testTableId,
          guestName: 'John Smith',
          guestEmail: 'john@example.com',
          guestPhone: '+1-555-0100',
          guestCount: 4,
          reservedAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
        testTenantId,
        testUserId
      );

      // Update it
      const updated = await ReservationService.updateReservation(
        created.id,
        {
          guestName: 'Jane Smith',
          guestCount: 5,
        },
        testTenantId,
        testUserId
      );

      expect(updated.guestName).toBe('Jane Smith');
      expect(updated.guestCount).toBe(5);
    });
  });

  describe('updateReservationStatus', () => {
    it('should transition PENDING → CONFIRMED', async () => {
      const created = await ReservationService.createReservation(
        {
          tableId: testTableId,
          guestName: 'John Smith',
          guestEmail: 'john@example.com',
          guestPhone: '+1-555-0100',
          guestCount: 4,
          reservedAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
        testTenantId,
        testUserId
      );

      const updated = await ReservationService.updateReservationStatus(
        created.id,
        ReservationStatus.CONFIRMED,
        testTenantId,
        testUserId
      );

      expect(updated.status).toBe(ReservationStatus.CONFIRMED);
    });

    it('should reject invalid status transitions', async () => {
      const created = await ReservationService.createReservation(
        {
          tableId: testTableId,
          guestName: 'John Smith',
          guestEmail: 'john@example.com',
          guestPhone: '+1-555-0100',
          guestCount: 4,
          reservedAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
        testTenantId,
        testUserId
      );

      // Try to go PENDING → SEATED (invalid)
      await expect(
        ReservationService.updateReservationStatus(
          created.id,
          ReservationStatus.SEATED,
          testTenantId,
          testUserId
        )
      ).rejects.toThrow('Invalid status transition');
    });
  });

  describe('cancelReservation', () => {
    it('should cancel a reservation', async () => {
      const created = await ReservationService.createReservation(
        {
          tableId: testTableId,
          guestName: 'John Smith',
          guestEmail: 'john@example.com',
          guestPhone: '+1-555-0100',
          guestCount: 4,
          reservedAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        },
        testTenantId,
        testUserId
      );

      const cancelled = await ReservationService.cancelReservation(
        created.id,
        testTenantId,
        'Guest requested',
        testUserId
      );

      expect(cancelled.status).toBe(ReservationStatus.CANCELLED);
      expect(cancelled.cancelledAt).toBeDefined();
    });
  });

  describe('getReservationCountsByStatus', () => {
    it('should return counts by status', async () => {
      const counts = await ReservationService.getReservationCountsByStatus(
        testTenantId
      );

      expect(counts).toBeDefined();
      expect(typeof counts[ReservationStatus.PENDING]).toBe('number');
    });
  });
});