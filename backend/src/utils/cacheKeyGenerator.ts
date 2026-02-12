import { Request } from 'express';
import crypto from 'crypto';
import logger from '../config/logger';

/**
 * Cache Key Generator
 * Intelligently generates cache keys based on endpoint, tenant, user, and query parameters
 * Ensures multi-tenant isolation and prevents data leakage
 */
export class CacheKeyGenerator {
  /**
   * Generate cache key for list endpoints
   * @param endpoint API endpoint (e.g., 'menus', 'inventory', 'orders')
   * @param tenantId Restaurant/tenant ID
   * @param params Query parameters (page, search, filters, etc.)
   * @returns Unique cache key
   */
  static generateListKey(
    endpoint: string,
    tenantId: string,
    params: Record<string, any> = {}
  ): string {
    // Sort params for consistent key generation
    const sortedParams = this.sortParams(params);
    const paramHash = this.hashParams(sortedParams);

    return `list:${endpoint}:${tenantId}:${paramHash}`;
  }

  /**
   * Generate cache key for single item endpoints
   * @param endpoint API endpoint (e.g., 'menus', 'inventory')
   * @param tenantId Restaurant/tenant ID
   * @param id Item ID
   * @returns Unique cache key
   */
  static generateItemKey(endpoint: string, tenantId: string, id: string): string {
    return `item:${endpoint}:${tenantId}:${id}`;
  }

  /**
   * Generate cache key for dashboard/stats endpoints
   * @param endpoint Dashboard endpoint (e.g., 'stats', 'recent-orders')
   * @param tenantId Restaurant/tenant ID
   * @param date Date for daily stats (optional)
   * @returns Unique cache key
   */
  static generateDashboardKey(endpoint: string, tenantId: string, date?: string): string {
    const dateKey = date ? `:${date}` : '';
    return `dashboard:${endpoint}:${tenantId}${dateKey}`;
  }

  /**
   * Generate cache key for report endpoints
   * @param reportType Report type (e.g., 'sales', 'inventory', 'financial')
   * @param tenantId Restaurant/tenant ID
   * @param dateRange Date range parameters
   * @returns Unique cache key
   */
  static generateReportKey(
    reportType: string,
    tenantId: string,
    dateRange: { startDate?: string; endDate?: string } = {}
  ): string {
    const sortedParams = this.sortParams(dateRange);
    const paramHash = this.hashParams(sortedParams);

    return `report:${reportType}:${tenantId}:${paramHash}`;
  }

  /**
   * Generate cache key for user-specific data
   * @param dataType Type of user data (e.g., 'preferences', 'cart')
   * @param tenantId Restaurant/tenant ID
   * @param userId User ID
   * @returns Unique cache key
   */
  static generateUserKey(dataType: string, tenantId: string, userId: string): string {
    return `user:${dataType}:${tenantId}:${userId}`;
  }

  /**
   * Generate cache key from HTTP request
   * Used by middleware for automatic caching
   * @param req Express request object
   * @param endpoint Optional endpoint name override
   * @returns Unique cache key
   */
  static generateFromRequest(req: Request, endpoint?: string): string {
    const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId || 'default';
    const userId = (req as any).user?.id || 'anonymous';
    const method = req.method;
    const url = req.originalUrl || req.url;
    const path = req.path;

    // For GET requests, include query params in hash
    const queryParams = Object.keys(req.query).length > 0 ? req.query : {};
    const queryHash = this.hashParams(queryParams);

    // Create key with all relevant context
    return `req:${method}:${tenantId}:${userId}:${path}:${queryHash}`;
  }

  /**
   * Generate pattern for cache invalidation
   * @param entity Entity type (e.g., 'menu', 'inventory', 'order')
   * @param tenantId Restaurant/tenant ID (optional, for specific tenant)
   * @returns Cache key pattern for matching
   */
  static generateInvalidationPattern(entity: string, tenantId?: string): string {
    if (tenantId) {
      return `*:${entity}:${tenantId}:*`;
    }
    return `*:${entity}:*`;
  }

  /**
   * Generate pattern for list invalidation
   * @param endpoint Endpoint name
   * @param tenantId Restaurant/tenant ID
   * @returns Cache key pattern
   */
  static generateListInvalidationPattern(endpoint: string, tenantId: string): string {
    return `list:${endpoint}:${tenantId}:*`;
  }

  /**
   * Generate pattern for item invalidation
   * @param endpoint Endpoint name
   * @param tenantId Restaurant/tenant ID
   * @returns Cache key pattern
   */
  static generateItemInvalidationPattern(endpoint: string, tenantId: string): string {
    return `item:${endpoint}:${tenantId}:*`;
  }

  /**
   * Generate pattern for related cache invalidation
   * When menu item changes, invalidate menu and inventory caches
   * @param relatedEntities Array of related entity types
   * @param tenantId Restaurant/tenant ID
   * @returns Array of cache patterns
   */
  static generateRelatedInvalidationPatterns(relatedEntities: string[], tenantId: string): string[] {
    return relatedEntities.map((entity) => this.generateInvalidationPattern(entity, tenantId));
  }

  /**
   * Tenant-scoped cache invalidation
   * Invalidates all cache for a specific restaurant
   * @param tenantId Restaurant/tenant ID
   * @returns Cache key pattern
   */
  static generateTenantInvalidationPattern(tenantId: string): string {
    return `*:${tenantId}:*`;
  }

  /**
   * Generate key prefix for a specific tenant
   * Useful for bulk operations
   * @param tenantId Restaurant/tenant ID
   * @returns Key prefix
   */
  static getTenantPrefix(tenantId: string): string {
    return `tenant:${tenantId}`;
  }

  /**
   * Helper: Sort object keys for consistent hashing
   */
  private static sortParams(params: Record<string, any>): Record<string, any> {
    const sorted: Record<string, any> = {};
    Object.keys(params)
      .sort()
      .forEach((key) => {
        sorted[key] = params[key];
      });
    return sorted;
  }

  /**
   * Helper: Hash parameters to create consistent key
   * Prevents extremely long cache keys
   */
  private static hashParams(params: Record<string, any>): string {
    const paramsStr = JSON.stringify(params);

    // If params are short, just use them directly
    if (paramsStr.length <= 50) {
      return paramsStr
        .replace(/[^a-zA-Z0-9_:/-]/g, '') // Remove special chars except allowed ones
        .substring(0, 100);
    }

    // For longer params, use hash
    return crypto
      .createHash('md5')
      .update(paramsStr)
      .digest('hex')
      .substring(0, 16);
  }
}

/**
 * Cache key constants for common endpoints
 */
export const CACHE_KEY_PATTERNS = {
  // Menu caching
  MENUS_LIST: (tenantId: string, page: number = 1) =>
    CacheKeyGenerator.generateListKey('menus', tenantId, { page }),
  MENU_DETAIL: (tenantId: string, id: string) =>
    CacheKeyGenerator.generateItemKey('menus', tenantId, id),
  MENU_CATEGORIES: (tenantId: string, menuId: string) =>
    CacheKeyGenerator.generateItemKey('menu_categories', tenantId, menuId),
  MENU_ITEMS: (tenantId: string, menuId: string) =>
    CacheKeyGenerator.generateItemKey('menu_items', tenantId, menuId),

  // Inventory caching
  INVENTORY_LIST: (tenantId: string, page: number = 1, filters?: any) =>
    CacheKeyGenerator.generateListKey('inventory', tenantId, { page, ...filters }),
  INVENTORY_ITEM: (tenantId: string, id: string) =>
    CacheKeyGenerator.generateItemKey('inventory_items', tenantId, id),
  INVENTORY_LOW_STOCK: (tenantId: string) =>
    CacheKeyGenerator.generateListKey('inventory_low_stock', tenantId),
  INVENTORY_STOCK_LEVELS: (tenantId: string) =>
    CacheKeyGenerator.generateListKey('inventory_stock_levels', tenantId),

  // Dashboard caching
  DASHBOARD_STATS: (tenantId: string, date?: string) =>
    CacheKeyGenerator.generateDashboardKey('stats', tenantId, date),
  DASHBOARD_RECENT_ORDERS: (tenantId: string) =>
    CacheKeyGenerator.generateDashboardKey('recent_orders', tenantId),
  DASHBOARD_TODAY_SUMMARY: (tenantId: string) =>
    CacheKeyGenerator.generateDashboardKey('today_summary', tenantId),

  // Order caching
  ORDERS_LIST: (tenantId: string, page: number = 1, filters?: any) =>
    CacheKeyGenerator.generateListKey('orders', tenantId, { page, ...filters }),
  ORDER_DETAIL: (tenantId: string, id: string) => CacheKeyGenerator.generateItemKey('orders', tenantId, id),

  // Report caching
  REPORT_SALES: (tenantId: string, startDate?: string, endDate?: string) =>
    CacheKeyGenerator.generateReportKey('sales', tenantId, { startDate, endDate }),
  REPORT_FINANCIAL: (tenantId: string, startDate?: string, endDate?: string) =>
    CacheKeyGenerator.generateReportKey('financial', tenantId, { startDate, endDate }),
  REPORT_INVENTORY: (tenantId: string, startDate?: string, endDate?: string) =>
    CacheKeyGenerator.generateReportKey('inventory', tenantId, { startDate, endDate }),

  // Invalidation patterns
  INVALIDATE_MENUS: (tenantId: string) => CacheKeyGenerator.generateListInvalidationPattern('menus', tenantId),
  INVALIDATE_MENU_ITEMS: (tenantId: string) =>
    CacheKeyGenerator.generateListInvalidationPattern('menu_items', tenantId),
  INVALIDATE_INVENTORY: (tenantId: string) =>
    CacheKeyGenerator.generateListInvalidationPattern('inventory', tenantId),
  INVALIDATE_ORDERS: (tenantId: string) => CacheKeyGenerator.generateListInvalidationPattern('orders', tenantId),
  INVALIDATE_DASHBOARD: (tenantId: string) =>
    CacheKeyGenerator.generateInvalidationPattern('dashboard', tenantId),
};

export default CacheKeyGenerator;
