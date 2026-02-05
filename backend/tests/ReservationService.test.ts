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
    // Create tenant, location, tables, users
  });

  afterAll(async () => {
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
      const result = await ReservationService.getAllReservations(
        testTenantId,
        { status: ReservationStatus.CONFIRMED },
        { page: 1, pageSize: 25 }
      );

      expect(result.data.every((r) => r.status === ReservationStatus.CONFIRMED)).toBe(true);
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