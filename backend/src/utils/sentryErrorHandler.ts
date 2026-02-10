import * as Sentry from '@sentry/node';
import logger from '../config/logger';
import { addBreadcrumb, addSentryTags, captureException, captureMessage } from '../config/sentry';

/**
 * Custom error handler that integrates with Sentry
 * Logs errors with full context and user information
 */
export class SentryErrorHandler {
  /**
   * Log a database error with performance metrics
   */
  static logDatabaseError(
    query: string,
    duration: number,
    error: Error,
    context?: Record<string, any>
  ) {
    const message = `Database Error: ${error.message}`;

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('error_source', 'database');
      scope.setTag('query_duration', `${duration}ms`);

      scope.setContext('database', {
        query: query.substring(0, 100), // Truncate query for safety
        duration,
        error: error.message,
        ...context,
      });

      Sentry.captureException(error);

      logger.error(message, {
        query: query.substring(0, 100),
        duration,
        error: error.message,
        ...context,
      });
    });
  }

  /**
   * Log a payment processing error
   */
  static logPaymentError(
    transactionId: string,
    amount: number,
    error: Error,
    provider: string = 'stripe',
    context?: Record<string, any>
  ) {
    const message = `Payment Processing Error: ${error.message}`;

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('error_source', 'payment');
      scope.setTag('payment_provider', provider);
      scope.setTag('severity', 'critical');

      scope.setContext('payment', {
        transaction_id: transactionId,
        amount,
        provider,
        error: error.message,
        ...context,
      });

      // Also send broader alert for payment failures
      captureMessage(
        `CRITICAL: Payment failed - ${provider} - Amount: $${amount}`,
        'error'
      );

      logger.error(message, {
        transaction_id: transactionId,
        amount,
        provider,
        error: error.message,
        ...context,
      });
    });
  }

  /**
   * Log an authentication error
   */
  static logAuthError(
    username: string,
    error: Error,
    errorType:
      | 'invalid_credentials'
      | 'user_not_found'
      | 'account_locked'
      | 'invalid_token' = 'invalid_credentials',
    context?: Record<string, any>
  ) {
    const message = `Authentication Error: ${errorType}`;

    Sentry.withScope((scope) => {
      scope.setLevel('warning'); // Auth errors are typically warnings unless repeated
      scope.setTag('error_source', 'authentication');
      scope.setTag('auth_error_type', errorType);
      scope.setTag('username_hash', this.hashString(username)); // Hash username for privacy

      scope.setContext('authentication', {
        error_type: errorType,
        error: error.message,
        ...context,
      });

      // Only capture repeated attempts as errors
      if (errorType === 'invalid_credentials') {
        addBreadcrumb(`Failed login attempt for ${this.hashString(username)}`, 'auth');
      } else {
        captureMessage(message, 'warning');
      }

      logger.warn(message, {
        error_type: errorType,
        error: error.message,
        username_hash: this.hashString(username),
        ...context,
      });
    });
  }

  /**
   * Log an API validation error
   */
  static logValidationError(
    endpoint: string,
    errors: Array<{ field: string; message: string }>,
    context?: Record<string, any>
  ) {
    const message = `Validation Error on ${endpoint}`;

    // Validation errors are informational, not errors to track in Sentry
    logger.debug(message, {
      endpoint,
      errors,
      ...context,
    });

    addBreadcrumb(message, 'validation', {
      endpoint,
      error_count: errors.length,
    });
  }

  /**
   * Log a critical business process error (e.g., order processing)
   */
  static logCriticalBusinessError(
    process: string,
    entityId: string,
    error: Error,
    context?: Record<string, any>
  ) {
    const message = `CRITICAL Business Process Error: ${process}`;

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('error_source', 'business_logic');
      scope.setTag('process', process);
      scope.setTag('severity', 'critical');

      scope.setContext('business_process', {
        process,
        entity_id: entityId,
        error: error.message,
        ...context,
      });

      Sentry.captureException(error);

      logger.error(message, {
        process,
        entity_id: entityId,
        error: error.message,
        ...context,
      });
    });
  }

  /**
   * Log a slow operation warning
   */
  static logSlowOperation(
    operation: string,
    duration: number,
    threshold: number = 1000,
    context?: Record<string, any>
  ) {
    if (duration > threshold) {
      const message = `Slow Operation: ${operation} took ${duration}ms`;

      addBreadcrumb(message, 'performance', {
        operation,
        duration,
        threshold,
      });

      captureMessage(message, 'warning');

      logger.warn(message, {
        operation,
        duration,
        threshold,
        ...context,
      });
    }
  }

  /**
   * Log an external API error (e.g., Stripe, SendGrid)
   */
  static logExternalServiceError(
    service: string,
    endpoint: string,
    statusCode: number,
    error: Error,
    context?: Record<string, any>
  ) {
    const message = `External Service Error: ${service} - ${endpoint}`;

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('error_source', 'external_service');
      scope.setTag('service', service);
      scope.setTag('http_status', statusCode.toString());

      scope.setContext('external_service', {
        service,
        endpoint,
        status_code: statusCode,
        error: error.message,
        ...context,
      });

      Sentry.captureException(error);

      logger.error(message, {
        service,
        endpoint,
        status_code: statusCode,
        error: error.message,
        ...context,
      });
    });
  }

  /**
   * Log a data integrity error
   */
  static logDataIntegrityError(
    entity: string,
    entityId: string,
    issue: string,
    error?: Error,
    context?: Record<string, any>
  ) {
    const message = `Data Integrity Error: ${entity} - ${issue}`;

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('error_source', 'data_integrity');
      scope.setTag('entity_type', entity);
      scope.setTag('severity', 'high');

      scope.setContext('data_integrity', {
        entity,
        entity_id: entityId,
        issue,
        ...context,
      });

      if (error) {
        Sentry.captureException(error);
      } else {
        captureMessage(message, 'error');
      }

      logger.error(message, {
        entity,
        entity_id: entityId,
        issue,
        ...context,
      });
    });
  }

  /**
   * Track a successful operation
   */
  static trackOperation(
    operation: string,
    duration: number,
    metadata?: Record<string, any>
  ) {
    addBreadcrumb(`Operation completed: ${operation}`, 'operation', {
      duration,
      ...metadata,
    });

    logger.debug(`Operation: ${operation}`, {
      duration,
      ...metadata,
    });
  }

  /**
   * Track a user action for audit trail
   */
  static trackUserAction(
    action: string,
    userId: string,
    restaurantId: string,
    details?: Record<string, any>
  ) {
    addBreadcrumb(`User action: ${action}`, 'user_action', {
      user_id: userId,
      restaurant_id: restaurantId,
      ...details,
    });

    logger.info(`User action: ${action}`, {
      user_id: userId,
      restaurant_id: restaurantId,
      ...details,
    });
  }

  /**
   * Helper: Hash string for privacy (simple implementation)
   */
  private static hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `hash_${Math.abs(hash)}`;
  }
}

export default SentryErrorHandler;
