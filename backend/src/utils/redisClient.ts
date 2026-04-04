import Redis, { RedisOptions } from 'ioredis';
import logger from '../config/logger';
import { config } from '../config/environment';

/**
 * Enhanced Redis client with connection pooling, automatic reconnection,
 * and cluster support (future-ready)
 */
class RedisClientWrapper {
  private client: Redis;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 10;
  private reconnectInterval: NodeJS.Timer | null = null;

  constructor() {
    if (!config.REDIS_ENABLED) {
      // Keep a client instance for API compatibility, but never auto-connect.
      this.client = new Redis({
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      this.isConnected = false;
      logger.warn('⚠️ Redis client initialized in disabled mode (REDIS_ENABLED=false)');
      return;
    }

    const redisOptions: RedisOptions = {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB,
      
      // Connection pooling and performance
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      
      // Automatic reconnection with exponential backoff
      retryStrategy: (times: number): number | void => {
        const delay = Math.min(times * 50, 2000);
        if (times > this.maxConnectionAttempts) {
          logger.error(
            `❌ Redis: Max connection attempts (${this.maxConnectionAttempts}) exceeded. Giving up.`
          );
          this.handleConnectionFailure();
          return; // Stop reconnecting
        }
        logger.warn(`🔄 Redis: Reconnecting... (attempt ${times})`);
        return delay;
      },
      
      // Connection timeout
      connectTimeout: 10000,
      
      // Command timeout
      commandTimeout: 5000,
      
      // Health check interval
      lazyConnect: false,
    };

    this.client = new Redis(redisOptions);
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for connection lifecycle
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('✅ Redis: Client connected');
      this.isConnected = true;
      this.connectionAttempts = 0;
    });

    this.client.on('ready', () => {
      logger.info('✅ Redis: Client ready to accept commands');
    });

    this.client.on('error', (err: Error) => {
      logger.error('❌ Redis: Client error:', { error: err.message });
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      this.connectionAttempts++;
      logger.warn(`🔄 Redis: Reconnecting (attempt ${this.connectionAttempts})`);
    });

    this.client.on('end', () => {
      logger.warn('🔌 Redis: Client connection closed');
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('❌ Redis: Connection closed unexpectedly');
      this.isConnected = false;
    });

    // Idle event for monitoring
    this.client.on('idle', () => {
      logger.debug('⏸️  Redis: Client idle');
    });
  }

  /**
   * Handle connection failure
   */
  private handleConnectionFailure(): void {
    logger.error(
      '❌ Redis: Connection failed. App will continue with graceful degradation. ' +
      'Some features may not work optimally (caching, session storage, rate limiting).'
    );
    this.isConnected = false;
  }

  /**
   * Check if Redis is connected
   */
  public getIsConnected(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  /**
   * Get connection status as string
   */
  public getStatus(): string {
    if (!config.REDIS_ENABLED) {
      return 'disabled';
    }
    return this.client.status;
  }

  /**
   * ===== BASIC OPERATIONS =====
   */

  /**
   * Get value by key
   * @param key Cache key
   * @returns Cached value or null
   */
  async get(key: string): Promise<string | null> {
    try {
      if (!this.isConnected) return null;
      const value = await this.client.get(key);
      return value;
    } catch (error) {
      logger.error(`Redis get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Get multiple values by keys
   * @param keys Array of cache keys
   * @returns Object with key-value pairs
   */
  async getMultiple(keys: string[]): Promise<Record<string, string | null>> {
    try {
      if (!this.isConnected) return {};
      const values = await this.client.mget(...keys);
      const result: Record<string, string | null> = {};
      keys.forEach((key, index) => {
        result[key] = values[index];
      });
      return result;
    } catch (error) {
      logger.error('Redis mget error:', error);
      return {};
    }
  }

  /**
   * Set value with optional TTL
   * @param key Cache key
   * @param value Value to cache
   * @param ttlSeconds Optional TTL in seconds
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error(`Redis set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set multiple values (atomic operation)
   * @param data Object with key-value pairs
   * @param ttlSeconds Optional TTL in seconds
   */
  async setMultiple(data: Record<string, string>, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      
      const pipeline = this.client.pipeline();
      
      for (const [key, value] of Object.entries(data)) {
        if (ttlSeconds) {
          pipeline.setex(key, ttlSeconds, value);
        } else {
          pipeline.set(key, value);
        }
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Redis mset error:', error);
      return false;
    }
  }

  /**
   * Set with EX (expire in X seconds) - shorthand for setex
   * @param key Cache key
   * @param ttlSeconds TTL in seconds
   * @param value Value to cache
   */
  async setex(key: string, ttlSeconds: number, value: string): Promise<boolean> {
    return this.set(key, value, ttlSeconds);
  }

  /**
   * Delete one or more keys
   * @param keys One or more keys to delete
   * @returns Number of keys deleted
   */
  async del(...keys: string[]): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      return await this.client.del(...keys);
    } catch (error) {
      logger.error('Redis del error:', error);
      return 0;
    }
  }

  /**
   * Check if key exists
   * @param key Cache key
   * @returns True if exists, false otherwise
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      logger.error(`Redis exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL (time to live) for key in seconds
   * @param key Cache key
   * @returns TTL in seconds, -1 if no expiry, -2 if doesn't exist
   */
  async ttl(key: string): Promise<number> {
    try {
      if (!this.isConnected) return -2;
      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`Redis ttl error for key ${key}:`, error);
      return -2;
    }
  }

  /**
   * Set TTL for existing key
   * @param key Cache key
   * @param ttlSeconds TTL in seconds
   * @returns True if timeout was set
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      logger.error(`Redis expire error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * ===== HASH OPERATIONS =====
   */

  /**
   * Set hash field
   * @param key Hash key
   * @param field Field name
   * @param value Field value
   */
  async hset(key: string, field: string, value: string): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      return await this.client.hset(key, field, value);
    } catch (error) {
      logger.error(`Redis hset error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get hash field
   * @param key Hash key
   * @param field Field name
   * @returns Field value or null
   */
  async hget(key: string, field: string): Promise<string | null> {
    try {
      if (!this.isConnected) return null;
      return await this.client.hget(key, field);
    } catch (error) {
      logger.error(`Redis hget error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Get all hash fields and values
   * @param key Hash key
   * @returns Object with field-value pairs
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      if (!this.isConnected) return {};
      return await this.client.hgetall(key);
    } catch (error) {
      logger.error(`Redis hgetall error for key ${key}:`, error);
      return {};
    }
  }

  /**
   * Set multiple hash fields
   * @param key Hash key
   * @param data Object with field-value pairs
   */
  async hmset(key: string, data: Record<string, string>): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      await this.client.hmset(key, data);
      return true;
    } catch (error) {
      logger.error(`Redis hmset error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get multiple hash fields
   * @param key Hash key
   * @param fields Field names
   * @returns Array of values
   */
  async hmget(key: string, ...fields: string[]): Promise<(string | null)[]> {
    try {
      if (!this.isConnected) return [];
      return await this.client.hmget(key, ...fields);
    } catch (error) {
      logger.error(`Redis hmget error for key ${key}:`, error);
      return [];
    }
  }

  /**
   * Delete hash fields
   * @param key Hash key
   * @param fields Field names to delete
   * @returns Number of fields deleted
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      return await this.client.hdel(key, ...fields);
    } catch (error) {
      logger.error(`Redis hdel error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Check if hash field exists
   * @param key Hash key
   * @param field Field name
   */
  async hexists(key: string, field: string): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      const result = await this.client.hexists(key, field);
      return result === 1;
    } catch (error) {
      logger.error(`Redis hexists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * ===== SET OPERATIONS =====
   */

  /**
   * Add members to set
   * @param key Set key
   * @param members Members to add
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      return await this.client.sadd(key, ...members);
    } catch (error) {
      logger.error(`Redis sadd error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Remove members from set
   * @param key Set key
   * @param members Members to remove
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      return await this.client.srem(key, ...members);
    } catch (error) {
      logger.error(`Redis srem error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get all set members
   * @param key Set key
   */
  async smembers(key: string): Promise<string[]> {
    try {
      if (!this.isConnected) return [];
      return await this.client.smembers(key);
    } catch (error) {
      logger.error(`Redis smembers error for key ${key}:`, error);
      return [];
    }
  }

  /**
   * Check set membership
   * @param key Set key
   * @param member Member to check
   */
  async sismember(key: string, member: string): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      const result = await this.client.sismember(key, member);
      return result === 1;
    } catch (error) {
      logger.error(`Redis sismember error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * ===== COUNTER OPERATIONS =====
   */

  /**
   * Increment counter
   * @param key Counter key
   * @param increment Amount to increment (default 1)
   */
  async incr(key: string, increment: number = 1): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      if (increment === 1) {
        return await this.client.incr(key);
      } else {
        return await this.client.incrby(key, increment);
      }
    } catch (error) {
      logger.error(`Redis incr error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Decrement counter
   * @param key Counter key
   * @param decrement Amount to decrement (default 1)
   */
  async decr(key: string, decrement: number = 1): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      if (decrement === 1) {
        return await this.client.decr(key);
      } else {
        return await this.client.decrby(key, decrement);
      }
    } catch (error) {
      logger.error(`Redis decr error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * ===== LIST OPERATIONS =====
   */

  /**
   * Push to list (right side)
   * @param key List key
   * @param values Values to push
   */
  async rpush(key: string, ...values: string[]): Promise<number> {
    try {
      if (!this.isConnected) return 0;
      return await this.client.rpush(key, ...values);
    } catch (error) {
      logger.error(`Redis rpush error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Pop from list (right side)
   * @param key List key
   */
  async rpop(key: string): Promise<string | null> {
    try {
      if (!this.isConnected) return null;
      return await this.client.rpop(key);
    } catch (error) {
      logger.error(`Redis rpop error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Get list range
   * @param key List key
   * @param start Start index
   * @param stop Stop index
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      if (!this.isConnected) return [];
      return await this.client.lrange(key, start, stop);
    } catch (error) {
      logger.error(`Redis lrange error for key ${key}:`, error);
      return [];
    }
  }

  /**
   * ===== UTILITY OPERATIONS =====
   */

  /**
   * Flush all data in current database
   */
  async flushdb(): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      await this.client.flushdb();
      return true;
    } catch (error) {
      logger.error('Redis flushdb error:', error);
      return false;
    }
  }

  /**
   * Flush all data in all databases
   */
  async flushall(): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      await this.client.flushall();
      return true;
    } catch (error) {
      logger.error('Redis flushall error:', error);
      return false;
    }
  }

  /**
   * Get all keys matching pattern
   * @param pattern Key pattern (e.g., 'menu:*')
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      if (!this.isConnected) return [];
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis keys error:', error);
      return [];
    }
  }

  /**
   * Get database statistics
   */
  async info(): Promise<Record<string, any>> {
    try {
      if (!this.isConnected) return {};
      const info = await this.client.info();
      return { raw: info };
    } catch (error) {
      logger.error('Redis info error:', error);
      return {};
    }
  }

  /**
   * Ping Redis server
   */
  async ping(): Promise<boolean> {
    try {
      if (!this.isConnected) return false;
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis ping error:', error);
      return false;
    }
  }

  /**
   * Check health with optional key
   */
  async healthCheck(): Promise<{ healthy: boolean; status: string; canPing: boolean }> {
    try {
      const canPing = await this.ping();
      return {
        healthy: this.getIsConnected() && canPing,
        status: this.getStatus(),
        canPing,
      };
    } catch (error) {
      logger.error('Redis health check error:', error);
      return {
        healthy: false,
        status: 'error',
        canPing: false,
      };
    }
  }

  /**
   * Close Redis connection gracefully
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        logger.info('✅ Redis: Connection closed gracefully');
        this.isConnected = false;
      }
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
  }

  /**
   * Force close Redis connection
   */
  async forceClose(): Promise<void> {
    try {
      if (this.client) {
        this.client.disconnect();
        logger.info('⚠️  Redis: Connection force closed');
        this.isConnected = false;
      }
    } catch (error) {
      logger.error('Error force closing Redis connection:', error);
    }
  }

  /**
   * Get raw Redis client for advanced operations
   */
  getClient(): Redis {
    return this.client;
  }
}

// Export singleton instance
export const redisClient = new RedisClientWrapper();

export default redisClient;
