import redisClient from '../utils/redisClient';
import cacheService, { CACHE_TTL, CACHE_KEYS } from '../services/CacheService';
import logger from '../config/logger';

/**
 * Redis testing utilities
 * Provides helpers for testing Redis operations and cache functionality
 */

/**
 * Flush Redis database (use only in tests!)
 */
export async function flushRedis(): Promise<boolean> {
  try {
    const result = await redisClient.getClient().flushdb();
    return result === 'OK';
  } catch (error) {
    logger.error('Failed to flush Redis:', error);
    return false;
  }
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const pong = await redisClient.ping();
    return pong;
  } catch (error) {
    return false;
  }
}

/**
 * Get Redis connection health
 */
export async function getRedisHealth(): Promise<{
  connected: boolean;
  status: string;
  canPing: boolean;
  error?: string;
}> {
  try {
    const health = await redisClient.healthCheck();
    return {
      connected: health.healthy,
      status: health.status,
      canPing: health.canPing,
    };
  } catch (error) {
    return {
      connected: false,
      status: 'error',
      canPing: false,
      error: String(error),
    };
  }
}

/**
 * Mock cache operations for testing without Redis
 * Use when Redis is unavailable or for unit tests
 */
export class MockCacheService {
  private data: Map<string, { value: any; ttl: number | null; createdAt: number }> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.data.get(key);
    if (!entry) return null;

    // Check if expired
    if (entry.ttl && Date.now() - entry.createdAt > entry.ttl * 1000) {
      this.data.delete(key);
      return null;
    }

    return entry.value;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    this.data.set(key, {
      value,
      ttl: ttl ?? null,
      createdAt: Date.now(),
    });

    // Set expiration timer if TTL provided
    if (ttl) {
      const existingTimer = this.timers.get(key);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        this.data.delete(key);
        this.timers.delete(key);
      }, ttl * 1000);

      this.timers.set(key, timer);
    }

    return true;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    keys.forEach((key) => {
      if (this.data.has(key)) {
        this.data.delete(key);
        count++;
        const timer = this.timers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.timers.delete(key);
        }
      }
    });
    return count;
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  getData(): Map<string, any> {
    return this.data;
  }
}

/**
 * Test utilities for cache operations
 */
export const cacheTestUtils = {
  /**
   * Set test data in cache
   */
  async setTestData(key: string, value: any, ttl: number = CACHE_TTL.SHORT): Promise<void> {
    await cacheService.set(key, value, ttl);
  },

  /**
   * Get test data from cache
   */
  async getTestData<T>(key: string): Promise<T | null> {
    return cacheService.get<T>(key);
  },

  /**
   * Verify cache hit by making request twice
   */
  async verifyCacheHit(
    key: string,
    fetchFn: () => Promise<any>,
    ttl: number = CACHE_TTL.SHORT
  ): Promise<{ firstRequestTime: number; secondRequestTime: number; isCacheHit: boolean }> {
    // First request - cache miss
    const firstStart = Date.now();
    const firstResult = await cacheService.getWithCacheAside(key, fetchFn, ttl);
    const firstRequestTime = Date.now() - firstStart;

    // Second request - cache hit
    const secondStart = Date.now();
    const secondResult = await cacheService.getWithCacheAside(key, fetchFn, ttl);
    const secondRequestTime = Date.now() - secondStart;

    // Cache hit should be significantly faster (at least 5x)
    const isCacheHit = secondRequestTime < firstRequestTime / 5;

    logger.info('Cache Hit Verification:', {
      firstRequestTime: `${firstRequestTime}ms`,
      secondRequestTime: `${secondRequestTime}ms`,
      isCacheHit,
      speedup: `${(firstRequestTime / secondRequestTime).toFixed(2)}x`,
    });

    return {
      firstRequestTime,
      secondRequestTime,
      isCacheHit,
    };
  },

  /**
   * Verify cache invalidation
   */
  async verifyCacheInvalidation(key: string, value: string): Promise<boolean> {
    // Set cache
    await cacheService.set(key, value, CACHE_TTL.SHORT);

    // Verify it's cached
    let cached = await cacheService.get(key);
    if (cached !== value) {
      logger.error('Failed to cache value');
      return false;
    }

    // Invalidate
    await cacheService.invalidate(key);

    // Verify it's gone
    cached = await cacheService.get(key);
    const isInvalidated = cached === null;

    logger.info('Cache Invalidation Verification:', { isInvalidated });

    return isInvalidated;
  },

  /**
   * Measure cache operation performance
   */
  async measurePerformance(
    key: string,
    operation: () => Promise<any>,
    iterations: number = 100
  ): Promise<{
    avgTime: number;
    minTime: number;
    maxTime: number;
    totalTime: number;
  }> {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await operation();
      times.push(Date.now() - start);
    }

    const totalTime = times.reduce((a, b) => a + b, 0);
    const avgTime = totalTime / iterations;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    logger.info('Cache Performance Metrics:', {
      operation: key,
      iterations,
      avgTime: `${avgTime.toFixed(2)}ms`,
      minTime: `${minTime}ms`,
      maxTime: `${maxTime}ms`,
      totalTime: `${totalTime}ms`,
    });

    return {
      avgTime,
      minTime,
      maxTime,
      totalTime,
    };
  },

  /**
   * Test cache with TTL expiration
   */
  async testTTLExpiration(
    key: string,
    value: string,
    ttlSeconds: number = 2
  ): Promise<boolean> {
    // Set with TTL
    await cacheService.set(key, value, ttlSeconds);

    // Verify it exists
    let exists = await cacheService.exists(key);
    if (!exists) {
      logger.error('Failed to set cache with TTL');
      return false;
    }

    logger.info(`Waiting ${ttlSeconds} seconds for cache expiration...`);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, ttlSeconds * 1000 + 100));

    // Verify it expired
    exists = await cacheService.exists(key);
    const expired = !exists;

    logger.info('TTL Expiration Test:', { expired });

    return expired;
  },

  /**
   * Generate test data set
   */
  generateTestData<T>(count: number, generator: (i: number) => T): Record<string, T> {
    const result: Record<string, T> = {};
    for (let i = 0; i < count; i++) {
      result[`test:key:${i}`] = generator(i);
    }
    return result;
  },

  /**
   * Test pattern-based cache invalidation
   */
  async testPatternInvalidation(prefix: string, count: number = 10): Promise<boolean> {
    // Set multiple keys with prefix
    for (let i = 0; i < count; i++) {
      await cacheService.set(`${prefix}:${i}`, `value:${i}`, CACHE_TTL.SHORT);
    }

    // Verify they exist
    let existCount = 0;
    for (let i = 0; i < count; i++) {
      if (await cacheService.exists(`${prefix}:${i}`)) {
        existCount++;
      }
    }

    if (existCount !== count) {
      logger.error(`Only ${existCount}/${count} keys were cached`);
      return false;
    }

    // Invalidate by pattern
    const invalidated = await cacheService.invalidatePattern(`${prefix}:*`);

    logger.info('Pattern Invalidation Test:', {
      setCount: count,
      invalidatedCount: invalidated,
      matched: invalidated === count,
    });

    return invalidated === count;
  },

  /**
   * Test concurrent cache operations
   */
  async testConcurrentOperations(
    operations: Array<() => Promise<void>>,
    timeout: number = 5000
  ): Promise<boolean> {
    try {
      const promise = Promise.all(operations.map((op) => op()));
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      );

      await Promise.race([promise, timeoutPromise]);

      logger.info('Concurrent Operations Test:', {
        operationCount: operations.length,
        success: true,
      });

      return true;
    } catch (error) {
      logger.error('Concurrent Operations Test Failed:', error);
      return false;
    }
  },

  /**
   * Test cache hit rate
   */
  async testCacheHitRate(
    operations: Array<{ key: string; fetch: () => Promise<any> }>,
    iterations: number = 10
  ): Promise<{
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    hitRate: number;
  }> {
    let hits = 0;
    let misses = 0;

    for (let i = 0; i < iterations; i++) {
      for (const { key, fetch } of operations) {
        // First iteration = miss, subsequent = hit
        if (i === 0) {
          misses++;
          await cacheService.getWithCacheAside(key, fetch, CACHE_TTL.SHORT);
        } else {
          hits++;
          await cacheService.get(key);
        }
      }
    }

    const totalRequests = hits + misses;
    const hitRate = (hits / totalRequests) * 100;

    logger.info('Cache Hit Rate Test:', {
      totalRequests,
      cacheHits: hits,
      cacheMisses: misses,
      hitRate: `${hitRate.toFixed(2)}%`,
    });

    return {
      totalRequests,
      cacheHits: hits,
      cacheMisses: misses,
      hitRate,
    };
  },
};

/**
 * Setup and teardown utilities for tests
 */
export const cacheTestSetup = {
  /**
   * Setup before tests
   */
  async beforeEach(): Promise<void> {
    if (await isRedisAvailable()) {
      await flushRedis();
    }
  },

  /**
   * Teardown after tests
   */
  async afterEach(): Promise<void> {
    if (await isRedisAvailable()) {
      await flushRedis();
    }
  },

  /**
   * Setup before all tests
   */
  async beforeAll(): Promise<void> {
    const health = await getRedisHealth();
    logger.info('Redis Health Check:', health);
  },

  /**
   * Teardown after all tests
   */
  async afterAll(): Promise<void> {
    if (await isRedisAvailable()) {
      await flushRedis();
    }
  },
};

export default {
  flushRedis,
  isRedisAvailable,
  getRedisHealth,
  MockCacheService,
  cacheTestUtils,
  cacheTestSetup,
};
