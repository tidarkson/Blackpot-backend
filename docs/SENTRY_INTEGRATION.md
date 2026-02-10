# Sentry Integration Guide - BlackPot Backend

## Overview

Sentry has been integrated into the BlackPot backend for **real-time error tracking, performance monitoring, and user context tracking**. This reduces bug detection time from days to seconds and provides complete visibility into production issues.

## Features Implemented

### ✅ Error Tracking
- **Uncaught Exceptions**: All unhandled exceptions are automatically captured
- **Unhandled Promise Rejections**: Async errors are tracked
- **HTTP Errors**: 5xx server errors with full request context
- **Custom Error Logging**: Specialized handlers for domain-specific errors

### ✅ Performance Monitoring
- **Transaction Tracking**: Monitor duration of critical operations
- **Slow Database Queries**: Automatically flagged if > 1 second
- **API Response Times**: Track request duration and flag slow endpoints
- **Profiling**: CPU and memory profiling for heavy operations

### ✅ Context & Categorization
- **User Context**: User ID, restaurant ID, role in every error
- **Custom Tags**: Environment, feature, severity for better grouping
- **Breadcrumbs**: Timeline of actions leading to error
- **Multi-tenant Isolation**: Restaurant data never mixed up

### ✅ Sensitive Data Filtering
- **Automatic**: Passwords, tokens, credit cards filtered
- **Headers**: Authorization and Cookie headers removed
- **Query Parameters**: Sensitive params stripped from URLs
- **Request Body**: Custom filters for PII

## Setup Instructions

### 1. Get Your Sentry DSN

1. Go to [sentry.io](https://sentry.io)
2. Create account or log in
3. Create a new project for Node.js
4. Copy the DSN (looks like: `https://key@organization.ingest.sentry.io/project-id`)

### 2. Configure Environment Variables

Add to your `.env` file:

```env
# Required
SENTRY_DSN=https://your-key@your-organization.ingest.sentry.io/project-id
SENTRY_ENVIRONMENT=development

# Optional (with defaults shown)
SENTRY_TRACES_SAMPLE_RATE=1.0          # development: 1.0, staging: 0.1, production: 0.01
SENTRY_PROFILES_SAMPLE_RATE=0.1        # Set to 0 to disable profiling
SENTRY_DEBUG=false                      # Set to true only for debugging
APP_VERSION=1.0.0
```

### 3. Environment-Specific Configuration

**Development**:
```env
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=1.0          # Capture all transactions
SENTRY_PROFILES_SAMPLE_RATE=0.1        # Profile 10% of operations
SENTRY_DEBUG=false
```

**Staging**:
```env
SENTRY_ENVIRONMENT=staging
SENTRY_TRACES_SAMPLE_RATE=0.1          # Capture 10% of transactions
SENTRY_PROFILES_SAMPLE_RATE=0.05       # Profile 5% of operations
SENTRY_DEBUG=false
```

**Production**:
```env
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.01         # Capture 1% of transactions
SENTRY_PROFILES_SAMPLE_RATE=0.01       # Profile 1% of operations
SENTRY_DEBUG=false
```

## How It Works

### Middleware Chain

Sentry is initialized with proper middleware ordering:

```
1. initSentry()                          ← Initialize Sentry
   ↓
2. sentryRequestMiddleware               ← Capture HTTP request info
   ↓
3. Global middleware (helmet, cors, etc)
   ↓
4. sentryContextMiddleware               ← Add user/tenant context
   ↓
5. sentryDatabaseMonitoringMiddleware    ← Monitor DB queries
   ↓
6. Route handlers
   ↓
7. sentryErrorCaptureMiddleware          ← Capture errors with context
   ↓
8. sentryErrorMiddleware                 ← Sentry exception handler
   ↓
9. errorHandler                          ← Application error handler
```

### Error Capture Workflow

```
Error occurs
    ↓
Sentry middleware catches it
    ↓
Extract user context (ID, restaurant, role)
    ↓
Add tags (endpoint, status, etc)
    ↓
Add breadcrumbs (action history)
    ↓
Filter sensitive data
    ↓
Send to Sentry
    ↓
Alert (if configured)
```

## Usage Examples

### 1. Track User Actions (In Auth Controller)

```typescript
import { setSentryUserContext, clearSentryUserContext } from '@/config/sentry';

// After successful login
setSentryUserContext(user.id, user.restaurantId, user.role, user.email);

// On logout
clearSentryUserContext();
```

### 2. Log Errors in Try-Catch

```typescript
import SentryErrorHandler from '@/utils/sentryErrorHandler';

try {
  await processOrder(orderId);
} catch (error) {
  SentryErrorHandler.logCriticalBusinessError(
    'order_processing',
    orderId,
    error as Error,
    { status: 'payment_failed', retry_count: 2 }
  );
  throw error;
}
```

### 3. Monitor Payment Operations

```typescript
import SentryErrorHandler from '@/utils/sentryErrorHandler';

try {
  const charge = await stripe.charges.create({ ... });
  return charge;
} catch (error) {
  SentryErrorHandler.logPaymentError(
    'txn-123',
    99.99,
    error as Error,
    'stripe',
    { retry_available: true }
  );
  throw error;
}
```

### 4. Monitor Database Queries

```typescript
import SentryErrorHandler from '@/utils/sentryErrorHandler';

const startTime = Date.now();
try {
  const data = await prisma.orders.findMany({ ... });
  const duration = Date.now() - startTime;
  
  // Logs warning if > 1 second
  SentryErrorHandler.logSlowOperation('order_query', duration);
  return data;
} catch (error) {
  const duration = Date.now() - startTime;
  SentryErrorHandler.logDatabaseError(
    'SELECT * FROM orders...',
    duration,
    error as Error
  );
  throw error;
}
```

### 5. Track Complex Operations

```typescript
import { startSentryTransaction, addBreadcrumb } from '@/config/sentry';

const transaction = startSentryTransaction('Report Generation', 'report');

try {
  addBreadcrumb('Fetching data...', 'operation');
  const data = await fetchReportData();
  
  addBreadcrumb('Generating PDF...', 'operation');
  const pdf = await generatePDF(data);
  
  transaction.finish();
  return pdf;
} catch (error) {
  transaction.finish();
  throw error;
}
```

### 6. Audit Trail for User Actions

```typescript
import SentryErrorHandler from '@/utils/sentryErrorHandler';

SentryErrorHandler.trackUserAction(
  'order_created',
  userId,
  restaurantId,
  {
    order_id: orderId,
    total_amount: 99.99,
    items_count: 5,
    payment_method: 'stripe'
  }
);
```

### 7. Validate Data Integrity

```typescript
import SentryErrorHandler from '@/utils/sentryErrorHandler';

const order = await getOrder(orderId);
const itemsTotal = order.items.reduce((sum, i) => sum + i.qty, 0);

if (itemsTotal !== order.totalQuantity) {
  SentryErrorHandler.logDataIntegrityError(
    'Order',
    orderId,
    'Quantity mismatch detected',
    undefined,
    { expected: order.totalQuantity, actual: itemsTotal }
  );
}
```

## Sentry Dashboard

### Viewing Errors

1. Go to [sentry.io](https://sentry.io)
2. Click on your project
3. See errors grouped by type, feature, and environment
4. Click on an error to see:
   - User affected
   - Browser/OS
   - Device type
   - Full error trace
   - Breadcrumb trail
   - Related events

### Setting Up Alerts

#### Email Alerts (Free)
1. Go to Alerts → Create Alert
2. Conditions: `Event count is greater than X in Y minutes`
3. Action: `Send email to team`

#### Slack Integration
1. Go to Integrations → Slack
2. Connect your Slack workspace
3. Go to Alerts → Create Alert
4. Action: `Post to Slack channel`

#### On-Call Paging (PagerDuty)
1. Go to Integrations → PagerDuty
2. Connect your account
3. Go to Alerts → Create Alert
4. Action: `Trigger PagerDuty incident`

### Creating Custom Alerts

**Alert for Critical Payment Errors**:
- Condition: `Error tag matches payment AND level is error`
- Condition: `Environment is production`
- Action: `Page on-call engineer`

**Alert for Slow Queries**:
- Condition: `Category matches database AND duration > 5000ms`
- Action: `Post to #performance-team`

**Alert for Authentication Failures**:
- Condition: `Error tag matches authentication AND level is warning`
- Condition: `Occurrences > 10 in 15 minutes`
- Action: `Send email`

## Best Practices

### 1. Set User Context Early
- Set after authentication success
- Includes: user ID, restaurant ID, role, email
- Helps identify affected users

### 2. Use Breadcrumbs Strategically
```typescript
// Good: Track important business decisions
addBreadcrumb('Inventory verification passed', 'business_logic');
addBreadcrumb('Payment processing started', 'payment');

// Avoid: Noisy, duplicate breadcrumbs
addBreadcrumb('Database connection opened', 'debug');
addBreadcrumb('Variable x = 5', 'debug');
```

### 3. Categorize Errors with Tags
```typescript
addSentryTags({
  feature: 'orders',           // What feature had the issue
  action: 'create',            // What action was being done
  severity: 'critical',        // How bad is this
  restaurant_tier: 'premium',  // Business context
  region: 'us-east-1',         // Infrastructure context
});
```

### 4. Filter Sensitive Data
- **Don't include**: Passwords, credit card numbers, tokens
- **Don't include**: Personal information (email in PII fields)
- **Safe to include**: User ID, restaurant ID (masked if needed)
- **Safe to include**: Order amounts, timestamps

### 5. Sample Rates Strategy
```
Development:  100% (catch everything)
    ↓
Staging:      10% (reasonable sample)
    ↓
Production:   1-5% (reduce costs while catching critical issues)

More traffic = Lower percentage needed
```

### 6. Monitor the Monitors
- Check Sentry daily during development
- Set up dashboards for error trends
- Review unresolved errors weekly
- Correlate with feature releases

## Performance Considerations

### Impact on Response Time
- **Negligible**: < 5ms per request
- **Sampling** reduces overhead in production
- **Async**: Errors sent in background

### Storage/Quota
- **Free Plan**: 5,000 events/month
- **Growth Plan**: Starting $70/month
- **Considerations**:
  - Lower sample rates in production
  - Ignore healthcheck endpoints
  - Filter known third-party errors

### Optimization Tips
1. Use sampling appropriately for your environment
2. Exclude known non-critical errors
3. Batch similar errors with fingerprinting
4. Archive old errors quarterly

## Troubleshooting

### Errors Not Appearing in Sentry

1. **Check DSN is correct**
   ```bash
   # Verify in logs during startup
   ✅ Sentry initialized for development environment
   ```

2. **Check environment variables**
   ```bash
   echo $SENTRY_DSN  # Should show your DSN
   ```

3. **Test Sentry manually**
   ```typescript
   import Sentry from '@sentry/node';
   
   try {
     throw new Error('Test error');
   } catch (error) {
     Sentry.captureException(error);
   }
   ```

4. **Check firewall/network**
   ```bash
   curl https://your-organization.ingest.sentry.io/
   # Should get a response
   ```

### Missing User Context

1. **Ensure user middleware runs before routes**
2. **Call `setSentryUserContext()` after auth**
3. **Check user is actually authenticated**

### High Error Volume

1. **Lower sample rates in production**
2. **Increase alert thresholds**
3. **Filter out expected errors**

## Integration with Other Tools

### Slack
```env
# In Sentry Integrations → Slack
# Get webhook URL and use in your error handler
```

### GitHub (Release Tracking)
```env
SENTRY_GITHUB_TOKEN=github_token_here
# Link errors to GitHub commits
```

### DataDog (Supplement Monitoring)
```env
DATADOG_API_KEY=your_key
# Forward Sentry events to DataDog for correlation
```

## Compliance & Security

### Data Retention
- Free: 90 days
- Paid: Configurable from 7 days to forever

### GDPR Compliance
- User IP addresses stripped by default
- EU data center available
- Right to deletion supported

### PII Handling
- Automatic filtering of passwords, tokens, emails (in certain fields)
- Custom scrubbing rules available
- Never store raw credit card data

## Team Checklist

- [ ] Sentry account created
- [ ] DSN added to `.env` files
- [ ] Middleware integrated
- [ ] Error handlers implemented in key services
- [ ] User context set on authentication
- [ ] Alerts configured in Slack
- [ ] Team trained on dashboard
- [ ] OnCall paging setup for critical errors
- [ ] Performance baselines established
- [ ] Quarterly review process defined

## Resources

- **Sentry Docs**: https://docs.sentry.io/
- **Node.js SDK**: https://docs.sentry.io/platforms/node/
- **Performance Monitoring**: https://docs.sentry.io/product/performance/
- **API Integration**: https://docs.sentry.io/api/

## Support

For issues or questions:
1. Check Sentry logs: `/logs/error.log`
2. Check console during startup
3. Review [Sentry troubleshooting](https://docs.sentry.io/product/issues/error-tracking/)
4. Test with: `TODO: Create test endpoint`

---

**Last Updated**: February 10, 2026
**Maintained By**: DevOps Team
**Review Date**: Quarterly
