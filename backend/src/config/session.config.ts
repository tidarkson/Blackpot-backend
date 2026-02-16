import session, { SessionOptions } from 'express-session';
import RedisStore from 'connect-redis';
import { redisClient } from '../utils/redisClient';
import { config } from './environment';
import logger from './logger';

/**
 * Session configuration for Redis-backed session storage
 * Supports multi-server deployments with persistent sessions
 */

// Session store instance - will be initialized after Redis connects
let sessionStore: any = null;

/**
 * Get or create the Redis session store
 * Falls back to memory store if Redis is not available
 */
export function getSessionStore(): any {
  if (!sessionStore) {
    // Check if Redis is available
    if (redisClient.getIsConnected()) {
      try {
        // Use the IORedis client from redisClient
        const redisInstance = redisClient.getClient();

        sessionStore = new RedisStore({
          client: redisInstance as any,
          prefix: 'session:', // Redis key prefix for sessions
          serializer: {
            stringify: (obj: any) => JSON.stringify(obj),
            parse: (str: string) => {
              try {
                return JSON.parse(str);
              } catch {
                return {};
              }
            },
          },
        });

        logger.info('✅ Redis session store initialized');
        return sessionStore;
      } catch (error) {
        logger.warn(`⚠️  Failed to initialize Redis session store: ${error}. Falling back to memory store.`);
      }
    }

    // Fallback to memory-based session store when Redis is unavailable
    // Note: This should only be used for development. In production, use Redis.
    const memoryStore = require('express-session').MemoryStore;
    sessionStore = new memoryStore();
    logger.warn('⚠️  Using in-memory session store. This is suitable for development only. For production, ensure Redis is available.');
  }

  return sessionStore;
}

/**
 * Express session configuration
 * Provides secure, stateless session management for multi-server deployments
 */
export const sessionConfig: SessionOptions = {
  store: undefined, // Will be set during app initialization
  secret: config.SESSION_SECRET || config.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'blackpot-session',
  proxy: true, // Trust proxy (important in production behind reverse proxy/load balancer)
  cookie: {
    secure: config.NODE_ENV === 'production', // Secure cookies in production
    httpOnly: true, // Prevent client-side JS from accessing the cookie
    sameSite: 'strict', // Prevent CSRF attacks
    maxAge: config.SESSION_TIMEOUT_MS, // 24 hours by default
    domain: config.NODE_ENV === 'production' ? config.COOKIE_DOMAIN : undefined,
  },
};

/**
 * Initialize session configuration with the Redis store
 * Must be called after Redis is connected
 */
export function initializeSessionConfig(): SessionOptions {
  if (!config.REDIS_ENABLED) {
    logger.warn('⚠️  Redis is disabled. Session store will fall back to memory (not suitable for production).');
  }

  const config_with_store: SessionOptions = {
    ...sessionConfig,
    store: getSessionStore(),
  };

  return config_with_store;
}

/**
 * Session fingerprinting for security
 * Creates a hash of user device/browser info to prevent session hijacking
 */
export function generateSessionFingerprint(req: any): string {
  const userAgent = req.get('user-agent') || '';
  const acceptLanguage = req.get('accept-language') || '';
  const ipAddress = req.ip || req.socket.remoteAddress || '';

  // Create a simple fingerprint
  const fingerprint = `${userAgent}|${acceptLanguage}|${ipAddress}`;
  return Buffer.from(fingerprint).toString('base64');
}

/**
 * Validate session fingerprint to detect potential hijacking
 */
export function validateSessionFingerprint(
  current: string,
  stored: string,
  strictMode: boolean = true
): boolean {
  if (!strictMode) {
    // In non-strict mode, accept any fingerprint (lenient validation)
    return true;
  }

  // In strict mode, fingerprints must match exactly
  return current === stored;
}

/**
 * Session metadata types
 */
export interface SessionData {
  user_id: string;
  restaurant_id: string;
  role: string;
  email: string;
  login_time: number;
  last_activity: number;
  ip_address: string;
  fingerprint: string;
  rememberMe: boolean;
  deviceId?: string;
}

/**
 * Get session timeout based on "remember me" setting
 */
export function getSessionTimeout(rememberMe: boolean): number {
  if (rememberMe) {
    return config.REMEMBER_ME_TIMEOUT_MS; // 30 days
  }
  return config.SESSION_TIMEOUT_MS; // 24 hours
}

export default sessionConfig;
