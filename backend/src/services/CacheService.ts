import redisClient from '../utils/redisClient';
import logger from '../config/logger';

/**
 * Cache TTL constants (in seconds)
 */
export const CACHE_TTL = {
  MENU_ITEMS: 3600, // 1 hour
  INVENTORY_LEVELS: 300, // 5 minutes
  RECENT_ORDERS: 60, // 1 minute
  SESSION: 86400, // 24 hours
  RATE_LIMIT: 60, // 1 minute
  DASHBOARD: 60, // 1 minute
  REPORTS: 3600, // 1 hour
  USER: 1800, // 30 minutes
  SHORT: 300, // 5 minutes
  LONG: 86400, // 24 hours
};

/**
 * Cache key prefixes for namespacing
 */
export const CACHE_KEYS = {
  MENU: 'menu:',
  MENU_ITEM: 'menu_item:',
  INVENTORY: 'inventory:',
  INVENTORY_STOCK: 'inventory:stock:',
  ORDER: 'order:',
  SESSION: 'session:',
  USER: 'user:',
  DASHBOARD: 'dashboard:',
  RATE_LIMIT: 'ratelimit:',
  REPORT: 'report:',
  RESTAURANT: 'restaurant:',
};

/**
 * Caching strategies
 */
export enum CacheStrategy {
  CACHE_ASIDE = 'cache_aside',
  WRITE_THROUGH = 'write_through',
  WRITE_BEHIND = 'write_behind',
}

/**
 * Cache Service - Handles all caching operations
 * Supports multiple caching strategies with graceful degradation
 */
class CacheService {
  /**
   * ===== CACHE-ASIDE PATTERN =====
   * 1. Try to get from cache
   * 2. If miss, fetch from source
   * 3. Store in cache for future requests
   */

  /**
   * Get value with cache-aside pattern
   * @param cacheKey Cache key
   * @param fetchFn Function to fetch value if cache miss
   * @param ttl TTL in seconds
   * @returns Cached or fetched value
   */
  async getWithCacheAside<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    ttl: number = CACHE_TTL.SHORT
  ): Promise<T | null> {
    try {
      // Step 1: Try cache
      const cached = await redisClient.get(cacheKey);
      if (cached !== null) {
        logger.debug(`✅ Cache hit: ${cacheKey}`);
        try {
          return JSON.parse(cached);
        } catch {
          // If parsing fails, treat as cache miss
          return this.handleCacheMiss(cacheKey, fetchFn, ttl);
        }
      }

      // Step 2 & 3: Cache miss - fetch and store
      logger.debug(`❌ Cache miss: ${cacheKey}`);
      return await this.handleCacheMiss(cacheKey, fetchFn, ttl);
    } catch (error) {
      logger.warn(`Cache-aside operation failed for ${cacheKey}, falling back to source`, error);
      // Graceful degradation - fetch from source directly if cache fails
      try {
        return await fetchFn();
      } catch (err) {
        logger.error(`Failed to fetch data from source for ${cacheKey}:`, err);
        return null;
      }
    }
  }

  /**
   * Handle cache miss - fetch and store
   */
  private async handleCacheMiss<T>(
    cacheKey: string,
    fetchFn: () => Promise<T>,
    ttl: number
  ): Promise<T | null> {
    try {
      const data = await fetchFn();
      if (data !== null && data !== undefined) {
        // Try to cache, but don't fail if Redis is unavailable
        await this.set(cacheKey, data, ttl);
      }
      return data;
    } catch (error) {
      logger.error(`Failed to fetch data for cache key ${cacheKey}:`, error);
      return null;
    }
  }

  /**
   * ===== WRITE-THROUGH PATTERN =====
   * 1. Write to cache
   * 2. Write to database
   * Both must succeed
   */

  /**
   * Write with write-through pattern
   * @param cacheKey Cache key
   * @param value Value to cache
   * @param writeFn Function to write to source
   * @param ttl TTL in seconds
   */
  async setWithWriteThrough<T>(
    cacheKey: string,
    value: T,
    writeFn: () => Promise<void>,
    ttl: number = CACHE_TTL.SHORT
  ): Promise<boolean> {
    try {
      // Write to cache first
      await this.set(cacheKey, value, ttl);

      // Then write to database
      await writeFn();

      logger.debug(`✅ Write-through successful: ${cacheKey}`);
      return true;
    } catch (error) {
      logger.error(`Write-through failed for ${cacheKey}:`, error);
      // On failure, invalidate cache to avoid stale data
      await this.invalidate(cacheKey);
      throw error;
    }
  }

  /**
   * ===== BASIC OPERATIONS =====
   */

  /**
   * Get cached value
   * @param cacheKey Cache key
   * @returns Cached value or null
   */
  async get<T>(cacheKey: string): Promise<T | null> {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached === null) return null;

      try {
        return JSON.parse(cached) as T;
      } catch {
        // If JSON parsing fails, return as string
        return cached as T;
      }
    } catch (error) {
      logger.error(`Cache get error for ${cacheKey}:`, error);
      return null;
    }
  }

  /**
   * Set cached value with TTL
   * @param cacheKey Cache key
   * @param value Value to cache
   * @param ttl TTL in seconds
   */
  async set<T>(cacheKey: string, value: T, ttl: number = CACHE_TTL.SHORT): Promise<boolean> {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      return await redisClient.set(cacheKey, serialized, ttl);
    } catch (error) {
      logger.error(`Cache set error for ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Set multiple cache entries atomically
   * @param entries Object with key-value pairs
   * @param ttl TTL in seconds
   */
  async setMultiple<T>(entries: Record<string, T>, ttl: number = CACHE_TTL.SHORT): Promise<boolean> {
    try {
      const serialized: Record<string, string> = {};
      for (const [key, value] of Object.entries(entries)) {
        serialized[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
      return await redisClient.setMultiple(serialized, ttl);
    } catch (error) {
      logger.error('Cache setMultiple error:', error);
      return false;
    }
  }

  /**
   * Get multiple values
   * @param cacheKeys Array of cache keys
   */
  async getMultiple<T>(cacheKeys: string[]): Promise<Record<string, T | null>> {
    try {
      const results = await redisClient.getMultiple(cacheKeys);
      const parsed: Record<string, T | null> = {};

      for (const [key, value] of Object.entries(results)) {
        if (value === null) {
          parsed[key] = null;
        } else {
          try {
            parsed[key] = JSON.parse(value) as T;
          } catch {
            parsed[key] = value as T;
          }
        }
      }

      return parsed;
    } catch (error) {
      logger.error('Cache getMultiple error:', error);
      return {};
    }
  }

  /**
   * ===== INVALIDATION =====
   */

  /**
   * Invalidate single cache key
   * @param cacheKey Cache key to invalidate
   */
  async invalidate(cacheKey: string): Promise<boolean> {
    try {
      const deleted = await redisClient.del(cacheKey);
      if (deleted > 0) {
        logger.debug(`🗑️  Invalidated cache: ${cacheKey}`);
      }
      return deleted > 0;
    } catch (error) {
      logger.error(`Failed to invalidate cache ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Invalidate multiple cache keys
   * @param pattern Glob pattern (e.g., 'menu:*') or array of keys
   */
  async invalidatePattern(pattern: string | string[]): Promise<number> {
    try {
      let keys: string[] = [];

      if (Array.isArray(pattern)) {
        keys = pattern;
      } else {
        // Get all keys matching pattern
        keys = await redisClient.keys(pattern);
      }

      if (keys.length === 0) {
        logger.debug(`No keys matching pattern: ${pattern}`);
        return 0;
      }

      const deleted = await redisClient.del(...keys);
      logger.debug(`🗑️  Invalidated ${deleted} cache keys matching pattern: ${pattern}`);
      return deleted;
    } catch (error) {
      logger.error(`Failed to invalidate cache pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate by prefix (helper for common patterns)
   * @param prefix Cache key prefix (e.g., CACHE_KEYS.MENU)
   */
  async invalidateByPrefix(prefix: string): Promise<number> {
    return this.invalidatePattern(`${prefix}*`);
  }

  /**
   * ===== CACHE WARMING =====
   */

  /**
   * Warm cache with data
   * Useful for preloading frequently accessed data
   * @param data Object with cache_key -> value mappings
   * @param ttl TTL in seconds
   */
  async warmCache<T>(data: Record<string, T>, ttl: number = CACHE_TTL.SHORT): Promise<number> {
    try {
      let successCount = 0;
      for (const [key, value] of Object.entries(data)) {
        const success = await this.set(key, value, ttl);
        if (success) successCount++;
      }
      logger.info(`🔥 Cache warming completed: ${successCount}/${Object.keys(data).length} entries`);
      return successCount;
    } catch (error) {
      logger.error('Cache warming failed:', error);
      return 0;
    }
  }

  /**
   * ===== BULK OPERATIONS =====
   */

  /**
   * Get or set with default value
   * @param cacheKey Cache key
   * @param defaultValue Default value if not cached
   * @param ttl TTL in seconds
   */
  async getOrSet<T>(cacheKey: string, defaultValue: T, ttl: number = CACHE_TTL.SHORT): Promise<T> {
    let cached = await this.get<T>(cacheKey);
    if (cached !== null) return cached;

    await this.set(cacheKey, defaultValue, ttl);
    return defaultValue;
  }

  /**
   * Increment counter
   * Useful for rate limiting, usage tracking
   * @param cacheKey Counter key
   * @param increment Increment amount
   * @param ttl TTL for counter
   */
  async increment(cacheKey: string, increment: number = 1, ttl?: number): Promise<number> {
    try {
      const newValue = await redisClient.incr(cacheKey, increment);

      // Set TTL if specified and key didn't exist
      if (ttl && newValue === increment) {
        await redisClient.expire(cacheKey, ttl);
      }

      return newValue;
    } catch (error) {
      logger.error(`Cache increment error for ${cacheKey}:`, error);
      return 0;
    }
  }

  /**
   * Decrement counter
   * @param cacheKey Counter key
   * @param decrement Decrement amount
   */
  async decrement(cacheKey: string, decrement: number = 1): Promise<number> {
    try {
      return await redisClient.decr(cacheKey, decrement);
    } catch (error) {
      logger.error(`Cache decrement error for ${cacheKey}:`, error);
      return 0;
    }
  }

  /**
   * ===== HASH OPERATIONS (for session-like data) =====
   */

  /**
   * Set hash field
   * Useful for storing structured data (e.g., session info)
   * @param hashKey Hash key
   * @param field Field name
   * @param value Field value
   */
  async hset(hashKey: string, field: string, value: any): Promise<boolean> {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await redisClient.hset(hashKey, field, serialized);
      return true;
    } catch (error) {
      logger.error(`Cache hset error for ${hashKey}:`, error);
      return false;
    }
  }

  /**
   * Get hash field
   * @param hashKey Hash key
   * @param field Field name
   */
  async hget<T>(hashKey: string, field: string): Promise<T | null> {
    try {
      const value = await redisClient.hget(hashKey, field);
      if (value === null) return null;

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      logger.error(`Cache hget error for ${hashKey}:`, error);
      return null;
    }
  }

  /**
   * Get all hash fields
   * @param hashKey Hash key
   */
  async hgetall<T>(hashKey: string): Promise<Record<string, T>> {
    try {
      const result = await redisClient.hgetall(hashKey);
      const parsed: Record<string, T> = {};

      for (const [field, value] of Object.entries(result)) {
        try {
          parsed[field] = JSON.parse(value) as T;
        } catch {
          parsed[field] = value as T;
        }
      }

      return parsed;
    } catch (error) {
      logger.error(`Cache hgetall error for ${hashKey}:`, error);
      return {};
    }
  }

  /**
   * Set multiple hash fields
   * @param hashKey Hash key
   * @param data Object with field-value pairs
   */
  async hmset(hashKey: string, data: Record<string, any>): Promise<boolean> {
    try {
      const serialized: Record<string, string> = {};
      for (const [field, value] of Object.entries(data)) {
        serialized[field] = typeof value === 'string' ? value : JSON.stringify(value);
      }
      return await redisClient.hmset(hashKey, serialized);
    } catch (error) {
      logger.error(`Cache hmset error for ${hashKey}:`, error);
      return false;
    }
  }

  /**
   * Delete hash fields
   * @param hashKey Hash key
   * @param fields Field names to delete
   */
  async hdel(hashKey: string, ...fields: string[]): Promise<number> {
    try {
      return await redisClient.hdel(hashKey, ...fields);
    } catch (error) {
      logger.error(`Cache hdel error for ${hashKey}:`, error);
      return 0;
    }
  }

  /**
   * ===== UTILITY OPERATIONS =====
   */

  /**
   * Check if key exists in cache
   * @param cacheKey Cache key
   */
  async exists(cacheKey: string): Promise<boolean> {
    try {
      return await redisClient.exists(cacheKey);
    } catch (error) {
      logger.error(`Cache exists error for ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL for key
   * @param cacheKey Cache key
   * @returns TTL in seconds, -1 if no expiry, -2 if doesn't exist
   */
  async getTTL(cacheKey: string): Promise<number> {
    try {
      return await redisClient.ttl(cacheKey);
    } catch (error) {
      logger.error(`Cache getTTL error for ${cacheKey}:`, error);
      return -2;
    }
  }

  /**
   * Set TTL for existing key
   * @param cacheKey Cache key
   * @param ttl TTL in seconds
   */
  async setTTL(cacheKey: string, ttl: number): Promise<boolean> {
    try {
      return await redisClient.expire(cacheKey, ttl);
    } catch (error) {
      logger.error(`Cache setTTL error for ${cacheKey}:`, error);
      return false;
    }
  }

  /**
   * Get cache size (number of keys)
   */
  async getSize(): Promise<number> {
    try {
      const keys = await redisClient.keys('*');
      return keys.length;
    } catch (error) {
      logger.error('Cache getSize error:', error);
      return 0;
    }
  }

  /**
   * Clear entire cache (use with caution!)
   */
  async clear(): Promise<boolean> {
    try {
      const success = await redisClient.flushdb();
      if (success) {
        logger.warn('🗑️  ⚠️  Cache cleared completely');
      }
      return success;
    } catch (error) {
      logger.error('Cache clear error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    healthy: boolean;
    keysCount: number;
    info: Record<string, any>;
  }> {
    try {
      const infos = await redisClient.info();
      const keysCount = await this.getSize();

      return {
        healthy: redisClient.getIsConnected(),
        keysCount,
        info: infos,
      };
    } catch (error) {
      logger.error('Cache getStats error:', error);
      return {
        healthy: false,
        keysCount: 0,
        info: {},
      };
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();

export default cacheService;
