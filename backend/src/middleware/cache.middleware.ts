import { Request, Response, NextFunction } from 'express';
import cacheService, { CACHE_TTL, CACHE_KEYS } from '../services/CacheService';
import logger from '../config/logger';

/**
 * Cache key generator for HTTP responses
 * Generates unique cache key based on URL, query params, user context
 */
function generateCacheKey(req: Request): string {
  const user_id = (req as any).user?.id || 'anonymous';
  const tenant_id = (req as any).tenant?.id || 'default';
  const url = req.originalUrl || req.url;
  const method = req.method;

  // Create cache key with method, tenant, user, and URL
  return `${CACHE_KEYS.RESTAURANT}response:${method}:${tenant_id}:${user_id}:${url}`;
}

/**
 * Cache status enum
 */
export enum CacheStatus {
  HIT = 'hit',
  MISS = 'miss',
  BYPASS = 'bypass',
  ERROR = 'error',
}

/**
 * Cache configuration per route
 */
export interface CacheConfig {
  enabled?: boolean;
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  skipIf?: (req: Request) => boolean;
  invalidateOn?: string[]; // HTTP methods that invalidate cache
}

/**
 * Store original res.json to intercept response
 */
const originalJson = Response.prototype.json as any;

/**
 * Middleware for caching HTTP GET responses
 * Caches successful responses (200-299) automatically
 *
 * Usage:
 * app.get('/api/menus', cacheMiddleware({ ttl: CACHE_TTL.MENU_ITEMS }), menuController.getMenus);
 */
export function cacheMiddleware(config: CacheConfig = {}) {
  const {
    enabled = true,
    ttl = CACHE_TTL.SHORT,
    keyGenerator = generateCacheKey,
    skipIf = () => false,
    invalidateOn = ['POST', 'PUT', 'DELETE', 'PATCH'],
  } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Only cache GET and HEAD requests by default
      const isCacheable = ['GET', 'HEAD'].includes(req.method);

      // Initialize cache metadata on request
      (req as any).cache = {
        enabled: enabled && isCacheable,
        status: CacheStatus.BYPASS,
        key: '',
        ttl,
      };

      // Skip caching if conditions not met
      if (!enabled || !isCacheable || skipIf(req)) {
        return next();
      }

      const cacheKey = keyGenerator(req);
      (req as any).cache.key = cacheKey;

      // Try to get from cache
      logger.debug(`🔍 Cache lookup: ${cacheKey}`);
      const cached = await cacheService.get(cacheKey);

      if (cached) {
        logger.info(`✅ Cache HIT: ${cacheKey}`, {
          method: req.method,
          url: req.url,
          cacheKey,
        });

        (req as any).cache.status = CacheStatus.HIT;

        // Set cache headers
        res.set({
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey,
          'Cache-Control': `public, max-age=${ttl}`,
        });

        return res.json(cached);
      }

      // Cache miss - continue to controller
      logger.debug(`❌ Cache MISS: ${cacheKey}`);
      (req as any).cache.status = CacheStatus.MISS;

      // Override res.json to cache response
      const originalJsonMethod = res.json.bind(res);
      (res as any).json = function (data: any) {
        const statusCode = res.statusCode || 200;

        // Only cache successful responses (200-299)
        if (statusCode >= 200 && statusCode < 300) {
          logger.debug(`💾 Caching response: ${cacheKey}`, { ttl });

          // Cache asynchronously (don't wait for it)
          cacheService.set(cacheKey, data, ttl).catch((err) => {
            logger.error(`Failed to cache response for ${cacheKey}:`, err);
          });

          // Add cache headers
          res.set({
            'X-Cache': 'MISS',
            'X-Cache-Key': cacheKey,
            'Cache-Control': `public, max-age=${ttl}`,
          });
        }

        // Call original json method
        return originalJsonMethod(data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      (req as any).cache.status = CacheStatus.ERROR;
      next();
    }
  };
}

/**
 * Middleware to invalidate cache based on HTTP method
 * Automatically invalidates related cache keys after mutations
 *
 * Usage:
 * app.post('/api/menus/:id', cacheInvalidationMiddleware('menu:*'), menuController.updateMenu);
 */
export function cacheInvalidationMiddleware(...patterns: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Store original res.json
      const originalResJson = res.json.bind(res);

      // Override res.json to invalidate cache after successful response
      res.json = function (data: any) {
        const statusCode = this.statusCode || 200;

        // Invalidate cache on successful mutations
        if (statusCode >= 200 && statusCode < 300) {
          logger.debug(`🗑️  Invalidating cache patterns:`, patterns);

          // Invalidate asynchronously
          patterns.forEach((pattern) => {
            cacheService.invalidatePattern(pattern).catch((err) => {
              logger.error(`Failed to invalidate cache pattern ${pattern}:`, err);
            });
          });
        }

        return originalResJson(data);
      };

      next();
    } catch (error) {
      logger.error('Cache invalidation middleware error:', error);
      next();
    }
  };
}

/**
 * Middleware to conditionally cache responses based on custom logic
 *
 * Usage:
 * app.get('/api/complex-data', conditionalCacheMiddleware(
 *   (req) => !req.user.isPremium, // Only cache non-premium users
 *   CACHE_TTL.SHORT
 * ), controller);
 */
export function conditionalCacheMiddleware(
  shouldCache: (req: Request) => boolean,
  ttl: number = CACHE_TTL.SHORT
) {
  return cacheMiddleware({
    enabled: true,
    ttl,
    skipIf: (req) => !shouldCache(req),
  });
}

/**
 * Middleware for request-specific cache key generation
 * Useful when cache key depends on custom logic
 *
 * Usage:
 * app.get('/api/data', customCacheMiddleware(
 *   (req) => `custom:key:${req.user.id}:${req.query.filter}`,
 *   CACHE_TTL.DASHBOARD
 * ), controller);
 */
export function customCacheMiddleware(
  keyGenerator: (req: Request) => string,
  ttl: number = CACHE_TTL.SHORT
) {
  return cacheMiddleware({
    enabled: true,
    ttl,
    keyGenerator,
  });
}

/**
 * Response cache decorator for individual endpoints
 * Provides more granular control over caching per route
 */
export function ResponseCache(ttl: number = CACHE_TTL.SHORT) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (req: Request, res: Response, next: NextFunction) {
      const cacheKey = generateCacheKey(req);

      // Try cache for GET requests
      if (req.method === 'GET') {
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          return res
            .set('X-Cache', 'HIT')
            .set('Cache-Control', `public, max-age=${ttl}`)
            .json(cached);
        }
      }

      // Store original res.json
      const originalResJson = res.json.bind(res);

      res.json = function (data: any) {
        if (req.method === 'GET' && (this.statusCode >= 200 && this.statusCode < 300)) {
          cacheService.set(cacheKey, data, ttl).catch((err) => {
            logger.error(`Failed to cache response:`, err);
          });

          this.set('X-Cache', 'MISS').set('Cache-Control', `public, max-age=${ttl}`);
        }

        return originalResJson(data);
      };

      return originalMethod.call(this, req, res, next);
    };

    return descriptor;
  };
}

/**
 * Helper middleware to add cache control headers
 * Useful for fine-grained control over browser/CDN caching
 */
export function cacheControlMiddleware(
  maxAge: number = CACHE_TTL.SHORT,
  options: { isPublic?: boolean; noStore?: boolean; mustRevalidate?: boolean } = {}
) {
  const { isPublic = true, noStore = false, mustRevalidate = false } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (noStore) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    } else {
      const visibility = isPublic ? 'public' : 'private';
      const revalidate = mustRevalidate ? ', must-revalidate' : '';
      res.set('Cache-Control', `${visibility}, max-age=${maxAge}${revalidate}`);
    }

    res.set('Expires', new Date(Date.now() + maxAge * 1000).toUTCString());

    next();
  };
}

/**
 * Middleware to clear cache on specific routes
 * Useful for cache invalidation endpoints
 *
 * Usage:
 * app.post('/admin/cache/clear', clearCacheMiddleware('menu:*', 'inventory:*'), handler);
 */
export async function clearCacheMiddleware(...patterns: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let totalInvalidated = 0;

      for (const pattern of patterns) {
        const count = await cacheService.invalidatePattern(pattern);
        totalInvalidated += count;
        logger.info(`🗑️  Cleared cache pattern: ${pattern} (${count} keys)`);
      }

      (req as any).cacheCleared = {
        patterns,
        totalInvalidated,
      };

      next();
    } catch (error) {
      logger.error('Clear cache middleware error:', error);
      next();
    }
  };
}

/**
 * Middleware for cache statistics/monitoring
 * Exposes cache health information
 */
export function cacheStatsMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await cacheService.getStats();
      (req as any).cacheStats = stats;
      next();
    } catch (error) {
      logger.error('Cache stats middleware error:', error);
      next();
    }
  };
}

/**
 * Export cache utilities for use in controllers
 */
export { cacheService, CACHE_TTL, CACHE_KEYS };
