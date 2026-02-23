import { PrismaClient } from '@prisma/client';
import cacheService, { CACHE_TTL } from './CacheService';
import cacheInvalidationService from './cacheInvalidation.service';
import CacheKeyGenerator, { CACHE_KEY_PATTERNS } from '../utils/cacheKeyGenerator';
import logger from '../config/logger';
import { OrderService } from './OrderService';
import { MenuService } from './MenuService';
import { InventoryService } from './InventoryService';
import { ReportService } from './ReportService';

/**
 * Dashboard Service
 * Aggregates data from multiple sources with intelligent caching
 * Handles dashboard statistics, recent orders, and today's summary
 */
export class DashboardService {
  private prisma: PrismaClient;
  private orderService: OrderService;
  private menuService: MenuService;
  private reportService: ReportService;

  constructor() {
    this.prisma = new PrismaClient();
    this.orderService = new OrderService(this.prisma);
    this.menuService = new MenuService();
    this.reportService = new ReportService();
  }

  /**
   * Get dashboard statistics
   * Cached: 1 minute TTL
   * Includes: Today's sales, order count, revenue, average order value
   *
   * @param tenantId Restaurant/tenant ID
   * @param forceRefresh Bypass cache and fetch fresh data
   */
  async getDashboardStats(tenantId: string, forceRefresh: boolean = false) {
    const cacheKey = CACHE_KEY_PATTERNS.DASHBOARD_STATS(tenantId);

    // Try cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(`✅ Dashboard stats cache HIT for tenant ${tenantId}`);
        return { ...cached, _cache: 'HIT' };
      }
    }

    try {
      logger.debug(`❌ Dashboard stats cache MISS for tenant ${tenantId}`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch in parallel for performance
      const [todaysSalesReport, orderStats, topItems, avgOrderValue] = await Promise.all([
        this.getTodaysSalesReport(tenantId),
        this.getOrderStats(tenantId),
        this.getTopItems(tenantId),
        this.getAverageOrderValue(tenantId),
      ]);

      const stats = {
        date: new Date().toISOString(),
        sales: todaysSalesReport,
        orders: orderStats,
        topItems,
        averageOrderValue: avgOrderValue,
        lastUpdated: new Date().toISOString(),
      };

      // Cache for 1 minute
      await cacheService.set(cacheKey, stats, CACHE_TTL.DASHBOARD);
      logger.debug(`💾 Cached dashboard stats for tenant ${tenantId}`);

      return { ...stats, _cache: 'MISS' };
    } catch (error) {
      logger.error(`Failed to fetch dashboard stats for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get recent orders
   * Cached: 1 minute TTL
   * Returns: Last 20 orders with status and totals
   *
   * @param tenantId Restaurant/tenant ID
   * @param limit Number of orders to return
   * @param forceRefresh Bypass cache
   */
  async getRecentOrders(tenantId: string, limit: number = 20, forceRefresh: boolean = false) {
    const cacheKey = CACHE_KEY_PATTERNS.DASHBOARD_RECENT_ORDERS(tenantId);

    if (!forceRefresh) {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(`✅ Recent orders cache HIT for tenant ${tenantId}`);
        return { data: cached, _cache: 'HIT' };
      }
    }

    try {
      logger.debug(`❌ Recent orders cache MISS for tenant ${tenantId}`);

      const orders = await this.prisma.order.findMany({
        where: { tenantId },
        select: {
          id: true,
          tableId: true,
          status: true,
          total: true,
          createdAt: true,
          serverId: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      const formatted = orders.map((order) => ({
        id: order.id,
        tableId: order.tableId,
        status: order.status,
        total: order.total.toNumber ? order.total.toNumber() : order.total,
        createdAt: order.createdAt,
        serverId: order.serverId,
      }));

      // Cache for 1 minute
      await cacheService.set(cacheKey, formatted, CACHE_TTL.DASHBOARD);

      return { data: formatted, _cache: 'MISS' };
    } catch (error) {
      logger.error(`Failed to fetch recent orders for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get today's summary
   * Cached: 1 minute TTL
   *
   * @param tenantId Restaurant/tenant ID
   * @param forceRefresh Bypass cache
   */
  async getTodaysSummary(tenantId: string, forceRefresh: boolean = false) {
    const cacheKey = CACHE_KEY_PATTERNS.DASHBOARD_TODAY_SUMMARY(tenantId);

    if (!forceRefresh) {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(`✅ Today's summary cache HIT for tenant ${tenantId}`);
        return { ...cached, _cache: 'HIT' };
      }
    }

    try {
      logger.debug(`❌ Today's summary cache MISS for tenant ${tenantId}`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Count open orders
      const openOrderCount = await this.prisma.order.count({
        where: {
          tenantId,
          status: { in: ['OPEN', 'IN_PROGRESS', 'READY'] },
        },
      });

      // Count completed orders today
      const completedTodayCount = await this.prisma.order.count({
        where: {
          tenantId,
          status: 'PAID',
          createdAt: { gte: today, lt: tomorrow },
        },
      });

      // Calculate today's revenue
      const todaysRevenue = await this.prisma.payment.aggregate({
        where: {
          order: {
            tenantId,
            createdAt: { gte: today, lt: tomorrow },
          },
          status: 'COMPLETED',
        },
        _sum: { amount: true },
      });

      const summary = {
        date: today.toISOString().split('T')[0],
        openOrders: openOrderCount,
        completedOrders: completedTodayCount,
        revenue: todaysRevenue._sum.amount?.toNumber ? todaysRevenue._sum.amount.toNumber() : (todaysRevenue._sum.amount || 0),
        timestamp: new Date().toISOString(),
      };

      // Cache for 1 minute
      await cacheService.set(cacheKey, summary, CACHE_TTL.DASHBOARD);

      return { ...summary, _cache: 'MISS' };
    } catch (error) {
      logger.error(`Failed to fetch today's summary for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Private helper: Get today's sales report
   */
  private async getTodaysSalesReport(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const payments = await this.prisma.payment.findMany({
      where: {
        order: {
          tenantId,
          createdAt: { gte: today, lt: tomorrow },
        },
        status: 'COMPLETED',
      },
      select: {
        amount: true,
        method: true,
      },
    });

    const total = payments.reduce((sum, p) => {
      const amount = typeof p.amount === 'number' ? p.amount : p.amount.toNumber?.() || 0;
      return sum + amount;
    }, 0);

    // Group by payment method
    const byMethod = payments.reduce(
      (acc, p) => {
        const method = p.method || 'unknown';
        const amount = typeof p.amount === 'number' ? p.amount : p.amount.toNumber?.() || 0;
        acc[method] = (acc[method] || 0) + amount;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      totalRevenue: total,
      transactionCount: payments.length,
      byPaymentMethod: byMethod,
    };
  }

  /**
   * Private helper: Get order statistics
   */
  private async getOrderStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        createdAt: { gte: today, lt: tomorrow },
      },
      select: { status: true, total: true },
    });

    const statuses = {
      OPEN: 0,
      IN_PROGRESS: 0,
      READY: 0,
      COMPLETED: 0,
      PAID: 0,
      CLOSED: 0,
      CANCELLED: 0,
    };

    let totalAmount = 0;

    orders.forEach((order) => {
      if (order.status in statuses) {
        statuses[order.status as keyof typeof statuses]++;
      }
      const amount = typeof order.total === 'number' ? order.total : order.total.toNumber?.() || 0;
      totalAmount += amount;
    });

    return {
      total: orders.length,
      byStatus: statuses,
      averageOrderValue: orders.length > 0 ? totalAmount / orders.length : 0,
    };
  }

  /**
   * Private helper: Get top items
   */
  private async getTopItems(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all order items for today
    const items = await this.prisma.orderItem.findMany({
      where: {
        tenantId,
        orderCourse: {
          order: {
            tenantId,
            createdAt: { gte: today, lt: tomorrow },
          },
        },
      },
      select: { menuItemId: true },
    });

    // Group by menuItemId in memory
    const grouped = items.reduce((acc, item) => {
      acc[item.menuItemId] = (acc[item.menuItemId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Sort by count and take top 5
    return Object.entries(grouped)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([menuItemId, count]) => ({
        menuItemId,
        count,
      }));
  }

  /**
   * Private helper: Get average order value
   */
  private async getAverageOrderValue(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await this.prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: today, lt: tomorrow },
        status: 'PAID',
      },
      _avg: { total: true },
    });

    const avg = result._avg.total;
    return (typeof avg === 'number' ? avg : avg?.toNumber?.() || 0);
  }

  /**
   * Invalidate all dashboard caches
   * Called when any relevant data changes
   */
  async invalidateDashboard(tenantId: string) {
    return cacheInvalidationService.invalidateDashboardCache(tenantId);
  }
}

export default new DashboardService();
