import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class ReportService {
  /**
   * Generate daily sales report
   *
   * Includes:
   * - Total revenue
   * - Revenue by payment method
   * - Items sold vs revenue
   * - Peak hours
   * - Server performance
   */
  async generateDailySalesReport(tenantId: string, date: Date): Promise<any> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          closedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          payments: true,
          tips: true,
          courses: {
            include: {
              items: true,
            },
          },
          server: true,
        },
      });

      // Payment method breakdown
      const paymentBreakdown: Record<string, any> = {};
      orders.forEach((order) => {
        order.payments.forEach((payment) => {
          if (!paymentBreakdown[payment.method]) {
            paymentBreakdown[payment.method] = {
              method: payment.method,
              count: 0,
              amount: new Decimal(0),
            };
          }
          paymentBreakdown[payment.method].count += 1;
          paymentBreakdown[payment.method].amount = paymentBreakdown[payment.method].amount.plus(
            payment.amount
          );
        });
      });

      // Items sold
      const itemsSold = orders.reduce((sum: number, order: any) => {
        return (
          sum + order.courses.reduce((courseSum: number, course: any) => courseSum + course.items.length, 0)
        );
      }, 0);

      // Server performance
      const serverPerformance: Record<string, any> = {};
      orders.forEach((order) => {
        if (!serverPerformance[order.serverId]) {
          serverPerformance[order.serverId] = {
            serverId: order.serverId,
            serverName: order.server?.name || 'Unknown',
            orders: 0,
            revenue: new Decimal(0),
            tips: new Decimal(0),
          };
        }
        serverPerformance[order.serverId].orders += 1;
        serverPerformance[order.serverId].revenue = serverPerformance[order.serverId].revenue.plus(
          order.total
        );
        order.tips.forEach((tip) => {
          serverPerformance[order.serverId].tips = serverPerformance[order.serverId].tips.plus(
            tip.amount
          );
        });
      });

      // Peak hours (by order count)
      const hourBuckets: Record<number, number> = {};
      orders.forEach((order) => {
        const hour = order.closedAt?.getHours() || 0;
        hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
      });

      const peakHour =
        Object.entries(hourBuckets).reduce(
          (maxEntry: [string, number], entry: [string, number]) =>
            entry[1] > maxEntry[1] ? entry : maxEntry,
          ['0', 0] as [string, number]
        )[0] || '0';

      const totalRevenue = orders.reduce((sum: Decimal, o: any) => sum.plus(o.total), new Decimal(0));

      const totalTips = orders.reduce(
        (sum: Decimal, o: any) => sum.plus(o.tips.reduce((s: Decimal, t: any) => s.plus(t.amount), new Decimal(0))),
        new Decimal(0)
      );

      return {
        reportDate: date,
        summary: {
          totalOrders: orders.length,
          totalRevenue,
          totalTips,
          grossRevenue: totalRevenue.plus(totalTips),
          itemsSold,
          averageCheck: orders.length > 0 ? totalRevenue.div(orders.length) : new Decimal(0),
        },
        paymentMethodBreakdown: Object.values(paymentBreakdown),
        serverPerformance: Object.values(serverPerformance),
        peakHour: peakHour || 0,
      };
    } catch (error: any) {
      logger.error('Error generating sales report:', error.message);
      throw error;
    }
  }

  /**
   * Generate kitchen performance report
   *
   * Includes:
   * - Average prep times by item
   * - Rush hour analysis
   * - Station efficiency
   * - Items prepared per hour
   */
  async generateKitchenPerformanceReport(tenantId: string, date: Date): Promise<any> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const items = await prisma.orderItem.findMany({
        where: {
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
          orderCourse: {
            order: { tenantId },
          },
        },
        include: {
          menuItem: true,
          orderCourse: {
            include: {
              order: true,
            },
          },
        },
      });

      // Average prep times by item
      const itemPrepTimes: Record<string, any> = {};
      items.forEach((item) => {
        if (!itemPrepTimes[item.menuItemId]) {
          itemPrepTimes[item.menuItemId] = {
            itemId: item.menuItemId,
            itemName: item.menuItem.name,
            count: 0,
            totalPrepTime: 0,
          };
        }

        itemPrepTimes[item.menuItemId].count += 1;

        if (item.preparedAt) {
          const prepTime = item.preparedAt.getTime() - item.createdAt.getTime();
          itemPrepTimes[item.menuItemId].totalPrepTime += prepTime;
        }
      });

      // Calculate averages
      Object.values(itemPrepTimes).forEach((item: any) => {
        item.averagePrepTime =
          item.count > 0 ? Math.round(item.totalPrepTime / item.count / 1000) : 0; // In seconds
      });

      // Rush hour analysis (most items prepared per hour)
      const hourBuckets: Record<number, number> = {};
      items.forEach((item) => {
        const hour = item.createdAt.getHours();
        hourBuckets[hour] = (hourBuckets[hour] || 0) + 1;
      });

      const rushHour =
        Object.entries(hourBuckets).reduce(
          (maxEntry: [string, number], entry: [string, number]) =>
            entry[1] > maxEntry[1] ? entry : maxEntry,
          ['0', 0] as [string, number]
        )[0] || '0';

      return {
        reportDate: date,
        summary: {
          totalItemsPrepared: items.length,
          totalItemsServed: items.filter((i) => i.servedAt).length,
          rushHour: rushHour || 0,
        },
        itemPrepTimes: Object.values(itemPrepTimes).sort((a: any, b: any) => b.count - a.count),
      };
    } catch (error: any) {
      logger.error('Error generating kitchen report:', error.message);
      throw error;
    }
  }

  /**
   * Generate inventory report
   */
  async generateInventoryReport(tenantId: string): Promise<any> {
    try {
      const inventoryItems = await prisma.inventoryItem.findMany({
        where: {
          tenantId,
        },
        include: {
          movements: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      const lowStockItems = inventoryItems.filter((item) => item.currentStock.lte(item.minStock));

      return {
        reportDate: new Date(),
        summary: {
          totalItems: inventoryItems.length,
          lowStockItems: lowStockItems.length,
        },
        items: inventoryItems.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          currentStock: item.currentStock,
          minStock: item.minStock,
          unit: item.unit,
          status: item.currentStock.lte(item.minStock) ? 'LOW' : 'ADEQUATE',
        })),
        lowStockAlerts: lowStockItems.map((item) => ({
          itemId: item.id,
          itemName: item.name,
          currentStock: item.currentStock,
          minStock: item.minStock,
          deficit: item.minStock.minus(item.currentStock),
        })),
      };
    } catch (error: any) {
      logger.error('Error generating inventory report:', error.message);
      throw error;
    }
  }

  /**
   * Generate staff performance report
   */
  async generateStaffPerformanceReport(tenantId: string, date: Date): Promise<any> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          closedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          payments: true,
          tips: true,
          server: true,
        },
      });

      const staffMetrics: Record<string, any> = {};
      orders.forEach((order) => {
        if (!staffMetrics[order.serverId]) {
          staffMetrics[order.serverId] = {
            serverId: order.serverId,
            serverName: order.server?.name || 'Unknown',
            ordersServed: 0,
            totalRevenue: new Decimal(0),
            totalTips: new Decimal(0),
            averageCheck: new Decimal(0),
            tipPercentage: new Decimal(0),
          };
        }

        staffMetrics[order.serverId].ordersServed += 1;
        staffMetrics[order.serverId].totalRevenue = staffMetrics[order.serverId].totalRevenue.plus(
          order.total
        );

        order.tips.forEach((tip) => {
          staffMetrics[order.serverId].totalTips = staffMetrics[order.serverId].totalTips.plus(
            tip.amount
          );
        });
      });

      // Calculate derived metrics
      Object.values(staffMetrics).forEach((staff: any) => {
        staff.averageCheck =
          staff.ordersServed > 0 ? staff.totalRevenue.div(staff.ordersServed) : new Decimal(0);

        staff.tipPercentage = staff.totalRevenue.gt(new Decimal(0))
          ? staff.totalTips.div(staff.totalRevenue).mul(100)
          : new Decimal(0);
      });

      return {
        reportDate: date,
        summary: {
          totalServers: Object.keys(staffMetrics).length,
          totalOrders: orders.length,
          totalRevenue: orders.reduce((sum: Decimal, o: any) => sum.plus(o.total), new Decimal(0)),
        },
        staffPerformance: Object.values(staffMetrics).sort(
          (a: any, b: any) => b.totalRevenue - a.totalRevenue
        ),
      };
    } catch (error: any) {
      logger.error('Error generating staff report:', error.message);
      throw error;
    }
  }

  /**
   * Generate financial report
   */
  async generateFinancialReport(tenantId: string, date: Date): Promise<any> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          closedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          payments: true,
          tips: true,
        },
      });

      const totalRevenue = orders.reduce((sum: Decimal, o: any) => sum.plus(o.total), new Decimal(0));

      const totalTax = orders.reduce((sum: Decimal, o: any) => sum.plus(o.tax), new Decimal(0));

      const totalTips = orders.reduce(
        (sum: Decimal, o: any) => sum.plus(o.tips.reduce((s: Decimal, t: any) => s.plus(t.amount), new Decimal(0))),
        new Decimal(0)
      );

      // Payment method breakdown
      const paymentMethods: Record<string, Decimal> = {};
      orders.forEach((order) => {
        order.payments.forEach((payment) => {
          if (!paymentMethods[payment.method]) {
            paymentMethods[payment.method] = new Decimal(0);
          }
          paymentMethods[payment.method] = paymentMethods[payment.method].plus(payment.amount);
        });
      });

      return {
        reportDate: date,
        summary: {
          totalRevenue,
          totalTax,
          totalTips,
          grossRevenue: totalRevenue.plus(totalTips),
          netRevenue: totalRevenue.minus(totalTax),
          ordersProcessed: orders.length,
          averageOrderValue: orders.length > 0 ? totalRevenue.div(orders.length) : new Decimal(0),
        },
        paymentMethodBreakdown: Object.entries(paymentMethods).map(([method, amount]) => ({
          method,
          amount,
        })),
      };
    } catch (error: any) {
      logger.error('Error generating financial report:', error.message);
      throw error;
    }
  }
}
