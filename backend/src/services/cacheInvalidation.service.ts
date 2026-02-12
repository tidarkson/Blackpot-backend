import cacheService, { CACHE_KEYS } from './CacheService';
import CacheKeyGenerator, { CACHE_KEY_PATTERNS } from '../utils/cacheKeyGenerator';
import logger from '../config/logger';

/**
 * Cache Invalidation Service
 * Handles intelligent cache invalidation with multi-tenant support
 * Manages cascading invalidation for related data
 * Prevents data leakage between tenants
 */
class CacheInvalidationService {
  /**
   * Manual invalidation tracking
   * Stores invalidation patterns by entity type for monitoring
   */
  private invalidationLog: Map<string, { count: number; timestamp: number }> = new Map();

  /**
   * ===== ENTITY-SPECIFIC INVALIDATION =====
   */

  /**
   * Invalidate menu-related caches
   * Called when menus are created/updated/deleted
   * @param tenantId Restaurant/tenant ID
   * @param menuId Optional specific menu ID
   */
  async invalidateMenuCache(tenantId: string, menuId?: string): Promise<number> {
    try {
      const patterns = [];

      if (menuId) {
        // Invalidate specific menu
        patterns.push(CacheKeyGenerator.generateItemKey('menus', tenantId, menuId));
        patterns.push(
          CacheKeyGenerator.generateItemInvalidationPattern('menu_items', tenantId) + menuId
        );
        patterns.push(
          CacheKeyGenerator.generateItemInvalidationPattern('menu_categories', tenantId) + menuId
        );
      } else {
        // Invalidate all menus for tenant
        patterns.push(CACHE_KEY_PATTERNS.INVALIDATE_MENUS(tenantId));
        patterns.push(CACHE_KEY_PATTERNS.INVALIDATE_MENU_ITEMS(tenantId));
      }

      // Also invalidate dashboard (menu may be featured on dashboard)
      patterns.push(CACHE_KEY_PATTERNS.DASHBOARD_STATS(tenantId));

      let totalInvalidated = 0;
      for (const pattern of patterns) {
        const count = await cacheService.invalidatePattern(pattern);
        totalInvalidated += count;
      }

      this.logInvalidation('menu', totalInvalidated);
      logger.info(`🗑️  Invalidated menu cache for tenant ${tenantId}`, {
        menuId,
        patternsCount: patterns.length,
        keysInvalidated: totalInvalidated,
      });

      return totalInvalidated;
    } catch (error) {
      logger.error(`Failed to invalidate menu cache for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate menu item caches
   * @param tenantId Restaurant/tenant ID
   * @param menuItemId Optional specific menu item ID
   * @param menuId Optional menu containing this item
   */
  async invalidateMenuItemCache(tenantId: string, menuItemId?: string, menuId?: string): Promise<number> {
    try {
      const patterns = [];

      if (menuItemId) {
        patterns.push(CacheKeyGenerator.generateItemKey('menu_items', tenantId, menuItemId));
      }

      if (menuId) {
        patterns.push(CacheKeyGenerator.generateItemKey('menus', tenantId, menuId));
        patterns.push(CacheKeyGenerator.generateItemKey('menu_items', tenantId, menuId));
      }

      // Invalidate menu list (item availability may affect filtering)
      patterns.push(CACHE_KEY_PATTERNS.INVALIDATE_MENU_ITEMS(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.INVALIDATE_MENUS(tenantId));

      // Invalidate dashboard and orders if item status changed
      patterns.push(CACHE_KEY_PATTERNS.DASHBOARD_STATS(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.INVALIDATE_ORDERS(tenantId));

      let totalInvalidated = 0;
      for (const pattern of patterns) {
        const count = await cacheService.invalidatePattern(pattern);
        totalInvalidated += count;
      }

      this.logInvalidation('menu_item', totalInvalidated);
      logger.info(`🗑️  Invalidated menu item cache for tenant ${tenantId}`, {
        menuItemId,
        menuId,
        keysInvalidated: totalInvalidated,
      });

      return totalInvalidated;
    } catch (error) {
      logger.error(`Failed to invalidate menu item cache for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate inventory caches
   * Called when inventory levels change
   * @param tenantId Restaurant/tenant ID
   * @param itemId Optional specific inventory item ID
   */
  async invalidateInventoryCache(tenantId: string, itemId?: string): Promise<number> {
    try {
      const patterns = [];

      if (itemId) {
        patterns.push(CacheKeyGenerator.generateItemKey('inventory_items', tenantId, itemId));
      }

      // Always invalidate list and stock level caches
      patterns.push(CACHE_KEY_PATTERNS.INVALIDATE_INVENTORY(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.INVENTORY_LOW_STOCK(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.INVENTORY_STOCK_LEVELS(tenantId));

      // Invalidate dashboard (inventory may be featured)
      patterns.push(CACHE_KEY_PATTERNS.DASHBOARD_STATS(tenantId));

      // Invalidate reports that use inventory data
      patterns.push(CACHE_KEY_PATTERNS.REPORT_INVENTORY(tenantId));

      let totalInvalidated = 0;
      for (const pattern of patterns) {
        const count = await cacheService.invalidatePattern(pattern);
        totalInvalidated += count;
      }

      this.logInvalidation('inventory', totalInvalidated);
      logger.info(`🗑️  Invalidated inventory cache for tenant ${tenantId}`, {
        itemId,
        keysInvalidated: totalInvalidated,
      });

      return totalInvalidated;
    } catch (error) {
      logger.error(`Failed to invalidate inventory cache for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate order caches
   * Called when orders are created/updated/deleted
   * @param tenantId Restaurant/tenant ID
   * @param orderId Optional specific order ID
   */
  async invalidateOrderCache(tenantId: string, orderId?: string): Promise<number> {
    try {
      const patterns = [];

      if (orderId) {
        patterns.push(CacheKeyGenerator.generateItemKey('orders', tenantId, orderId));
      }

      // Always invalidate order lists (status changes affect list)
      patterns.push(CACHE_KEY_PATTERNS.INVALIDATE_ORDERS(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.ORDERS_LIST(tenantId));

      // Invalidate dashboard (recent orders cache)
      patterns.push(CACHE_KEY_PATTERNS.DASHBOARD_RECENT_ORDERS(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.DASHBOARD_STATS(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.DASHBOARD_TODAY_SUMMARY(tenantId));

      // Invalidate reports (sales reports use order data)
      patterns.push(CACHE_KEY_PATTERNS.REPORT_SALES(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.REPORT_FINANCIAL(tenantId));

      let totalInvalidated = 0;
      for (const pattern of patterns) {
        const count = await cacheService.invalidatePattern(pattern);
        totalInvalidated += count;
      }

      this.logInvalidation('order', totalInvalidated);
      logger.info(`🗑️  Invalidated order cache for tenant ${tenantId}`, {
        orderId,
        keysInvalidated: totalInvalidated,
      });

      return totalInvalidated;
    } catch (error) {
      logger.error(`Failed to invalidate order cache for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate dashboard caches
   * @param tenantId Restaurant/tenant ID
   * @param type Optional cache type (e.g., 'stats', 'recent-orders')
   */
  async invalidateDashboardCache(tenantId: string, type?: string): Promise<number> {
    try {
      const patterns = [];

      if (type) {
        patterns.push(CacheKeyGenerator.generateDashboardKey(type, tenantId));
      } else {
        // Invalidate all dashboard caches
        patterns.push(CACHE_KEY_PATTERNS.DASHBOARD_STATS(tenantId));
        patterns.push(CACHE_KEY_PATTERNS.DASHBOARD_RECENT_ORDERS(tenantId));
        patterns.push(CACHE_KEY_PATTERNS.DASHBOARD_TODAY_SUMMARY(tenantId));
        patterns.push(CACHE_KEY_PATTERNS.INVALIDATE_DASHBOARD(tenantId));
      }

      let totalInvalidated = 0;
      for (const pattern of patterns) {
        const count = await cacheService.invalidatePattern(pattern);
        totalInvalidated += count;
      }

      this.logInvalidation('dashboard', totalInvalidated);
      logger.info(`🗑️  Invalidated dashboard cache for tenant ${tenantId}`, { type });

      return totalInvalidated;
    } catch (error) {
      logger.error(`Failed to invalidate dashboard cache for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate payment/transaction related caches
   * @param tenantId Restaurant/tenant ID
   */
  async invalidatePaymentCache(tenantId: string): Promise<number> {
    try {
      const patterns = [];

      // Invalidate orders (payment changes order status)
      patterns.push(CACHE_KEY_PATTERNS.INVALIDATE_ORDERS(tenantId));

      // Invalidate dashboard (revenue stats affected)
      patterns.push(CACHE_KEY_PATTERNS.DASHBOARD_STATS(tenantId));

      // Invalidate reports
      patterns.push(CACHE_KEY_PATTERNS.REPORT_SALES(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.REPORT_FINANCIAL(tenantId));

      let totalInvalidated = 0;
      for (const pattern of patterns) {
        const count = await cacheService.invalidatePattern(pattern);
        totalInvalidated += count;
      }

      this.logInvalidation('payment', totalInvalidated);
      return totalInvalidated;
    } catch (error) {
      logger.error(`Failed to invalidate payment cache for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * ===== BULK OPERATIONS =====
   */

  /**
   * Invalidate ALL caches for a restaurant
   * Use with caution - impacts performance
   * @param tenantId Restaurant/tenant ID
   */
  async invalidateAllForTenant(tenantId: string): Promise<number> {
    try {
      const pattern = CacheKeyGenerator.generateTenantInvalidationPattern(tenantId);
      const count = await cacheService.invalidatePattern(pattern);

      this.logInvalidation('tenant_all', count);
      logger.warn(`🗑️  ⚠️  Invalidated ALL cache for tenant ${tenantId}`, { keysInvalidated: count });

      return count;
    } catch (error) {
      logger.error(`Failed to invalidate all cache for tenant ${tenantId}:`, error);
      return 0;
    }
  }

  /**
   * Warm cache after invalidation
   * Preload frequently accessed data to reduce initial cache misses
   * @param tenantId Restaurant/tenant ID
   * @param strategies Warming strategies to apply
   */
  async warmCacheAfterInvalidation(
    tenantId: string,
    warmingFn: () => Promise<Record<string, any>>
  ): Promise<boolean> {
    try {
      logger.info(`🔥 Starting cache warming for tenant ${tenantId}`);
      const data = await warmingFn();

      const count = await cacheService.warmCache(data);
      logger.info(`🔥 Cache warming completed for tenant ${tenantId}`, { entriesWarmed: count });

      return true;
    } catch (error) {
      logger.error(`Failed to warm cache for tenant ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * ===== TIME-BASED INVALIDATION =====
   */

  /**
   * Invalidate yesterday's report caches
   * Useful for report caching that expires at midnight
   * @param tenantId Restaurant/tenant ID
   */
  async invalidateOldReportCaches(tenantId: string): Promise<number> {
    try {
      const patterns = [];

      // Report caches are date-based, so only delete by tenant pattern
      patterns.push(CACHE_KEY_PATTERNS.REPORT_SALES(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.REPORT_FINANCIAL(tenantId));
      patterns.push(CACHE_KEY_PATTERNS.REPORT_INVENTORY(tenantId));

      let totalInvalidated = 0;
      for (const pattern of patterns) {
        const count = await cacheService.invalidatePattern(pattern);
        totalInvalidated += count;
      }

      logger.info(`🗑️  Invalidated old report caches for tenant ${tenantId}`, { keysInvalidated: totalInvalidated });
      return totalInvalidated;
    } catch (error) {
      logger.error(`Failed to invalidate old report caches:`, error);
      return 0;
    }
  }

  /**
   * ===== CASCADING INVALIDATION =====
   */

  /**
   * Invalidate related caches when an entity is updated
   * Handles complex relationships (e.g., menu item update affects menus, inventory, orders)
   * @param entityType Type of entity being modified
   * @param tenantId Restaurant/tenant ID
   * @param relatedEntities Related entities to invalidate
   */
  async invalidateRelated(
    entityType: string,
    tenantId: string,
    relatedEntities?: Record<string, string>
  ): Promise<number> {
    try {
      let totalInvalidated = 0;

      // Primary entity invalidation
      switch (entityType.toLowerCase()) {
        case 'menu':
          totalInvalidated += await this.invalidateMenuCache(tenantId, relatedEntities?.menuId);
          break;

        case 'menu_item':
          totalInvalidated += await this.invalidateMenuItemCache(
            tenantId,
            relatedEntities?.itemId,
            relatedEntities?.menuId
          );
          break;

        case 'inventory':
          totalInvalidated += await this.invalidateInventoryCache(tenantId, relatedEntities?.itemId);
          break;

        case 'order':
          totalInvalidated += await this.invalidateOrderCache(tenantId, relatedEntities?.orderId);
          break;

        case 'payment':
          totalInvalidated += await this.invalidatePaymentCache(tenantId);
          break;

        default:
          logger.warn(`Unknown entity type for invalidation: ${entityType}`);
      }

      // Cascade to related entities if specified
      if (relatedEntities?.cascade) {
        const cascadeEntities = relatedEntities.cascade.split(',');
        for (const entity of cascadeEntities) {
          const count = await this.invalidateRelated(entity.trim(), tenantId);
          totalInvalidated += count;
        }
      }

      return totalInvalidated;
    } catch (error) {
      logger.error(`Failed cascading invalidation for ${entityType}:`, error);
      return 0;
    }
  }

  /**
   * ===== MONITORING & LOGGING =====
   */

  /**
   * Get invalidation statistics
   */
  getInvalidationStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    this.invalidationLog.forEach((data, key) => {
      stats[key] = {
        totalInvalidations: data.count,
        lastInvalidation: new Date(data.timestamp),
      };
    });

    return stats;
  }

  /**
   * Log invalidation event
   */
  private logInvalidation(entity: string, keysInvalidated: number): void {
    const existing = this.invalidationLog.get(entity) || { count: 0, timestamp: 0 };
    this.invalidationLog.set(entity, {
      count: existing.count + keysInvalidated,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear invalidation log
   */
  clearInvalidationLog(): void {
    this.invalidationLog.clear();
    logger.debug('Invalidation log cleared');
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    lastInvalidations: Record<string, any>;
  }> {
    try {
      const cacheStats = await cacheService.getStats();
      return {
        healthy: cacheStats.healthy,
        lastInvalidations: this.getInvalidationStats(),
      };
    } catch (error) {
      logger.error('Failed to get invalidation service health:', error);
      return {
        healthy: false,
        lastInvalidations: {},
      };
    }
  }
}

// Export singleton instance
export const cacheInvalidationService = new CacheInvalidationService();

export default cacheInvalidationService;
