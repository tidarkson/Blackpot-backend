import { PrismaClient, ReservationStatus, OrderStatus, TableStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';
import CustomerService from './CustomerService';

const prisma = new PrismaClient();

export class ReservationService {
  /**
   * CRUD Operations for Reservations
   * 
   * This service manages all reservation-related business logic including:
   * - Creating, retrieving, updating, and canceling reservations
   * - Filtering and querying reservations with multi-tenant isolation
   * - Status workflow management
   * - Future: Availability checking, conflict detection, customer linking
   */

  // ========================================
  // CREATE OPERATIONS
  // ========================================

  /**
   * Create a new reservation
   * 
   * @param data Reservation creation data
   * @param tenantId Tenant context from JWT
   * @returns Created reservation with full details
   * 
   * Future considerations:
   * - Will integrate availability checking before creation
   * - Will trigger confirmation email via EmailService
   * - Will check VIP status for priority booking
   * - Will calculate and store estimated end time
   */
  async createReservation(
    data: {
      tableId: string;
      guestName: string;
      guestEmail?: string;
      guestPhone?: string;
      guestCount: number;
      reservedAt: Date;
      notes?: string;
      // Future fields placeholders
      // depositRequired?: boolean;
      // depositAmount?: Decimal;
      // vipCustomerId?: string;
      // duration?: number;
      // occasion?: string;
    },
    tenantId: string,
    serverId: string
  ) {
    try {
      // Validate table exists and belongs to tenant
      const table = await prisma.table.findFirst({
        where: { id: data.tableId, tenantId },
      });

      if (!table) {
        throw new Error(`Table ${data.tableId} not found`);
      }

      // Create reservation with transaction to ensure consistency
      const reservation = await prisma.$transaction(async (tx) => {
        // PHASE 2: Auto-create or link customer
        let customerId: string | undefined = undefined;

        if (data.guestPhone) {
          try {
            // Check if customer exists with this phone
            let customer = await tx.customer.findUnique({
              where: {
                tenantId_phone: {
                  tenantId,
                  phone: data.guestPhone,
                },
              },
            });

            if (!customer) {
              // Create new customer if doesn't exist
              customer = await tx.customer.create({
                data: {
                  tenantId,
                  name: data.guestName,
                  phone: data.guestPhone,
                  email: data.guestEmail?.toLowerCase(),
                  vipStatus: false,
                  visitCount: 0,
                  lifetimeSpend: new Decimal(0),
                  averageCheck: new Decimal(0),
                },
              });

              logger.info(
                `👤 Auto-created customer ${customer.id} from reservation`
              );

              // Log customer creation
              await tx.activityLog.create({
                data: {
                  tenantId,
                  userId: serverId,
                  action: 'AUTO_CREATE',
                  entity: 'Customer',
                  entityId: customer.id,
                  metadata: {
                    source: 'Reservation',
                    guestName: data.guestName,
                    guestPhone: data.guestPhone,
                  },
                },
              });
            }

            customerId = customer.id;
          } catch (customerError) {
            logger.warn(
              `Failed to auto-create customer during reservation: ${customerError}`
            );
            // Continue without customer linking
          }
        }

        // Create reservation
        const newReservation = await tx.reservation.create({
          data: {
            tenantId,
            customerId,
            tableId: data.tableId,
            guestName: data.guestName,
            guestEmail: data.guestEmail,
            guestPhone: data.guestPhone,
            guestCount: data.guestCount,
            reservedAt: data.reservedAt,
            notes: data.notes,
            status: ReservationStatus.PENDING, // Starts as PENDING, must be CONFIRMED
          },
          include: {
            table: true,
            customer: true,
          },
        });

        // Log activity for audit trail
        await tx.activityLog.create({
          data: {
            tenantId,
            userId: serverId,
            action: 'CREATE',
            entity: 'Reservation',
            entityId: newReservation.id,
            metadata: {
              guestName: data.guestName,
              customerId,
              tableId: data.tableId,
              guestCount: data.guestCount,
              reservedAt: data.reservedAt.toISOString(),
            },
          },
        });

        return newReservation;
      });

      logger.info(
        `📅 Reservation created: ${reservation.id} for ${data.guestName} at ${data.reservedAt.toISOString()}`
      );

      return reservation;
    } catch (error) {
      logger.error('Error creating reservation:', error);
      throw error;
    }
  }

  // ========================================
  // READ OPERATIONS
  // ========================================

  /**
   * Get single reservation by ID
   * 
   * @param id Reservation ID
   * @param tenantId Tenant context for isolation
   * @returns Reservation with related data
   */
  async getReservationById(id: string, tenantId: string) {
    try {
      const reservation = await prisma.reservation.findFirst({
        where: { id, tenantId },
        include: {
          table: {
            select: {
              id: true,
              name: true,
              capacity: true,
              status: true,
              section: true,
            },
          },
          // Future: Add customer data when customer model exists
          // customer: true,
        },
      });

      if (!reservation) {
        throw new Error(`Reservation ${id} not found`);
      }

      return reservation;
    } catch (error) {
      logger.error('Error fetching reservation:', error);
      throw error;
    }
  }

  /**
   * Get all reservations with filtering and pagination
   * 
   * @param tenantId Tenant context for isolation
   * @param filters Optional filters (status, date, tableId, etc.)
   * @param pagination Page and pageSize
   * @returns Paginated list of reservations
   * 
   * Filters support:
   * - status: PENDING, CONFIRMED, SEATED, COMPLETED, CANCELLED, NO_SHOW
   * - date: Specific date (searches reservedAt)
   * - dateRange: { from, to } for date ranges
   * - tableId: Specific table
   * - guestName: Search by guest name (partial match)
   * - guestPhone: Search by phone
   * - guestEmail: Search by email
   */
  async getAllReservations(
    tenantId: string,
    filters?: {
      status?: ReservationStatus;
      date?: Date;
      dateRange?: { from: Date; to: Date };
      tableId?: string;
      guestName?: string;
      guestPhone?: string;
      guestEmail?: string;
      excludeCancelled?: boolean; // Default: true
    },
    pagination?: {
      page?: number;
      pageSize?: number;
    }
  ) {
    try {
      const pageSize = pagination?.pageSize || 25;
      const page = pagination?.page || 1;
      const skip = (page - 1) * pageSize;

      // Build filter conditions
      const where: any = { tenantId };

      // Status filter
      if (filters?.status) {
        where.status = filters.status;
      }

      // Exclude cancelled/no-show by default
      if (filters?.excludeCancelled !== false) {
        where.status = {
          notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
        };
      }

      // Date filters
      if (filters?.date) {
        const startOfDay = new Date(filters.date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(filters.date);
        endOfDay.setHours(23, 59, 59, 999);

        where.reservedAt = {
          gte: startOfDay,
          lte: endOfDay,
        };
      } else if (filters?.dateRange) {
        where.reservedAt = {
          gte: filters.dateRange.from,
          lte: filters.dateRange.to,
        };
      }

      // Table filter
      if (filters?.tableId) {
        where.tableId = filters.tableId;
      }

      // Guest name filter (partial match, case-insensitive)
      if (filters?.guestName) {
        where.guestName = {
          contains: filters.guestName,
          mode: 'insensitive',
        };
      }

      // Guest phone filter
      if (filters?.guestPhone) {
        where.guestPhone = filters.guestPhone;
      }

      // Guest email filter
      if (filters?.guestEmail) {
        where.guestEmail = filters.guestEmail;
      }

      // Execute count and data queries in parallel
      const [total, reservations] = await Promise.all([
        prisma.reservation.count({ where }),
        prisma.reservation.findMany({
          where,
          include: {
            table: {
              select: {
                id: true,
                name: true,
                capacity: true,
                status: true,
                section: { select: { name: true } },
              },
            },
          },
          orderBy: { reservedAt: 'desc' },
          skip,
          take: pageSize,
        }),
      ]);

      return {
        data: reservations,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNextPage: page < Math.ceil(total / pageSize),
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      logger.error('Error fetching reservations:', error);
      throw error;
    }
  }

  /**
   * Get reservations by date range (common use case: daily host stand view)
   * 
   * @param date Date to query
   * @param tenantId Tenant context
   * @returns List of reservations for that date
   */
  async getReservationsByDate(date: Date, tenantId: string) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const reservations = await prisma.reservation.findMany({
        where: {
          tenantId,
          reservedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
          status: {
            notIn: [ReservationStatus.CANCELLED],
          },
        },
        include: {
          table: {
            select: {
              id: true,
              name: true,
              capacity: true,
              status: true,
              section: { select: { name: true } },
            },
          },
        },
        orderBy: { reservedAt: 'asc' },
      });

      return reservations;
    } catch (error) {
      logger.error('Error fetching reservations by date:', error);
      throw error;
    }
  }

  // ========================================
  // UPDATE OPERATIONS
  // ========================================

  /**
   * Update reservation details
   * 
   * @param id Reservation ID
   * @param updates Partial reservation data to update
   * @param tenantId Tenant context for isolation
   * @param updatedBy User ID making the update
   * @returns Updated reservation
   * 
   * Note: Status updates should use updateReservationStatus() for workflow validation
   */
  async updateReservation(
    id: string,
    updates: {
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      guestCount?: number;
      reservedAt?: Date;
      notes?: string;
      tableId?: string;
      // Future fields
      // depositAmount?: Decimal;
      // occasion?: string;
    },
    tenantId: string,
    updatedBy: string
  ) {
    try {
      const reservation = await prisma.reservation.findFirst({
        where: { id, tenantId },
      });

      if (!reservation) {
        throw new Error(`Reservation ${id} not found`);
      }

      // If updating table, validate new table exists
      if (updates.tableId) {
        const newTable = await prisma.table.findFirst({
          where: { id: updates.tableId, tenantId },
        });

        if (!newTable) {
          throw new Error(`Table ${updates.tableId} not found`);
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const updatedRes = await tx.reservation.update({
          where: { id },
          data: updates,
          include: { table: true },
        });

        // Log update activity
        await tx.activityLog.create({
          data: {
            tenantId,
            userId: updatedBy,
            action: 'UPDATE',
            entity: 'Reservation',
            entityId: id,
            metadata: {
              changes: Object.keys(updates),
              updatedAt: new Date().toISOString(),
            },
          },
        });

        return updatedRes;
      });

      logger.info(`📝 Reservation ${id} updated`);

      return updated;
    } catch (error) {
      logger.error('Error updating reservation:', error);
      throw error;
    }
  }

  /**
   * Update reservation status with workflow validation
   * 
   * @param id Reservation ID
   * @param newStatus New status to transition to
   * @param tenantId Tenant context
   * @param updatedBy User ID making the change
   * @returns Updated reservation
   * 
   * Status workflow rules:
   * - PENDING → CONFIRMED (confirmation)
   * - CONFIRMED → SEATED (checked in)
   * - SEATED → COMPLETED (meal finished)
   * - Any → CANCELLED (before seated)
   * - CONFIRMED → NO_SHOW (missed reservation)
   * 
   * Future: Could add more complex state validation
   */
  async updateReservationStatus(
    id: string,
    newStatus: ReservationStatus,
    tenantId: string,
    updatedBy: string
  ) {
    try {
      const reservation = await prisma.reservation.findFirst({
        where: { id, tenantId },
      });

      if (!reservation) {
        throw new Error(`Reservation ${id} not found`);
      }

      // Validate status transitions
      this.validateStatusTransition(reservation.status, newStatus);

      const updated = await prisma.$transaction(async (tx) => {
        const updatedRes = await tx.reservation.update({
          where: { id },
          data: {
            status: newStatus,
            // Set cancelledAt when cancelling
            ...(newStatus === ReservationStatus.CANCELLED && {
              cancelledAt: new Date(),
            }),
          },
          include: { table: true },
        });

        // Log status change
        await tx.activityLog.create({
          data: {
            tenantId,
            userId: updatedBy,
            action: 'STATUS_UPDATE',
            entity: 'Reservation',
            entityId: id,
            metadata: {
              oldStatus: reservation.status,
              newStatus: newStatus,
              timestamp: new Date().toISOString(),
            },
          },
        });

        return updatedRes;
      });

      logger.info(`📊 Reservation ${id} status updated: ${reservation.status} → ${newStatus}`);

      return updated;
    } catch (error) {
      logger.error('Error updating reservation status:', error);
      throw error;
    }
  }

  // ========================================
  // DELETE OPERATIONS
  // ========================================

  /**
   * Cancel a reservation (soft delete)
   * 
   * @param id Reservation ID
   * @param tenantId Tenant context
   * @param reason Cancellation reason for audit
   * @param cancelledBy User ID performing cancellation
   * @returns Cancelled reservation
   * 
   * Uses soft delete (cancelledAt field) to preserve audit trail
   */
  async cancelReservation(
    id: string,
    tenantId: string,
    reason?: string,
    cancelledBy?: string
  ) {
    try {
      const reservation = await prisma.reservation.findFirst({
        where: { id, tenantId },
      });

      if (!reservation) {
        throw new Error(`Reservation ${id} not found`);
      }

      if (reservation.status === ReservationStatus.SEATED) {
        throw new Error('Cannot cancel a reservation that is already seated');
      }

      const cancelled = await prisma.$transaction(async (tx) => {
        // Update status to CANCELLED and set cancelledAt
        const cancelledRes = await tx.reservation.update({
          where: { id },
          data: {
            status: ReservationStatus.CANCELLED,
            cancelledAt: new Date(),
          },
          include: { table: true },
        });

        // Log cancellation
        await tx.activityLog.create({
          data: {
            tenantId,
            userId: cancelledBy,
            action: 'CANCEL',
            entity: 'Reservation',
            entityId: id,
            metadata: {
              reason: reason || 'Not specified',
              cancelledAt: new Date().toISOString(),
            },
          },
        });

        return cancelledRes;
      });

      logger.info(`❌ Reservation ${id} cancelled${reason ? `: ${reason}` : ''}`);

      return cancelled;
    } catch (error) {
      logger.error('Error cancelling reservation:', error);
      throw error;
    }
  }

  /**
   * Hard delete a reservation (only for system admin/cleanup)
   * Use with caution - destroys audit trail
   * 
   * @param id Reservation ID
   * @param tenantId Tenant context
   * @param deletedBy User ID performing deletion
   */
  async hardDeleteReservation(id: string, tenantId: string, deletedBy: string) {
    try {
      const reservation = await prisma.reservation.findFirst({
        where: { id, tenantId },
      });

      if (!reservation) {
        throw new Error(`Reservation ${id} not found`);
      }

      await prisma.$transaction(async (tx) => {
        // Hard delete
        await tx.reservation.delete({
          where: { id },
        });

        // Log hard delete
        await tx.activityLog.create({
          data: {
            tenantId,
            userId: deletedBy,
            action: 'HARD_DELETE',
            entity: 'Reservation',
            entityId: id,
            metadata: {
              reason: 'Hard delete - audit trail lost',
              timestamp: new Date().toISOString(),
            },
          },
        });
      });

      logger.warn(`🗑️ Reservation ${id} hard deleted by ${deletedBy}`);
    } catch (error) {
      logger.error('Error hard deleting reservation:', error);
      throw error;
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Validate status transitions according to business rules
   * 
   * Can be extended with more complex rules, permissions, etc.
   */
  private validateStatusTransition(
    currentStatus: ReservationStatus,
    newStatus: ReservationStatus
  ): void {
    // Define allowed transitions
    const allowedTransitions: Record<ReservationStatus, ReservationStatus[]> = {
      [ReservationStatus.PENDING]: [
        ReservationStatus.CONFIRMED,
        ReservationStatus.CANCELLED,
      ],
      [ReservationStatus.CONFIRMED]: [
        ReservationStatus.SEATED,
        ReservationStatus.CANCELLED,
        ReservationStatus.NO_SHOW,
      ],
      [ReservationStatus.SEATED]: [
        ReservationStatus.COMPLETED,
        ReservationStatus.CANCELLED,
      ],
      [ReservationStatus.COMPLETED]: [],
      [ReservationStatus.CANCELLED]: [],
      [ReservationStatus.NO_SHOW]: [],
    };

    if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${currentStatus} → ${newStatus}`
      );
    }
  }

  /**
   * Get reservation count by status (for dashboard/reporting)
   * 
   * Future: Move to ReportService for analytics
   */
  async getReservationCountsByStatus(tenantId: string) {
    try {
      const counts = await prisma.reservation.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      });

      return counts.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>
      );
    } catch (error) {
      logger.error('Error getting reservation counts:', error);
      throw error;
    }
  }

  /**
   * Check if reservation exists (utility for validation)
   */
  async reservationExists(id: string, tenantId: string): Promise<boolean> {
    try {
      const count = await prisma.reservation.count({
        where: { id, tenantId },
      });

      return count > 0;
    } catch (error) {
      logger.error('Error checking reservation existence:', error);
      throw error;
    }
  }

  /**
 * CUSTOMER OPERATIONS - Add to ReservationService class
 * 
 * These methods handle guest arrival and seating workflows
 * Future: When Customer model is created, enhance with customer history
 */

/**
 * Check in a reservation (mark guest as arrived)
 * 
 * Workflow: CONFIRMED → SEATED
 * Creates/updates associated Order
 * 
 * @param reservationId Reservation to check in
 * @param tenantId Tenant context
 * @param serverId Server checking in guest
 * @returns Updated reservation with order
 * 
 * Future:
 * - Auto no-show detection if not checked in after X minutes
 * - Special request handling
 * - VIP notifications
 */
async checkinReservation(
  reservationId: string,
  tenantId: string,
  serverId: string,
  notes?: string
) {
  try {
    const reservation = await prisma.reservation.findFirst({
      where: { id: reservationId, tenantId },
      include: { table: true },
    });

    if (!reservation) {
      throw new Error(`Reservation ${reservationId} not found`);
    }

    if (reservation.status !== ReservationStatus.CONFIRMED) {
      throw new Error(
        `Cannot check in reservation with status ${reservation.status}`
      );
    }

    const checkedIn = await prisma.$transaction(async (tx) => {
      // Update reservation status to SEATED
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.SEATED },
        include: { table: true },
      });

      // Check if order exists for this table
      let order = await tx.order.findFirst({
        where: {
          tableId: reservation.tableId,
          status: OrderStatus.OPEN,
        },
      });

      // If no order exists, create one
      if (!order) {
        order = await tx.order.create({
          data: {
            tenantId,
            tableId: reservation.tableId,
            serverId,
            guestCount: reservation.guestCount,
            status: OrderStatus.OPEN,
            subtotal: new Decimal(0),
            tax: new Decimal(0),
            total: new Decimal(0),
          },
        });
      }

      // Log activity
      await tx.activityLog.create({
        data: {
          tenantId,
          userId: serverId,
          action: 'CHECKIN',
          entity: 'Reservation',
          entityId: reservationId,
          metadata: {
            checkedInAt: new Date().toISOString(),
            orderId: order.id,
            notes: notes || null,
          },
        },
      });

      return { reservation: updated, order };
    });

    logger.info(
      `✅ Reservation ${reservationId} checked in, Order: ${checkedIn.order.id}`
    );

    return checkedIn;
  } catch (error) {
    logger.error('Error checking in reservation:', error);
    throw error;
  }
}

/**
 * Seat a reservation at a table (handle seating workflow)
 * 
 * Workflow: CONFIRMED → SEATED with table assignment
 * Transfers reservation to table and links Order
 * 
 * @param reservationId Reservation to seat
 * @param tableId Table to seat at
 * @param tenantId Tenant context
 * @param serverId Server seating guest
 * @returns Updated reservation with order and table
 * 
 * Future:
 * - Alternative table suggestions if preferred unavailable
 * - Seat history tracking
 * - Table turn time analytics
 */
async seatReservation(
  reservationId: string,
  tableId: string,
  tenantId: string,
  serverId: string,
  notes?: string
) {
  try {
    const reservation = await prisma.reservation.findFirst({
      where: { id: reservationId, tenantId },
    });

    if (!reservation) {
      throw new Error(`Reservation ${reservationId} not found`);
    }

    if (
      reservation.status !== ReservationStatus.CONFIRMED &&
      reservation.status !== ReservationStatus.PENDING
    ) {
      throw new Error(
        `Cannot seat reservation with status ${reservation.status}`
      );
    }

    // Verify new table exists and can accommodate
    const newTable = await prisma.table.findFirst({
      where: { id: tableId, tenantId },
    });

    if (!newTable) {
      throw new Error(`Table ${tableId} not found`);
    }

    if (reservation.guestCount > newTable.capacity) {
      throw new Error(
        `Guest count (${reservation.guestCount}) exceeds table capacity (${newTable.capacity})`
      );
    }

    const seated = await prisma.$transaction(async (tx) => {
      // Update reservation
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          tableId, // Change table if different
          status: ReservationStatus.SEATED,
        },
        include: { table: true },
      });

      // Update table status to OCCUPIED
      await tx.table.update({
        where: { id: tableId },
        data: { status: TableStatus.OCCUPIED },
      });

      // Create or update order
      let order = await tx.order.findFirst({
        where: {
          tenantId,
          tableId,
          status: OrderStatus.OPEN,
        },
      });

      if (!order) {
        order = await tx.order.create({
          data: {
            tenantId,
            tableId,
            serverId,
            guestCount: reservation.guestCount,
            status: OrderStatus.OPEN,
            subtotal: new Decimal(0),
            tax: new Decimal(0),
            total: new Decimal(0),
          },
        });
      }

      // Log activity
      await tx.activityLog.create({
        data: {
          tenantId,
          userId: serverId,
          action: 'SEAT',
          entity: 'Reservation',
          entityId: reservationId,
          metadata: {
            seatedAt: new Date().toISOString(),
            tableId,
            orderId: order.id,
            notes: notes || null,
          },
        },
      });

      return { reservation: updated, order, table: newTable };
    });

    logger.info(
      `🪑 Reservation ${reservationId} seated at table ${tableId}, Order: ${seated.order.id}`
    );

    return seated;
  } catch (error) {
    logger.error('Error seating reservation:', error);
    throw error;
  }
}

/**
 * Get reservations by customer (future: when Customer model exists)
 * 
 * Phase 4: Requires Customer model
 * For now: Search by phone or email
 * 
 * @param identifier Phone or email
 * @param tenantId Tenant context
 * @returns Array of reservations for customer
 * 
 * Future architecture:
 * - Create Customer model with one-to-many Reservations
 * - Track customer history, preferences, VIP status
 * - Link to loyalty program
 */
async getCustomerReservations(
  identifier: string, // phone or email
  tenantId: string,
  lookupField: 'phone' | 'email' = 'phone'
) {
  try {
    const where: any = { tenantId };

    if (lookupField === 'phone') {
      where.guestPhone = identifier;
    } else {
      where.guestEmail = identifier;
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include: {
        table: {
          select: {
            id: true,
            name: true,
            capacity: true,
            section: { select: { name: true } },
          },
        },
      },
      orderBy: { reservedAt: 'desc' },
    });

    return reservations;
  } catch (error) {
    logger.error('Error fetching customer reservations:', error);
    throw error;
  }
}
}

export default new ReservationService();