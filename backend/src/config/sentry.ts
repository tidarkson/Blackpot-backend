import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { config } from './environment';

/**
 * Initialize Sentry for error tracking and performance monitoring
 * Configuration follows best practices for multi-environment setup
 */
export const initSentry = () => {
  // Only initialize Sentry if DSN is provided
  if (!config.SENTRY_DSN) {
    console.warn('⚠️ Sentry DSN not provided - error tracking disabled');
    return;
  }

  Sentry.init({
    // DSN for current environment
    dsn: config.SENTRY_DSN,

    // Environment tracking
    environment: config.SENTRY_ENVIRONMENT || config.NODE_ENV,

    // Enable profiling based on environment
    integrations: [
      nodeProfilingIntegration(),
    ],

    // Trace sensitive data filtering
    denyUrls: [
      // Browser extensions
      /extensions\//i,
      // Admin panel (optional)
      /admin/i,
    ],

    // Sample rates for different event types
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
    profilesSampleRate: config.SENTRY_PROFILES_SAMPLE_RATE,

    // Release tracking for better error grouping
    release: config.APP_VERSION || '1.0.0',

    // Attach stack traces to all messages
    attachStacktrace: true,

    // Maximum breadcrumbs to capture
    maxBreadcrumbs: 50,

    // Before sending - filter sensitive data
    beforeSend(event, hint) {
      const sensitiveParams = ['password', 'token', 'api_key', 'secret', 'credit_card'];

      // Filter sensitive data from errors
      if (event.request) {
        // Remove sensitive headers
        if (event.request.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['authorization'];
          delete event.request.headers['Cookie'];
          delete event.request.headers['cookie'];
        }

        // Remove sensitive query parameters
        if (event.request.url) {
          sensitiveParams.forEach((param) => {
            const regex = new RegExp(`[?&]${param}=[^&]*`, 'gi');
            event.request!.url = event.request!.url!.replace(regex, '');
          });
        }
      }

      // Filter sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data) {
            const filtered: Record<string, any> = { ...breadcrumb.data };
            sensitiveParams.forEach((param) => {
              delete filtered[param];
              delete filtered[`${param}_confirm`];
            });
            return { ...breadcrumb, data: filtered };
          }
          return breadcrumb;
        });
      }

      // Filter database query parameters
      if (event.message?.includes('SELECT') || event.message?.includes('INSERT')) {
        // Don't send raw SQL in production
        if (config.NODE_ENV === 'production') {
          event.message = '[Database Query]';
        }
      }

      return event;
    },

    // Configure HTTP status code handling
    ignoreErrors: [
      // Ignore 4xx client errors that aren't application errors
      /^\d+\s+\w+\s+/,
    ],

    // Debug mode (only in development)
    debug: config.NODE_ENV === 'development' && config.SENTRY_DEBUG === 'true',
  });

  console.log(`✅ Sentry initialized for ${config.SENTRY_ENVIRONMENT || config.NODE_ENV} environment`);
};

/**
 * Capture a custom exception in Sentry
 * Useful for errors in try-catch blocks
 */
export const captureException = (error: Error, context?: Record<string, any>) => {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setContext(key, value);
      });
    }
    Sentry.captureException(error);
  });
};

/**
 * Capture a custom message in Sentry
 * Useful for tracking important events
 */
export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info') => {
  Sentry.captureMessage(message, level as Sentry.SeverityLevel);
};

/**
 * Add a breadcrumb to track user actions
 * Useful for understanding the context leading up to an error
 */
export const addBreadcrumb = (
  message: string,
  category: string = 'user',
  data?: Record<string, any>,
  level: Sentry.SeverityLevel = 'info'
) => {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
};

/**
 * Set user context for error reports
 * Should be called after user authentication
 */
export const setSentryUserContext = (userId: string, restaurantId: string, userRole: string, email?: string) => {
  Sentry.setUser({
    id: userId,
    email: email || undefined,
    username: `${restaurantId}-${userRole}`,
    'restaurant_id': restaurantId,
    'role': userRole,
  });
};

/**
 * Clear user context (useful on logout)
 */
export const clearSentryUserContext = () => {
  Sentry.setUser(null);
};

/**
 * Add custom tags to errors for better categorization
 */
export const addSentryTag = (key: string, value: string) => {
  Sentry.setTag(key, value);
};

/**
 * Add multiple tags at once
 */
export const addSentryTags = (tags: Record<string, string>) => {
  Object.entries(tags).forEach(([key, value]) => {
    Sentry.setTag(key, value);
  });
};

/**
 * Start a span/transaction for performance monitoring
 * Useful for tracking critical operations like order processing
 */
export const startSentryTransaction = (name: string, operation: string = 'operation') => {
  // Create a performance monitoring span
  const span = {
    name,
    op: operation,
    startTime: Date.now(),
    end: function() {
      const duration = Date.now() - this.startTime;
      if (duration > 1000) {
        captureMessage(`Slow ${operation}: ${name} took ${duration}ms`, 'warning');
      }
    },
    startChild: function(options: any) {
      return {
        ...options,
        startTime: Date.now(),
        end: function() {
          const duration = Date.now() - this.startTime;
          addBreadcrumb(`${options.op}: ${duration}ms`, 'performance');
        },
      };
    },
  };
  return span;
};

/**
 * Capture performance metrics for slow database queries
 */
export const captureSlowQuery = (query: string, duration: number, threshold: number = 1000) => {
  if (duration > threshold) {
    captureMessage(`Slow Query Detected (${duration}ms): ${query.substring(0, 50)}...`, 'warning');
  }
};

export default Sentry;
