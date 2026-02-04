import { PrismaClient, TableStatus, OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class TableService {
  /**
   * Table status mapping:
   * AVAILABLE - table is free and ready for guests
   * OCCUPIED - table has active order
   * RESERVED - table is reserved for future guests
   * CLEANING - table is being cleaned
   * MAINTENANCE - table is unavailable for maintenance
   */

  async getTablesByLocation(locationId: string, tenantId: string) {
    return prisma.table.findMany({
      where: { locationId, tenantId, deletedAt: null },
      include: {
        orders: {
          where: { status: OrderStatus.OPEN },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        reservations: { where: { status: 'CONFIRMED' } },
        location: true,
      },
    });
  }

  async getTableById(tableId: string, tenantId: string) {
    return prisma.table.findFirst({
      where: { id: tableId, tenantId },
      include: {
        orders: {
          where: { status: OrderStatus.OPEN },
          take: 1,
        },
        reservations: { where: { status: 'CONFIRMED' } },
        location: true,
      },
    });
  }

  async updateTableStatus(tableId: string, tenantId: string, status: TableStatus) {
    return prisma.table.update({
      where: { id: tableId },
      data: { status },
    });
  }

  async getFloorPlan(locationId: string, tenantId: string) {
    return prisma.table.findMany({
      where: { locationId, tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        capacity: true,
        status: true,
        x: true,
        y: true,
        width: true,
        height: true,
        orders: {
          where: { status: OrderStatus.OPEN },
          select: { id: true, guestCount: true },
        },
        reservations: { select: { guestName: true, reservedAt: true } },
      },
    });
  }

  /**
   * Seat guests at a table
   */
  async seatGuests(
    tableId: string,
    guestCount: number,
    tenantId: string,
    serverId: string
  ): Promise<any> {
    try {
      // Get table
      const table = await prisma.table.findFirst({
        where: { id: tableId, tenantId },
      });

      if (!table) {
        throw new Error('Table not found');
      }

      // Validate capacity
      if (guestCount > table.capacity) {
        throw new Error(`Guest count (${guestCount}) exceeds table capacity (${table.capacity})`);
      }

      // Check if table is already occupied
      if (table.status === TableStatus.OCCUPIED) {
        throw new Error('Table is already occupied. Cannot seat new guests.');
      }

      // Use transaction to prevent race conditions
      const result = await prisma.$transaction(async (tx) => {
        // Update table status to OCCUPIED
        const updatedTable = await tx.table.update({
          where: { id: tableId },
          data: {
            status: TableStatus.OCCUPIED,
          },
        });

        // Create associated order
        const order = await tx.order.create({
          data: {
            tableId,
            guestCount,
            tenantId,
            serverId,
            status: OrderStatus.OPEN,
            subtotal: new Decimal(0),
            tax: new Decimal(0),
            total: new Decimal(0),
          },
        });

        logger.info(
          `🪑 Table ${table.name} occupied: ${guestCount} guests seated (Order: ${order.id})`
        );

        return {
          table: updatedTable,
          order,
        };
      });

      return result;
    } catch (error: any) {
      logger.error(`Error seating guests at table ${tableId}:`, error.message);
      throw error;
    }
  }

  /**
   * Release a table (guests leaving)
   */
  async releaseTable(tableId: string, tenantId: string): Promise<any> {
    try {
      const table = await prisma.table.findFirst({
        where: { id: tableId, tenantId },
      });

      if (!table) {
        throw new Error('Table not found');
      }

      if (table.status !== TableStatus.OCCUPIED) {
        throw new Error('Table is not occupied');
      }

      // Use transaction to update table and close order
      const result = await prisma.$transaction(async (tx) => {
        // Update table status to AVAILABLE
        const releasedTable = await tx.table.update({
          where: { id: tableId },
          data: {
            status: TableStatus.AVAILABLE,
          },
        });

        // Get associated open order and close it
        const order = await tx.order.findFirst({
          where: {
            tableId,
            tenantId,
            status: OrderStatus.OPEN,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        if (order) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CLOSED,
              closedAt: new Date(),
            },
          });
        }

        logger.info(`🔓 Table ${table.name} released (Order closed)`);

        return {
          table: releasedTable,
          order,
        };
      });

      return result;
    } catch (error: any) {
      logger.error(`Error releasing table ${tableId}:`, error.message);
      throw error;
    }
  }

  /**
   * Check available tables for seating
   */
  async checkTableAvailability(
    locationId: string,
    tenantId: string,
    guestCount?: number
  ): Promise<any[]> {
    try {
      const whereClause: any = {
        locationId,
        tenantId,
        status: TableStatus.AVAILABLE,
        deletedAt: null,
      };

      if (guestCount) {
        whereClause.capacity = {
          gte: guestCount,
        };
      }

      const availableTables = await prisma.table.findMany({
        where: whereClause,
        orderBy: {
          capacity: 'asc',
        },
      });

      logger.info(`🔍 Available tables: ${availableTables.length}`);

      return availableTables;
    } catch (error: any) {
      logger.error('Error checking table availability:', error.message);
      throw error;
    }
  }

  /**
   * Get status summary of all tables
   */
  async getTableStatus(locationId: string, tenantId: string): Promise<any> {
    try {
      const tables = await prisma.table.findMany({
        where: { locationId, tenantId, deletedAt: null },
        include: {
          orders: {
            where: {
              status: OrderStatus.OPEN,
            },
            take: 1,
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      const summary = {
        total: tables.length,
        occupied: tables.filter((t) => t.status === TableStatus.OCCUPIED).length,
        available: tables.filter((t) => t.status === TableStatus.AVAILABLE).length,
        reserved: tables.filter((t) => t.status === TableStatus.RESERVED).length,
        cleaning: tables.filter((t) => t.status === TableStatus.CLEANING).length,
        maintenance: tables.filter((t) => t.status === TableStatus.MAINTENANCE).length,
        tables: tables.map((table) => ({
          id: table.id,
          name: table.name,
          capacity: table.capacity,
          status: table.status,
          currentOrder: table.orders[0] || null,
        })),
      };

      logger.info(
        `📊 Table status: ${summary.occupied}/${summary.total} occupied, ${summary.available} available`
      );

      return summary;
    } catch (error: any) {
      logger.error('Error getting table status:', error.message);
      throw error;
    }
  }

  /**
   * Validate that a table is occupied (has active order)
   */
  async validateTableOccupancy(tableId: string, tenantId: string): Promise<boolean> {
    try {
      const table = await prisma.table.findFirst({
        where: { id: tableId, tenantId },
      });

      if (!table) {
        throw new Error('Table not found');
      }

      const isOccupied = table.status === TableStatus.OCCUPIED;
      logger.info(`🔒 Table ${table.name} status: ${table.status}`);

      return isOccupied;
    } catch (error: any) {
      logger.error('Error validating table occupancy:', error.message);
      throw error;
    }
  }
}