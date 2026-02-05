import { PrismaClient, TableStatus, OrderStatus, ReservationStatus } from '@prisma/client';
import logger from '../config/logger';

const prisma = new PrismaClient();

/**
 * Availability Service
 *
 * Handles complex logic for:
 * - Checking table availability for specific date/time/party size
 * - Detecting overlapping reservations
 * - Calculating turnover time
 * - Finding available time slots
 * - Preventing double-bookings
 *
 * Business Rules:
 * - Default duration: 90 minutes (configurable)
 * - Turnover time: 30 minutes buffer (configurable)
 * - Party size max: 20 guests
 * - Cannot book table at capacity
 * - Must check existing reservations and orders
 *
 * Future enhancements:
 * - Table preference validation
 * - VIP priority booking
 * - Seasonal availability
 * - Special event blackouts
 */
export class AvailabilityService {
  // Default business rules (could move to config)
  private readonly DEFAULT_DURATION = 90; // minutes
  private readonly TURNOVER_TIME = 30; // minutes
  private readonly BUSINESS_HOURS_START = 11; // 11 AM
  private readonly BUSINESS_HOURS_END = 23; // 11 PM

  /**
   * Check if a table is available for a specific date, time, and party size
   *
   * @param tableId Table to check
   * @param date Date to check
   * @param time Time to check (HH:MM format)
   * @param partySize Number of guests
   * @param tenantId Tenant context
   * @param duration Dining duration in minutes (default: 90)
   * @returns Boolean indicating availability
   */
  async isTableAvailable(
    tableId: string,
    date: Date,
    time: string,
    partySize: number,
    tenantId: string,
    duration: number = this.DEFAULT_DURATION
  ): Promise<boolean> {
    try {
      // Get table details
      const table = await prisma.table.findFirst({
        where: { id: tableId, tenantId },
      });

      if (!table) {
        throw new Error(`Table ${tableId} not found`);
      }

      // Check table capacity
      if (partySize > table.capacity) {
        return false;
      }

      // Check table status
      if (table.status === TableStatus.MAINTENANCE || table.status === TableStatus.CLEANING) {
        return false;
      }

      // Parse time
      const [hours, minutes] = time.split(':').map(Number);
      if (hours < this.BUSINESS_HOURS_START || hours >= this.BUSINESS_HOURS_END) {
        return false; // Outside business hours
      }

      // Build reservation time window
      const reservationStart = new Date(date);
      reservationStart.setHours(hours, minutes, 0, 0);

      const reservationEnd = new Date(reservationStart);
      reservationEnd.setMinutes(reservationEnd.getMinutes() + duration);

      // Check for overlapping reservations
      const overlappingReservations = await prisma.reservation.findMany({
        where: {
          tenantId,
          tableId,
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED],
          },
          reservedAt: {
            gte: new Date(reservationStart.getTime() - this.TURNOVER_TIME * 60000),
            lte: new Date(reservationEnd.getTime() + this.TURNOVER_TIME * 60000),
          },
        },
      });

      // If overlapping reservations exist, table is not available
      if (overlappingReservations.length > 0) {
        return false;
      }

      // Check for ongoing orders on table
      const activeOrder = await prisma.order.findFirst({
        where: {
          tenantId,
          tableId,
          status: { in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS] },
        },
      });

      if (activeOrder) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking table availability:', error);
      throw error;
    }
  }

  /**
   * Find all available time slots for a specific date and party size
   *
   * @param locationId Location to search
   * @param date Date to check
   * @param partySize Number of guests
   * @param tenantId Tenant context
   * @param options Additional options
   * @returns Array of available slots with table details
   *
   * Future: Could add time slot interval configuration
   */
  async findAvailableSlots(
    locationId: string,
    date: Date,
    partySize: number,
    tenantId: string,
    options?: {
      duration?: number;
      interval?: number; // minutes between time slots
      maxSlots?: number; // limit results
    }
  ) {
    try {
      const duration = options?.duration || this.DEFAULT_DURATION;
      const interval = options?.interval || 15; // Default: 15 min intervals
      const maxSlots = options?.maxSlots || 20;

      const availableSlots: any[] = [];

      // Get all suitable tables for party size
      const suitableTables = await prisma.table.findMany({
        where: {
          tenantId,
          locationId,
          capacity: { gte: partySize },
          deletedAt: null,
          status: {
            notIn: [TableStatus.MAINTENANCE],
          },
        },
        include: {
          section: true,
        },
      });

      if (suitableTables.length === 0) {
        return [];
      }

      // Iterate through business hours in intervals
      for (
        let hour = this.BUSINESS_HOURS_START;
        hour < this.BUSINESS_HOURS_END && availableSlots.length < maxSlots;
        hour++
      ) {
        for (let minute = 0; minute < 60 && availableSlots.length < maxSlots; minute += interval) {
          const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

          // Check each table
          for (const table of suitableTables) {
            if (availableSlots.length >= maxSlots) break;

            const isAvailable = await this.isTableAvailable(
              table.id,
              date,
              time,
              partySize,
              tenantId,
              duration
            );

            if (isAvailable) {
              const slotStart = new Date(date);
              slotStart.setHours(hour, minute, 0, 0);

              const slotEnd = new Date(slotStart);
              slotEnd.setMinutes(slotEnd.getMinutes() + duration);

              availableSlots.push({
                tableId: table.id,
                tableName: table.name,
                tableCapacity: table.capacity,
                section: table.section?.name,
                time: time,
                slotStart: slotStart.toISOString(),
                slotEnd: slotEnd.toISOString(),
              });
            }
          }
        }
      }

      return availableSlots;
    } catch (error) {
      logger.error('Error finding available slots:', error);
      throw error;
    }
  }

  /**
   * Get available tables for a date (simple list, not time-specific)
   *
   * @param locationId Location to search
   * @param date Date to check
   * @param partySize Number of guests
   * @param tenantId Tenant context
   * @returns List of tables with capacity >= partySize
   */
  async getAvailableTablesForDate(
    locationId: string,
    date: Date,
    partySize: number,
    tenantId: string
  ) {
    try {
      const tables = await prisma.table.findMany({
        where: {
          tenantId,
          locationId,
          capacity: { gte: partySize },
          deletedAt: null,
          status: {
            notIn: [TableStatus.MAINTENANCE],
          },
        },
        include: {
          _count: {
            select: {
              reservations: {
                where: {
                  reservedAt: {
                    gte: date,
                    lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
                  },
                  status: {
                    in: [ReservationStatus.CONFIRMED, ReservationStatus.SEATED],
                  },
                },
              },
            },
          },
          section: true,
        },
        orderBy: { capacity: 'asc' }, // Prefer smaller tables that fit
      });

      return tables.map((table) => ({
        id: table.id,
        name: table.name,
        capacity: table.capacity,
        status: table.status,
        section: table.section?.name,
        reservationCountToday: table._count.reservations,
      }));
    } catch (error) {
      logger.error('Error getting available tables:', error);
      throw error;
    }
  }

  /**
   * Check capacity constraint - restaurant max reservations per hour
   *
   * @param date Date to check
   * @param hour Hour to check
   * @param tenantId Tenant context
   * @param maxReservations Max allowed (configurable per restaurant)
   * @returns Boolean indicating if capacity allows booking
   *
   * Future: Make max reservations configurable in FinancialSetting or RestaurantConfig
   */
  async canAccommodateAdditionalGuests(
    date: Date,
    hour: number,
    partySize: number,
    tenantId: string,
    maxReservations: number = 100 // Placeholder, should be configurable
  ): Promise<boolean> {
    try {
      const hourStart = new Date(date);
      hourStart.setHours(hour, 0, 0, 0);

      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hour + 1, 0, 0, 0);

      // Get total guests booked in that hour
      const hourlyBookings = await prisma.reservation.aggregate({
        where: {
          tenantId,
          reservedAt: {
            gte: hourStart,
            lt: hourEnd,
          },
          status: {
            in: [ReservationStatus.CONFIRMED, ReservationStatus.SEATED],
          },
        },
        _sum: {
          guestCount: true,
        },
      });

      const totalGuests = (hourlyBookings._sum.guestCount || 0) + partySize;

      return totalGuests <= maxReservations;
    } catch (error) {
      logger.error('Error checking capacity:', error);
      throw error;
    }
  }

  /**
   * Calculate estimated end time for a reservation
   *
   * @param startTime Reservation start time
   * @param duration Duration in minutes
   * @returns Estimated end time
   */
  calculateEstimatedEndTime(startTime: Date, duration: number = this.DEFAULT_DURATION): Date {
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + duration);
    return endTime;
  }

  /**
   * Check if a time slot overlaps with an existing reservation/order
   *
   * @param tableId Table to check
   * @param slotStart Start time
   * @param slotEnd End time
   * @param tenantId Tenant context
   * @param excludeReservationId Reservation to exclude (for updates)
   * @returns Boolean indicating overlap
   */
  async hasTimeSlotConflict(
    tableId: string,
    slotStart: Date,
    slotEnd: Date,
    tenantId: string,
    excludeReservationId?: string
  ): Promise<boolean> {
    try {
      // Check for overlapping reservations
      const overlappingRes = await prisma.reservation.findFirst({
        where: {
          tenantId,
          tableId,
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED],
          },
          ...(excludeReservationId && { id: { not: excludeReservationId } }),
          reservedAt: {
            gte: new Date(slotStart.getTime() - this.TURNOVER_TIME * 60000),
            lt: new Date(slotEnd.getTime() + this.TURNOVER_TIME * 60000),
          },
        },
      });

      if (overlappingRes) {
        return true;
      }

      // Check for active orders
      const activeOrder = await prisma.order.findFirst({
        where: {
          tenantId,
          tableId,
          status: { in: [OrderStatus.OPEN, OrderStatus.IN_PROGRESS] },
        },
      });

      return !!activeOrder;
    } catch (error) {
      logger.error('Error checking time slot conflict:', error);
      throw error;
    }
  }
}

export default new AvailabilityService();
