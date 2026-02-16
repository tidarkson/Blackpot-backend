import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../utils/redisClient';
import logger from '../config/logger';
import { config } from '../config/environment';

/**
 * Custom key generator that uses user ID if authenticated
 * Returns undefined for IP-based limiting to use express-rate-limit's
 * built-in IPv6-safe IP extraction (ipKeyGenerator)
 */
const keyGenerator = (req: Request): string | undefined => {
  // Extract user ID from JWT token or session
  const userId = (req.user as any)?.id;
  
  // Extract restaurant ID for multi-tenant isolation
  const restaurantId = (req.user as any)?.restaurantId || (req.headers['x-restaurant-id'] as string);
  
  // Use user ID if available for authenticated requests
  if (userId && restaurantId) {
    return `rate-limit:${restaurantId}:user:${userId}`;
  }
  
  // For test requests with X-Test-ID, use that for isolation
  const testId = req.headers['x-test-id'] as string;
  if (testId) {
    return `rate-limit:test:${testId}`;
  }
  
  // Return undefined to use express-rate-limit's built-in IP extraction
  // which handles IPv6 properly
  return undefined;
};

/**
 * Check if user has premium account (override rate limits)
 */
const isPremiumAccount = (req: Request): boolean => {
  try {
    const user = (req.user as any);
    if (!user) return false;
    
    // Check for premium tier in user object
    // Adjust this based on your user model
    return user.isPremium === true || user.accountTier === 'premium' || user.accountTier === 'enterprise';
  } catch {
    return false;
  }
};

/**
 * Get rate limit multiplier for premium accounts (allows higher limits)
 */
const getPremiumMultiplier = (req: Request): number => {
  // Premium accounts get 3x the limit
  // Enterprise accounts get 5x the limit
  if (!isPremiumAccount(req)) return 1;
  
  const user = (req.user as any);
  if (user?.accountTier === 'enterprise') return 5;
  return 3;
};

/**
 * Create a custom error responder with a specific message
 */
const createErrorResponder = (defaultMessage: string, endpointType: string = 'general') => {
  return (req: Request, res: Response, options: any): void => {
    const retryAfter = options.retryAfter || Math.ceil((options.windowMs || 15 * 60 * 1000) / 1000);
    
    const errorResponse = {
      error: 'RATE_LIMIT_EXCEEDED',
      message: defaultMessage || 'Too many requests, please try again later.',
      retryAfter: retryAfter,
      resetTime: new Date(Date.now() + (options.windowMs || 15 * 60 * 1000)).toISOString(),
      statusCode: 429,
      upgradeHint: !isPremiumAccount(req) ? 'Upgrade to premium for higher rate limits' : undefined,
    };
    
    res.set('Retry-After', String(retryAfter));
    res.status(429).json(errorResponse);
    
    // Log rate limit violation with detailed security monitoring
    const userId = (req.user as any)?.id || 'anonymous';
    const userTier = (req.user as any)?.accountTier || 'free';
    
    logger.warn('🚨 Rate limit exceeded', {
      userId,
      accountTier: userTier,
      isPremium: isPremiumAccount(req),
      ip: req.ip,
      path: req.path,
      method: req.method,
      endpoint: `${req.method} ${req.path}`,
      endpointType,
      timestamp: new Date().toISOString(),
    });
  };
};

/**
 * Standardized error response handler (fallback)
 */
const errorResponder = createErrorResponder('Too many requests, please try again later.', 'general');

/**
 * Create rate limiter store (Redis or memory-based)
 * Returns store config object for express-rate-limit
 */
const createStore = (prefix: string) => {
  if (config.REDIS_ENABLED) {
    try {
      if (redisClient.getIsConnected()) {
        const redisInstance = redisClient.getClient();
        return new RedisStore({
          sendCommand: async (...args: string[]): Promise<any> => {
            const [command, ...cmdArgs] = args;
            // Use the appropriate method based on command
            if (command && typeof command === 'string') {
              const cmd = command.toLowerCase();
              if (cmd === 'incr') {
                return await redisInstance.incr(cmdArgs[0]);
              } else if (cmd === 'expire') {
                return await redisInstance.expire(cmdArgs[0], parseInt(cmdArgs[1]));
              } else if (cmd === 'get') {
                return await redisInstance.get(cmdArgs[0]);
              }
            }
            return null;
          },
          prefix,
        });
      } else {
        logger.info(`Redis not connected for ${prefix}, using default in-memory store`);
      }
    } catch (error) {
      logger.warn(`Failed to create Redis store for ${prefix}: ${error}, using default in-memory store`);
    }
  }
  // Return undefined to use express-rate-limit's default in-memory store
  return undefined;
};

/**
 * Global API limiter - applied to all routes
 * This provides baseline protection for the entire API
 */
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: keyGenerator as any,
  handler: errorResponder,
  skip: (req: Request): boolean => {
    // Don't apply rate limiting to health checks
    return req.path === '/health' || req.path === '/api/health';
  },
  store: createStore('rate-limit:'),
});

/**
 * Authentication endpoints rate limiter
 * ✅ Acceptance Criteria: 5 attempts per 15 minutes
 * Rationale: Strict limits to prevent brute force attacks on login
 * Premium: 3x multiplier = 15 attempts per 15 minutes
 */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req: Request): number => isPremiumAccount(req) ? 15 : 5, // 5 attempts per 15 minutes (3x for premium)
  message: 'Too many login attempts. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Too many login attempts. Please try again after 15 minutes.', 'authentication'),
  skipSuccessfulRequests: true, // Don't count successful logins
  store: createStore('rate-limit:auth:'),
});

/**
 * Registration endpoint rate limiter
 * ✅ Acceptance Criteria: 3 attempts per hour
 * Rationale: Moderate limits to prevent spam account creation and abuse
 * Premium: 3x multiplier = 9 registrations per hour
 */
export const registrationLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req: Request): number => isPremiumAccount(req) ? 9 : 3, // 3 registrations per hour (3x for premium)
  message: 'Too many accounts created from this IP. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Too many accounts created from this location. Please try again later.', 'authentication'),
  skipSuccessfulRequests: false,

  store: createStore('rate-limit:register:'),
});

/**
 * Password reset endpoint rate limiter
 * ✅ Acceptance Criteria: 3 attempts per hour
 * Rationale: Very strict to prevent account takeover via reset email spam
 * Premium: 3x multiplier = 9 attempts per hour
 */
export const passwordResetLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req: Request): number => isPremiumAccount(req) ? 9 : 3, // 3 requests per hour (3x for premium)
  message: 'Too many password reset attempts. Please try again after 1 hour.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Too many password reset attempts. Please try again after 1 hour.', 'authentication'),
  skipSuccessfulRequests: true, // Don't count successful password resets
  store: createStore('rate-limit:password-reset:'),
});

/**
 * Public endpoints rate limiter (login, signup, forgot password)
 * Stricter than general API limiter to protect sensitive endpoints
 */
export const publicEndpointLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: 'Too many requests to this endpoint. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: errorResponder,
  store: createStore('rate-limit:public:'),
});

/**
 * Authenticated endpoints rate limiter
 * Higher limits for authenticated users - trust established
 */
export const authenticatedEndpointLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per account
  message: 'You have exceeded the API rate limit. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: errorResponder,
  skip: (req: Request): boolean => {
    // Only apply to authenticated users
    return !(req.user || (req as any).session);
  },
  store: createStore('rate-limit:auth-endpoint:'),
});

/**
 * Order creation rate limiter
 * ✅ Acceptance Criteria: 100 per minute
 * Rationale: Protect against order flooding/API abuse
 * Premium: 3x multiplier = 300 orders per minute
 */
export const orderCreationLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req: Request): number => isPremiumAccount(req) ? 300 : 100, // 100 orders per minute (3x for premium)
  message: 'Order creation limit exceeded. Please try again shortly.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Order creation limit exceeded. Too many orders being created. Please wait before creating more orders.', 'order_management'),
  store: createStore('rate-limit:orders:create:'),
});

/**
 * Order retrieval rate limiter
 * ✅ Acceptance Criteria: 200 per minute (derived from GET endpoints)
 * Rationale: Allow higher read limits than write operations
 * Premium: 3x multiplier = 600 per minute
 */
export const orderRetrievalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req: Request): number => isPremiumAccount(req) ? 600 : 200, // 200 reads per minute (3x for premium)
  message: 'Order retrieval limit exceeded. Please try again shortly.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Order retrieval limit exceeded. Please wait before making more requests.', 'order_management'),
  store: createStore('rate-limit:orders:read:'),
});

/**
 * Order update rate limiter
 * ✅ Acceptance Criteria: 50 per minute
 * Rationale: Lower than creation to prevent excessive updates
 * Premium: 3x multiplier = 150 per minute
 */
export const orderUpdateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req: Request): number => isPremiumAccount(req) ? 150 : 50, // 50 updates per minute (3x for premium)
  message: 'Order update limit exceeded. Please try again shortly.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Order update limit exceeded. Please wait before making more changes.', 'order_management'),
  store: createStore('rate-limit:orders:update:'),
});

/**
 * Report generation rate limiter
 * ✅ Acceptance Criteria: 10 per hour
 * Rationale: Prevent resource exhaustion from expensive report operations
 * Premium: 3x multiplier = 30 per hour
 */
export const reportGenerationLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req: Request): number => isPremiumAccount(req) ? 30 : 10, // 10 reports per hour (3x for premium)
  message: 'Report generation limit exceeded. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Report generation limit exceeded. Report generation consumes significant resources. Please try again later.', 'reports'),
  store: createStore('rate-limit:reports:generate:'),
});

/**
 * Report viewing rate limiter
 * ✅ Acceptance Criteria: 50 per minute (for sales and inventory reports)
 * Rationale: Allow higher read limits for report consumption/viewing
 * Premium: 3x multiplier = 150 per minute
 */
export const reportViewLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req: Request): number => isPremiumAccount(req) ? 150 : 50, // 50 report views per minute (3x for premium)
  message: 'Report viewing limit exceeded. Please try again shortly.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Report viewing limit exceeded. Please wait before viewing additional reports.', 'reports'),
  store: createStore('rate-limit:reports:view:'),
});

/**
 * Payment processing rate limiter
 * Prevent payment processing abuse/fraud attempts
 */
export const paymentProcessingLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 payment attempts per minute per account
  message: 'Payment processing limit exceeded. Please try again shortly.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: errorResponder,
  store: createStore('rate-limit:payments:'),
});

/**
 * Admin endpoints rate limiter
 * ✅ Acceptance Criteria: 30 per minute per account
 * Rationale: Strict limits for administrative operations to prevent abuse
 * Premium: 3x multiplier = 90 per minute (enterprise can rely on premium tier)
 */
export const adminEndpointLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req: Request): number => isPremiumAccount(req) ? 90 : 30, // 30 admin ops per minute (3x for premium)
  message: 'Admin operation limit exceeded. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Admin operation limit exceeded. Administrative operations are rate limited. Please wait before attempting more operations.', 'admin'),
  store: createStore('rate-limit:admin:'),
});

/**
 * Email sending rate limiter
 * Prevent email sending exploits
 */
export const emailSendingLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 emails per hour per restaurant
  message: 'Email sending limit exceeded. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: errorResponder,
  store: createStore('rate-limit:emails:send:'),
});

/**
 * API export rate limiter
 * Prevent bulk data export abuse
 */
export const exportDataLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 exports per hour per account
  message: 'Data export limit exceeded. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: errorResponder,
  store: createStore('rate-limit:exports:'),
});

/**
 * Search rate limiter
 * Prevent search-based enumeration attacks
 */
export const searchLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 searches per minute
  message: 'Search rate limit exceeded. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: errorResponder,
  store: createStore('rate-limit:search:'),
});

/**
 * Inventory item creation rate limiter
 * ✅ Acceptance Criteria: 100 per minute
 * Rationale: Protect against inventory flooding/manipulation
 * Premium: 3x multiplier = 300 per minute
 */
export const inventoryCreationLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req: Request): number => isPremiumAccount(req) ? 300 : 100, // 100 items per minute (3x for premium)
  message: 'Inventory creation rate limit exceeded. Please try again shortly.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Inventory creation rate limit exceeded. Too many inventory items being created. Please wait before creating more items.', 'inventory'),
  store: createStore('rate-limit:inventory:create:'),
});

/**
 * Inventory retrieval rate limiter
 * ✅ Acceptance Criteria: 200 per minute (for GET operations)
 * Rationale: Allow higher read limits for inventory overview/search
 * Premium: 3x multiplier = 600 per minute
 */
export const inventoryRetrievalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req: Request): number => isPremiumAccount(req) ? 600 : 200, // 200 reads per minute (3x for premium)
  message: 'Inventory retrieval limit exceeded. Please try again shortly.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Inventory retrieval limit exceeded. Please wait before making more requests.', 'inventory'),
  store: createStore('rate-limit:inventory:read:'),
});

/**
 * Inventory update rate limiter
 * ✅ Acceptance Criteria: 100 per minute
 * Rationale: Balance between creating and modifying inventory (both critical operations)
 * Premium: 3x multiplier = 300 per minute
 */
export const inventoryUpdateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req: Request): number => isPremiumAccount(req) ? 300 : 100, // 100 updates per minute (3x for premium)
  message: 'Inventory update rate limit exceeded. Please try again shortly.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyGenerator as any,
  handler: createErrorResponder('Inventory update rate limit exceeded. Too many changes being made. Please wait before making more updates.', 'inventory'),
  store: createStore('rate-limit:inventory:update:'),
});

export default {
  apiLimiter,
  authLimiter,
  registrationLimiter,
  passwordResetLimiter,
  publicEndpointLimiter,
  authenticatedEndpointLimiter,
  orderCreationLimiter,
  orderRetrievalLimiter,
  orderUpdateLimiter,
  reportGenerationLimiter,
  reportViewLimiter,
  paymentProcessingLimiter,
  adminEndpointLimiter,
  inventoryCreationLimiter,
  inventoryRetrievalLimiter,
  inventoryUpdateLimiter,
  emailSendingLimiter,
  exportDataLimiter,
  searchLimiter,
};
