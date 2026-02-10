import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { config } from '../config/environment';
import logger from '../config/logger';
import { addBreadcrumb } from '../config/sentry';

/**
 * Sentry request middleware - Captures request context
 * Should be applied early in middleware chain, but after Sentry.init()
 */
export const sentryRequestMiddleware = (req: Request, res: Response, next: NextFunction) => {
  Sentry.setUser({
    id: (req as any).user?.id || 'anonymous',
    email: (req as any).user?.email,
    username: (req as any).user?.username,
  });
  next();
};

/**
 * Custom error handler that sends to Sentry
 * This replaces Sentry.Handlers.errorHandler
 */
export const sentryErrorMiddleware = (err: Error | any, req: Request, res: Response, next: NextFunction) => {
  // Only send server errors to Sentry
  const statusCode = err.status || err.statusCode || 500;
  if (statusCode >= 500) {
    Sentry.captureException(err);
  }
  next(err);
};

/**
 * Custom middleware to capture request context (user, tenant, action)
 * This should be applied after authentication middleware
 */
export const sentryContextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract user information from request
    const userId = (req as any).user?.id || 'anonymous';
    const restaurantId = (req as any).user?.restaurantId || (req as any).headers['x-restaurant-id'] || 'unknown';
    const userRole = (req as any).user?.role || 'guest';
    const userEmail = (req as any).user?.email || undefined;

    // Set user context in Sentry
    if (userId !== 'anonymous') {
      Sentry.setUser({
        id: userId,
        email: userEmail,
        username: `${restaurantId}:${userRole}`,
        'restaurant_id': restaurantId,
        'role': userRole,
      });
    }

    // Add tags for categorization
    Sentry.setTag('endpoint', req.path);
    Sentry.setTag('method', req.method);
    Sentry.setTag('restaurant_id', restaurantId);
    Sentry.setTag('user_role', userRole);

    // Add breadcrumb for the API request
    Sentry.addBreadcrumb({
      category: 'http',
      message: `${req.method} ${req.path}`,
      level: 'info',
      data: {
        method: req.method,
        path: req.path,
        query: req.query,
        status_code: res.statusCode,
      },
    });

    // Measure response time for performance monitoring
    const startTime = Date.now();

    // Hook into response to capture timing
    res.on('finish', () => {
      const duration = Date.now() - startTime;

      // Log slow requests (> 5 seconds in production, > 1 second in development)
      const slowThreshold = config.NODE_ENV === 'production' ? 5000 : 1000;
      if (duration > slowThreshold) {
        const message = `Slow API Request: ${req.method} ${req.path} took ${duration}ms`;
        logger.warn(message);
        addBreadcrumb(message, 'performance', { duration }, 'warning');
      }

      // Add performance metric
      Sentry.addBreadcrumb({
        category: 'performance',
        message: `Request completed in ${duration}ms`,
        level: 'info',
        data: {
          duration,
          status_code: res.statusCode,
          method: req.method,
          path: req.path,
        },
      });
    });

    next();
  } catch (error) {
    logger.error('Error in Sentry context middleware:', error);
    next();
  }
};

/**
 * Middleware to capture and report errors with context
 * This complements the error handler middleware
 */
export const sentryErrorCaptureMiddleware = (err: Error | any, req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id || 'anonymous';
    const restaurantId = (req as any).user?.restaurantId || (req as any).headers['x-restaurant-id'] || 'unknown';
    const userRole = (req as any).user?.role || 'guest';

    // Extract error details
    const errorStatus = err.status || err.statusCode || 500;
    const errorMessage = err.message || 'Unknown error';
    const errorStack = err.stack || '';

    // Create error context
    const errorContext = {
      path: req.path,
      method: req.method,
      query: req.query,
      params: req.params,
      user_id: userId,
      restaurant_id: restaurantId,
      user_role: userRole,
      status_code: errorStatus,
    };

    // Only capture server errors (5xx)
    if (errorStatus >= 500) {
      Sentry.withScope((scope) => {
        // Set error context
        scope.setContext('http_request', errorContext);
        scope.setLevel('error');

        // Set tags for categorization
        scope.setTag('error_source', 'api_error');
        scope.setTag('http_status', errorStatus.toString());
        scope.setTag('endpoint', req.path);
        scope.setTag('restaurant_id', restaurantId);
        scope.setTag('user_role', userRole);

        // Add breadcrumb with error details
        scope.addBreadcrumb({
          category: 'error',
          message: errorMessage,
          level: 'error',
          data: {
            status_code: errorStatus,
            error_type: err.constructor.name,
          },
        });

        // Capture the exception
        Sentry.captureException(err);

        logger.error(`API Error: ${errorStatus} ${errorMessage}`, {
          error: errorMessage,
          status: errorStatus,
          path: req.path,
          user_id: userId,
          restaurant_id: restaurantId,
          stack: errorStack,
        });
      });
    } else {
      // Log client errors without sending to Sentry
      logger.debug(`Client Error: ${errorStatus} ${errorMessage}`, {
        status: errorStatus,
        path: req.path,
      });
    }

    next(err);
  } catch (captureError) {
    logger.error('Error in Sentry error capture middleware:', captureError);
    next(err);
  }
};

/**
 * Middleware to monitor database performance
 * Integrate with Prisma to track slow queries
 */
export const sentryDatabaseMonitoringMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Store start time on request object
    (req as any).dbStartTime = Date.now();

    // Hook into response to add DB performance metrics
    const originalJson = res.json;
    res.json = function (data: any) {
      const dbDuration = Date.now() - (req as any).dbStartTime;

      // Log slow database operations (> 1 second)
      if (dbDuration > 1000) {
        Sentry.addBreadcrumb({
          category: 'database',
          message: `Database query took ${dbDuration}ms`,
          level: 'warning',
          data: {
            duration: dbDuration,
            endpoint: req.path,
            method: req.method,
          },
        });
      }

      return originalJson.call(this, data);
    };

    next();
  } catch (error) {
    logger.error('Error in database monitoring middleware:', error);
    next();
  }
};

export default {
  sentryRequestMiddleware,
  sentryErrorMiddleware,
  sentryContextMiddleware,
  sentryErrorCaptureMiddleware,
  sentryDatabaseMonitoringMiddleware,
};
