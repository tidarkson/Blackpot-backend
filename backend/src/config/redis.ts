import { createClient, RedisClientOptions } from 'redis';
import logger from './logger';
import { config } from './environment';

// Create Redis client
export const redisClient = createClient({
  socket: {
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
  },
  password: config.REDIS_PASSWORD || undefined,
  database: config.REDIS_DB || 0,
  retryStrategy: (retries: number): number | undefined => {
    const delay = Math.min(retries * 50, 2000);
    if (retries > 20) {
      return undefined;
    }
    return delay;
  },
} as RedisClientOptions);

// Handle connection events
redisClient.on('connect', () => {
  logger.info('✅ Redis client connected successfully');
});

redisClient.on('ready', () => {
  logger.info('✅ Redis client is ready to use');
});

redisClient.on('error', (err: Error) => {
  logger.error('❌ Redis client error:', err);
});

redisClient.on('reconnecting', () => {
  logger.warn('🔄 Redis client reconnecting...');
});

redisClient.on('end', () => {
  logger.warn('🔌 Redis client disconnected');
});

/**
 * Initialize Redis connection
 */
export async function initializeRedis(): Promise<void> {
  try {
    // Only connect if not already connected
    if (!redisClient.isOpen) {
      await redisClient.connect();
      logger.info('🚀 Redis connection initialized');
    }
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    // Graceful degradation - app can still work without Redis (in-memory fallback)
    logger.warn('⚠️ Continuing without Redis. Rate limiting will use in-memory store.');
  }
}

/**
 * Check Redis connection health
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    if (!redisClient.isOpen) {
      return false;
    }
    await redisClient.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      logger.info('✅ Redis connection closed gracefully');
    }
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
}

export default redisClient;

