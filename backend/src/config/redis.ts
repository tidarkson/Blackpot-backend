import { redisClient } from '../utils/redisClient';
import logger from './logger';
import { config } from './environment';

/**
 * Initialize Redis connection
 * Called on application startup
 */
export async function initializeRedis(): Promise<void> {
  try {
    if (!config.REDIS_ENABLED) {
      logger.warn('⚠️  Redis is disabled in configuration. Using graceful degradation.');
      return;
    }

    const isConnected = redisClient.getIsConnected();
    if (!isConnected) {
      logger.info('🚀 Initializing Redis connection...');
      
      // Test connection
      const canPing = await redisClient.ping();
      if (canPing) {
        logger.info('✅ Redis connection initialized successfully');
      } else {
        logger.warn('⚠️  Failed to initialize Redis. Continuing with graceful degradation.');
      }
    }
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    // Graceful degradation - app continues without Redis
    logger.warn('⚠️  Continuing without Redis. Some features may not work optimally.');
  }
}

/**
 * Check Redis connection health
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const health = await redisClient.healthCheck();
    return health.healthy;
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
    logger.info('Closing Redis connection...');
    await redisClient.disconnect();
    logger.info('✅ Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
}

/**
 * Get Redis client status
 */
export function getRedisStatus(): string {
  return redisClient.getStatus();
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient.getIsConnected();
}

// Export the Redis client instance for direct access if needed
export { redisClient };

export default redisClient;


