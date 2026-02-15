import { Request, Response, NextFunction } from 'express';
import { sessionService } from '../services/SessionService';
import { config } from '../config/environment';
import logger from '../config/logger';

/**
 * Session Validation Middleware
 * Validates and extends session on each authenticated request
 */
export const sessionValidator = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Skip session validation for non-authenticated routes
    if (!(req as any).session?.user_id) {
      return next();
    }

    // Validate session integrity
    const isValid = await sessionService.validateSession(req);

    if (!isValid) {
      logger.warn(`Invalid session detected for request to ${req.path}`);
      (req as any).session.destroy((err: any) => {
        if (err) logger.error('Error destroying invalid session:', err);
      });

      return res.status(401).json({
        status: 'error',
        code: 401,
        error: 'INVALID_SESSION',
        message: 'Your session is invalid or expired. Please log in again.',
      });
    }

    // Extend session timeout (sliding window)
    await sessionService.extendSession(req);

    next();
  } catch (error) {
    logger.error('Error in session validator middleware:', error);
    return res.status(500).json({
      status: 'error',
      code: 500,
      error: 'SESSION_VALIDATION_ERROR',
      message: 'An error occurred validating your session.',
    });
  }
};

/**
 * Require Session Middleware
 * Ensures user has a valid session before accessing route
 * Similar to authenticate but relies on Express session instead of JWT
 */
export const requireSession = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Check if session exists and user is authenticated
  if (!(req as any).session?.user_id) {
    return res.status(401).json({
      status: 'error',
      code: 401,
      error: 'NO_SESSION',
      message: 'No active session. Please log in.',
    });
  }

  // Attach session user info to request for convenience
  req.user = {
    userId: (req as any).session.user_id,
    tenantId: (req as any).session.restaurant_id,
    role: (req as any).session.role as any,
    email: (req as any).session.email,
    locationId: '', // Session doesn't have locationId, set empty
  };

  next();
};

/**
 * Session Logging Middleware
 * Logs important session events (creation, destruction, etc.)
 */
export const sessionLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log session events
  const originalSend = res.send;

  res.send = function (data: any) {
    if ((req as any).session && (req as any).session.user_id) {
      const sessionInfo = {
        userId: (req as any).session.user_id,
        sessionId: (req as any).sessionID,
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
      };

      if (res.statusCode >= 400) {
        logger.warn('Session request error:', sessionInfo);
      }
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Concurrent Session Limiter Middleware
 * Optional: Enforce limits on concurrent sessions per user
 */
export const concurrentSessionLimiter = (maxSessions: number = 3) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).session?.user_id) {
      return next();
    }

    try {
      const sessions = await sessionService.getUserSessions((req as any).session.user_id);

      if (sessions.length > maxSessions) {
        logger.warn(
          `User ${(req as any).session.user_id} exceeded max concurrent sessions (${maxSessions})`
        );
        return res.status(429).json({
          status: 'error',
          code: 429,
          error: 'TOO_MANY_SESSIONS',
          message: `Maximum ${maxSessions} concurrent sessions allowed. Please log out from another device.`,
          activeSessions: sessions.length,
        });
      }

      next();
    } catch (error) {
      logger.error('Error in concurrent session limiter:', error);
      // Don't block on error
      next();
    }
  };
};

/**
 * Session Inactivity Timeout Middleware
 * Optional: Custom timeout enforcement beyond Redis TTL
 */
export const sessionInactivityTimeout = (timeoutMs: number = 24 * 60 * 60 * 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).session?.user_id) {
      return next();
    }

    const lastActivity = (req as any).session.last_activity || 0;
    const currentTime = Date.now();
    const inactiveTime = currentTime - lastActivity;

    if (inactiveTime > timeoutMs) {
      logger.info(
        `Session timeout for user ${(req as any).session.user_id} due to inactivity`
      );

      (req as any).session.destroy((err: any) => {
        if (err) logger.error('Error destroying inactive session:', err);
      });

      return res.status(401).json({
        status: 'error',
        code: 401,
        error: 'SESSION_TIMEOUT',
        message: 'Your session has expired due to inactivity. Please log in again.',
      });
    }

    (req as any).session.last_activity = currentTime;
    next();
  };
};

/**
 * Session Security Check Middleware
 * Validates session integrity and security properties
 */
export const sessionSecurityCheck = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!(req as any).session?.user_id) {
    return next();
  }

  // Check if session is secure (in production)
  if (config.NODE_ENV === 'production') {
    const isSecure = req.secure || (req.get('x-forwarded-proto') === 'https');
    if (!isSecure) {
      logger.warn(`Non-secure session detected for user ${(req as any).session.user_id}`);
      return res.status(403).json({
        status: 'error',
        code: 403,
        error: 'INSECURE_SESSION',
        message: 'Session must be established over HTTPS.',
      });
    }
  }

  next();
};

/**
 * Clear Session on Logout Middleware
 * Called explicitly after logout endpoint
 */
export const clearSessionOnLogout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await sessionService.clearSession(req);
    next();
  } catch (error) {
    logger.error('Error clearing session on logout:', error);
    // Still continue to allow logout response
    next();
  }
};

export default {
  sessionValidator,
  requireSession,
  sessionLogger,
  concurrentSessionLimiter,
  sessionInactivityTimeout,
  sessionSecurityCheck,
  clearSessionOnLogout,
};
