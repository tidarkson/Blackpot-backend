import { PrismaClient, OrderStatus, CourseType } from '@prisma/client';
import logger from '../config/logger';

export class KitchenService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  /**
   * Kitchen tracks OrderItem preparation, not OrderCourse
   * OrderCourse is just grouping by meal type (APPETIZER, MAIN, DESSERT)
   * OrderItem is the actual item being prepared
   */

  private validItemTransitions: Record<string, string[]> = {
    PENDING: ['PREPARED'],
    PREPARED: ['SERVED'],
    SERVED: [],
  };

  /**
   * Get all items pending for a kitchen station
   */
  async getOrdersByStation(stationId: string, tenantId: string) {
    return this.prisma.orderItem.findMany({
      where: {
        orderCourse: {
          kitchenStationId: stationId,
          order: { tenantId },
        },
      },
      include: {
        menuItem: true,
        orderCourse: {
          include: {
            order: {
              include: {
                table: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get all pending items across all stations
   */
  async getPendingOrders(tenantId: string) {
    return this.prisma.orderItem.findMany({
      where: {
        preparedAt: null,
        orderCourse: {
          order: { tenantId },
        },
      },
      include: {
        menuItem: true,
        orderCourse: {
          include: {
            order: {
              include: { table: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Mark an order item as prepared
   */
  async completeItem(itemId: string, tenantId: string) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: {
        orderCourse: {
          include: { order: true },
        },
      },
    });

    if (!item || item.orderCourse.order.tenantId !== tenantId) {
      throw new Error('Item not found');
    }

    return this.prisma.orderItem.update({
      where: { id: itemId },
      data: { preparedAt: new Date() },
      include: { menuItem: true },
    });
  }

  /**
   * Get kitchen metrics for the last hour
   */
  async getKitchenMetrics(tenantId: string) {
    const lastHourItems = await this.prisma.orderItem.findMany({
      where: {
        preparedAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
        orderCourse: {
          order: { tenantId },
        },
      },
    });

    const avgPrepTime = lastHourItems.reduce((sum, item) => {
      if (!item.preparedAt) return sum;
      const prepTime = item.preparedAt.getTime() - item.createdAt.getTime();
      return sum + prepTime;
    }, 0) / Math.max(lastHourItems.length, 1);

    const pendingCount = await this.prisma.orderItem.count({
      where: {
        preparedAt: null,
        orderCourse: {
          order: { tenantId },
        },
      },
    });

    return {
      totalPreparedInLastHour: lastHourItems.length,
      averagePrepTime: Math.round(avgPrepTime / 1000), // seconds
      allPendingItems: pendingCount,
    };
  }

  /**
   * Fire (send) an order item to kitchen
   * In this system, items are created already, so "firing" just marks it in progress
   */
  async fireOrderItem(itemId: string, tenantId: string): Promise<any> {
    try {
      const item = await this.prisma.orderItem.findFirst({
        where: { id: itemId },
        include: {
          orderCourse: {
            include: { order: true },
          },
          menuItem: true,
        },
      });

      if (!item) {
        throw new Error('Order item not found');
      }

      if (item.orderCourse.order.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      if (item.preparedAt) {
        throw new Error(`Item already prepared at ${item.preparedAt}`);
      }

      const updated = await this.prisma.orderItem.update({
        where: { id: itemId },
        data: {
          preparedAt: new Date(),
        },
        include: {
          menuItem: true,
          orderCourse: {
            include: { order: true },
          },
        },
      });

      logger.info(
        `🔥 Item prepared: ${updated.menuItem.name} x${updated.quantity} (Order: ${updated.orderCourse.orderId})`
      );
      return updated;
    } catch (error: any) {
      logger.error('Error firing item:', error.message);
      throw error;
    }
  }

  /**
   * Mark item as served
   */
  async serveItem(itemId: string, tenantId: string): Promise<any> {
    try {
      const item = await this.prisma.orderItem.findFirst({
        where: { id: itemId },
        include: {
          orderCourse: {
            include: { order: true },
          },
          menuItem: true,
        },
      });

      if (!item) {
        throw new Error('Order item not found');
      }

      if (item.orderCourse.order.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      if (!item.preparedAt) {
        throw new Error('Item must be prepared before serving');
      }

      const updated = await this.prisma.orderItem.update({
        where: { id: itemId },
        data: {
          servedAt: new Date(),
        },
        include: {
          menuItem: true,
          orderCourse: {
            include: { order: true },
          },
        },
      });

      logger.info(
        `🍽️ Item served: ${updated.menuItem.name} x${updated.quantity} (Order: ${updated.orderCourse.orderId})`
      );

      return updated;
    } catch (error: any) {
      logger.error('Error serving item:', error.message);
      throw error;
    }
  }

  /**
   * Get kitchen display system - all items grouped by status
   */
  async getKitchenDisplaySystem(tenantId: string, kitchenStationId?: string): Promise<any> {
    try {
      const whereClause: any = {
        orderCourse: {
          order: { tenantId },
        },
      };

      if (kitchenStationId) {
        whereClause.orderCourse.kitchenStationId = kitchenStationId;
      }

      const allItems = await this.prisma.orderItem.findMany({
        where: whereClause,
        include: {
          menuItem: true,
          orderCourse: {
            include: {
              order: {
                include: {
                  table: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      // Group by status
      const grouped = {
        PENDING: allItems.filter((i) => !i.preparedAt),
        PREPARED: allItems.filter((i) => i.preparedAt && !i.servedAt),
        SERVED: allItems.filter((i) => i.servedAt),
      };

      logger.info(
        `📊 Kitchen display: ${grouped.PENDING.length} pending, ${grouped.PREPARED.length} prepared, ${grouped.SERVED.length} served`
      );

      return grouped;
    } catch (error: any) {
      logger.error('Error fetching kitchen display system:', error.message);
      throw error;
    }
  }

  /**
   * Calculate prep time for an item
   */
  async calculatePrepTime(itemId: string, tenantId: string): Promise<number> {
    try {
      const item = await this.prisma.orderItem.findFirst({
        where: { id: itemId },
        include: {
          orderCourse: {
            include: { order: true },
          },
          menuItem: true,
        },
      });

      if (!item) {
        throw new Error('Item not found');
      }

      if (item.orderCourse.order.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      if (!item.preparedAt) {
        // Still being prepared, calculate from now
        const prepTimeMs = Date.now() - item.createdAt.getTime();
        const prepTimeMins = Math.floor(prepTimeMs / 60000);
        return prepTimeMins;
      }

      // Already prepared, get final prep time
      const prepTimeMs = item.preparedAt.getTime() - item.createdAt.getTime();
      const prepTimeMins = Math.floor(prepTimeMs / 60000);

      logger.info(`⏱️ Prep time for ${item.menuItem.name}: ${prepTimeMins} minutes`);

      return prepTimeMins;
    } catch (error: any) {
      logger.error('Error calculating prep time:', error.message);
      throw error;
    }
  }

  /**
   * Get order ready status - based on all items in the order
   */
  async getOrderReadyStatus(orderId: string, tenantId: string): Promise<any> {
    try {
      const items = await this.prisma.orderItem.findMany({
        where: {
          orderCourse: {
            orderId,
            order: { tenantId },
          },
        },
        include: {
          menuItem: true,
        },
      });

      const totalItems = items.length;
      const preparedItems = items.filter((i) => i.preparedAt).length;
      const servedItems = items.filter((i) => i.servedAt).length;

      const status = {
        orderId,
        totalItems,
        preparedItems,
        servedItems,
        allPrepared: preparedItems === totalItems && totalItems > 0,
        allServed: servedItems === totalItems && totalItems > 0,
        percentagePrepared: totalItems > 0 ? (preparedItems / totalItems) * 100 : 0,
        percentageServed: totalItems > 0 ? (servedItems / totalItems) * 100 : 0,
      };

      logger.info(
        `📦 Order ${orderId} status: ${preparedItems}/${totalItems} prepared, ${servedItems}/${totalItems} served`
      );

      return status;
    } catch (error: any) {
      logger.error('Error getting order ready status:', error.message);
      throw error;
    }
  }

  /**
   * Get items by status
   */
  async getItemsByStatus(
    tenantId: string,
    status: string,
    stationId?: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      const whereClause: any = {
        orderCourse: {
          order: { tenantId },
        },
      };

      if (stationId) {
        whereClause.orderCourse.kitchenStationId = stationId;
      }

      if (status === 'PENDING') {
        whereClause.preparedAt = null;
      } else if (status === 'PREPARED') {
        whereClause.preparedAt = { not: null };
        whereClause.servedAt = null;
      } else if (status === 'SERVED') {
        whereClause.servedAt = { not: null };
      }

      return await this.prisma.orderItem.findMany({
        where: whereClause,
        include: {
          menuItem: true,
          orderCourse: {
            include: {
              order: {
                include: { table: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
    } catch (error: any) {
      logger.error('Error getting items by status:', error.message);
      throw error;
    }
  }
}
