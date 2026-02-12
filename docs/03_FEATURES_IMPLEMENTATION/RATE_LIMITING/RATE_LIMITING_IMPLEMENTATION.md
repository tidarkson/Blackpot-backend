# Rate Limiting Implementation Guide

## Overview

This guide covers the complete implementation of rate limiting middleware for the BlackPot Backend, a restaurant management SaaS platform built with Node.js, Express, and PostgreSQL.

## Security Benefits

- **Prevents Brute Force Attacks**: Limits login/password reset attempts
- **Protects Against DDoS**: Limits requests from single IPs or accounts
- **Prevents API Abuse**: Protects expensive operations (reports, exports)
- **Credential Stuffing Protection**: Restricts authentication endpoints
- **Distributed Rate Limiting**: Uses Redis for multi-server deployments

## Architecture

### Components

1. **Redis Configuration** (`backend/src/config/redis.ts`)
   - Redis client initialization and connection management
   - Health checks and graceful error handling
   - Automatic reconnection with exponential backoff

2. **Rate Limiter Middleware** (`backend/src/middleware/rateLimiter.ts`)
   - 13 different rate limiting strategies
   - IP-based and user-based limiting
   - Custom error responses with retry-after headers
   - Support for in-memory fallback if Redis unavailable

3. **Server Integration** (`backend/src/index.ts`)
   - Redis initialization on startup
   - Rate limiter application to specific routes
   - Graceful shutdown handling

4. **Tests** (`backend/tests/RateLimiting.test.ts`)
   - Comprehensive test coverage
   - Tests for all rate limiting strategies
   - Header validation tests
   - Integration tests

## Rate Limiting Strategies

### 1. Global API Limiter
**Applied to**: `/api/` wildcard
**Limit**: 100 requests per 15 minutes per IP/user
**Purpose**: Baseline protection for entire API

```typescript
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  keyGenerator, // IP or user-based
  handler: errorResponder,
});
```

### 2. Auth Limiter
**Applied to**: `POST /api/v1/auth/login`
**Limit**: 5 attempts per 15 minutes per IP
**Purpose**: Prevents brute force attacks
**Behavior**: `skipSuccessfulRequests: true` - only counts failed attempts

```bash
# If you fail 5 times, you're locked out for 15 minutes
# Successful login doesn't consume limit quota
```

### 3. Registration Limiter
**Applied to**: `POST /api/v1/auth/register`
**Limit**: 5 registrations per hour per IP
**Purpose**: Prevents spam account creation
**Behavior**: Counts all attempts (success/failure)

### 4. Password Reset Limiter
**Applied to**: `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`
**Limit**: 3 requests per hour per IP
**Purpose**: Prevents account takeover via password reset spam
**Behavior**: `skipSuccessfulRequests: true` - only counts failures

### 5. Public Endpoint Limiter
**Applied to**: Public API endpoints
**Limit**: 30 requests per minute per IP
**Purpose**: Stricter than general limiter for sensitive endpoints

### 6. Authenticated Endpoint Limiter
**Applied to**: All authenticated endpoints (when user ID found)
**Limit**: 100 requests per minute per user
**Purpose**: Higher trust for authenticated users
**Behavior**: Only applies to authenticated requests

### 7. Order Creation Limiter
**Applied to**: `POST /api/v1/orders`
**Limit**: 50 orders per minute per user
**Purpose**: Prevents order flooding/API abuse

### 8. Report Generation Limiter
**Applied to**: `POST /api/v1/reports/generate`
**Limit**: 10 reports per hour per user
**Purpose**: Protects against resource exhaustion

### 9. Payment Processing Limiter
**Applied to**: `POST /api/v1/payments`
**Limit**: 10 payment attempts per minute per user
**Purpose**: Prevents payment processing abuse

### 10. Admin Endpoint Limiter
**Applied to**: `/api/v1/admin/*`
**Limit**: 30 operations per minute per admin
**Purpose**: Stricter control for sensitive admin operations

### 11. Email Sending Limiter
**Applied to**: Email sending endpoints
**Limit**: 50 emails per hour per restaurant
**Purpose**: Prevents email service abuse

### 12. Data Export Limiter
**Applied to**: Data export/download endpoints
**Limit**: 5 exports per hour per user
**Purpose**: Prevents bulk data extraction attacks

### 13. Search Limiter
**Applied to**: Search endpoints
**Limit**: 60 searches per minute per user
**Purpose**: Prevents enumeration attacks via search

### 14. Inventory Update Limiter
**Applied to**: `POST/PUT /api/v1/inventory/*`
**Limit**: 100 updates per minute per user
**Purpose**: Prevents inventory manipulation

## Key Features

### New - Acceptance Criteria Implementation (Feb 2025)

All requirements have been implemented with comprehensive documentation:

**✅ Authentication Routes:**
- Login: 5 attempts per 15 minutes (Premium: 15)
- Signup: 3 attempts per hour (Premium: 9)
- Password Reset: 3 attempts per hour (Premium: 9)

**✅ Order Routes:**
- Creation: 100 per minute (Premium: 300)
- Reading: 200 per minute (Premium: 600)
- Updates: 50 per minute (Premium: 150)

**✅ Report Routes:**
- Generation: 10 per hour (Premium: 30) - Resource intensive
- Viewing: 50 per minute (Premium: 150) - Read-only

**✅ Inventory Routes:**
- Creation: 100 per minute (Premium: 300)
- Reading: 200 per minute (Premium: 600)
- Updates: 100 per minute (Premium: 300)

**✅ Admin Routes:**
- All operations: 30 per minute (Premium: 90)

**✅ Premium Account Tiers:**
- Free: Base limits
- Premium: 3x multiplier
- Enterprise: 5x multiplier

### 1. User-Based vs IP-Based Rate Limiting

The `keyGenerator` function intelligently chooses the limiting key:

```typescript
const keyGenerator = (req: Request, res: Response): string => {
  const userId = (req.user as any)?.id || (req.session as any)?.userId;
  const restaurantId = (req.user as any)?.restaurantId;
  
  if (userId && restaurantId) {
    return `rate-limit:${restaurantId}:user:${userId}`;
  }
  
  const ip = req.ip || req.socket.remoteAddress;
  return `rate-limit:ip:${ip}`;
};
```

**Benefits**:
- Authenticated users: Limited by their user ID (can't bypass with VPN)
- Unauthenticated users: Limited by IP address
- Multi-tenant isolation: Restaurant ID included in key

### 2. Custom Error Responses

All rate limit violations return HTTP 429 with structured JSON:

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many login attempts. Please try again after 15 minutes.",
  "retryAfter": 847,
  "resetTime": "2024-01-15T14:30:00Z",
  "statusCode": 429
}
```

### 3. Rate Limit Headers

All responses include standard rate limit headers:

```
RateLimit-Limit: 5
RateLimit-Remaining: 2
RateLimit-Reset: 1705335000
```

### 4. Redis Store for Distributed Rate Limiting

Uses `rate-limit-redis` for multi-server deployments:

```typescript
store: config.REDIS_ENABLED && redisClient.isOpen
  ? new RedisStore({
      client: redisClient,
      prefix: 'rate-limit:',
    })
  : undefined,
```

**Benefits**:
- Rate limits shared across multiple server instances
- Survives server restarts
- Garbage collection via TTL

### 5. Graceful Fallback

If Redis is unavailable, falls back to in-memory store:

```typescript
if (!config.REDIS_ENABLED || !redisClient.isOpen) {
  logger.warn('⚠️ Using in-memory rate limiting store');
  // Uses express-rate-limit's default memory store
}
```

### 6. Security Logging

Rate limit violations are logged for security monitoring:

```typescript
logger.warn('🚨 Rate limit exceeded', {
  userId,
  ip: req.ip,
  path: req.path,
  method: req.method,
  endpoint: `${req.method} ${req.path}`,
});
```

## Environment Configuration

Add these to your `.env` file:

```env
# Redis Configuration
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0

# Note: For production, use Redis Cloud or self-hosted Redis
# Development: localhost:6379
# Staging: redis-staging.example.com:6379
# Production: redis-prod.example.com:6379
```

## Installation & Setup

### 1. Install Dependencies

```bash
npm install redis rate-limit-redis ioredis
```

### 2. Update Environment Config

```bash
cp .env.example .env
# Edit .env and add Redis configuration
```

### 3. Start Redis (Development)

Using Docker:
```bash
docker run -d -p 6379:6379 redis:latest
```

Or using homebrew (macOS):
```bash
brew install redis
redis-server
```

Or using Windows Subsystem for Linux:
```bash
wsl
sudo apt-get install redis-server
redis-server
```

### 4. Run the Application

```bash
npm run dev
```

Check logs for:
```
✅ Redis client connected successfully
📡 Distributed rate limiting enabled (Redis)
```

## Usage Examples

### Example 1: Applying Rate Limiters to Routes

In `backend/src/index.ts`:

```typescript
// Auth routes with specific rate limiters
app.post(`${config.API_PREFIX}/auth/login`, authLimiter);
app.post(`${config.API_PREFIX}/auth/register`, registrationLimiter);
app.post(`${config.API_PREFIX}/auth/forgot-password`, passwordResetLimiter);

// Order routes with specific rate limiters
app.post(`${config.API_PREFIX}/orders`, orderCreationLimiter);

// Report routes with specific rate limiters
app.post(`${config.API_PREFIX}/reports/generate`, reportGenerationLimiter);
```

### Example 2: Creating a Custom Rate Limiter

```typescript
export const customLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 requests
  keyGenerator, // Use multi-tenant aware key generation
  handler: errorResponder, // Use custom error formatter
  store: config.REDIS_ENABLED && redisClient.isOpen
    ? new RedisStore({
        client: redisClient,
        prefix: 'rate-limit:custom:',
      })
    : undefined,
});
```

### Example 3: Handling Rate Limit Errors in Frontend

```typescript
async function loginUser(email: string, password: string) {
  try {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 429) {
      const error = await response.json();
      const retryAfter = error.retryAfter;
      
      // Show user message
      alert(`Too many login attempts. Try again in ${retryAfter} seconds.`);
      
      // Disable login form for retryAfter seconds
      setTimeout(() => {
        enableLoginForm();
      }, retryAfter * 1000);
      
      return;
    }

    // Handle other responses...
  } catch (error) {
    console.error('Login error:', error);
  }
}
```

### Example 4: Checking Rate Limit Headers

```typescript
fetch('/api/v1/orders')
  .then(response => {
    const remaining = response.headers.get('RateLimit-Remaining');
    const limit = response.headers.get('RateLimit-Limit');
    const reset = response.headers.get('RateLimit-Reset');
    
    console.log(`Requests remaining: ${remaining}/${limit}`);
    console.log(`Reset time: ${new Date(reset * 1000)}`);
    
    return response.json();
  });
```

## Testing

### Run Tests

```bash
npm test RateLimiting.test.ts
npm test RateLimiting.test.ts --watch
npm test RateLimiting.test.ts --coverage
```

### Test Coverage

The test suite covers:
- ✅ Each rate limiter individually
- ✅ Rate limit headers in responses
- ✅ Error response format
- ✅ Per-IP rate limiting
- ✅ Multi-tenant isolation
- ✅ Security logging
- ✅ Integration scenarios

### Manual Testing with cURL

```bash
# Test login rate limiter
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}' \
    -w "\nStatus: %{http_code}\n"
done

# Check rate limit headers
curl -i http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{"items":[]}'

# Should see:
# RateLimit-Limit: 50
# RateLimit-Remaining: 49
# RateLimit-Reset: 1705335000
```

## Monitoring & Logging

### Redis Health Check

Check Redis connection:
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T13:00:00Z",
  "redis": "connected"
}
```

### View Rate Limit Keys in Redis

```bash
# Connect to Redis CLI
redis-cli

# List all rate limit keys
KEYS "rate-limit:*"

# Check a specific key
GET "rate-limit:ip:192.168.1.1"
TTL "rate-limit:ip:192.168.1.1"

# Monitor keys in real-time
MONITOR
```

### Log Monitoring

Rate limit violations are logged as warnings:

```bash
# View rate limit violations
grep "Rate limit exceeded" logs/application.log

# Count violations by endpoint
grep "Rate limit exceeded" logs/application.log | jq '.endpoint' | sort | uniq -c
```

## Performance Considerations

### Memory Usage

**In-Memory Store** (single server):
- ~100 bytes per rate limit key
- For 1000 concurrent users: ~100 KB
- Acceptable for small deployments

**Redis Store** (distributed):
- Uses Redis memory, not application memory
- Scales to millions of keys
- External memory management

### CPU Usage

**Impact**: Negligible
- Key generation: <1ms
- Redis lookup: <5ms (network latency)
- Memory store lookup: <0.1ms

**Optimization Tips**:
1. Use Redis for production (multi-server)
2. Implement connection pooling
3. Monitor Redis performance

### Network Impact

With Redis:
- ~5ms additional latency per request
- Network round trip to Redis
- Negligible for typical 200-500ms requests

## Troubleshooting

### Issue: "Redis client error: connect ECONNREFUSED"

**Solution**: Ensure Redis is running
```bash
# Start Redis
redis-server

# Or with Docker
docker run -d -p 6379:6379 redis:latest

# Check Redis status
redis-cli ping  # Should return "PONG"
```

### Issue: Rate limiter not working properly

**Checks**:
1. Verify Redis connection: `curl http://localhost:3000/health`
2. Check rate limit keys: `redis-cli KEYS "rate-limit:*"`
3. Review logs: `grep "rate-limit" logs/application.log`

### Issue: Different rate limits per IP not working

**Remember**: Uses IP from `req.ip` property
1. Behind proxy? Set `app.set('trust proxy', 1)`
2. Check X-Forwarded-For header
3. Use `req.headers['x-forwarded-for']` if needed

### Issue: "Rate limit exceeded" on every request

**Solutions**:
1. Increase limit (if legitimate)
2. Check for shared IP (corporate network)
3. Clear Redis: `FLUSHDB`
4. Check time sync (Redis and app server)

## Production Deployment

### 1. Use Redis Cloud or Self-Hosted Redis

```env
# Production
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure_password_here
```

### 2. Configure Rate Limits Based on SLA

```typescript
// Adjust limits based on plan
if (user.plan === 'premium') {
  max = limit * 2; // Double limits for premium users
}
```

### 3. Monitor Rate Limit Violations

```typescript
// Alert on high rate of violations
const violationRate = getViolationCount('minute');
if (violationRate > threshold) {
  sendAlert('High rate of API abuse detected');
}
```

### 4. Implement Gradual Backoff

```typescript
// Gradually increase penalties
const violations = getViolationCount('user', userId);
const backoffMultiplier = Math.min(violations / 10, 5); // Max 5x penalty
```

### 5. Regular Backups

```bash
# Backup Redis
redis-cli BGSAVE

# Check backup
ls -la /var/lib/redis/dump.rdb
```

## Security Best Practices

1. **Change Redis Password**: Use strong password in production
2. **Bind to Localhost**: `bind 127.0.0.1` in redis.conf
3. **Use Redis over TLS**: `rediss://` protocol in connection string
4. **Monitor for Attacks**: Log all rate limit violations
5. **Adjust Limits**: Be aggressive with public endpoints, generous with authenticated

## FAQ

### Q: Can legitimate users be blocked?

**A**: Yes, if they exceed limits. Solutions:
- Increase limits for their plan
- Whitelist their IP
- Implement request batching
- Use API keys for higher limits

### Q: How does this work with load balancers?

**A**: Redis makes it work seamlessly:
- All servers query same Redis instance
- Limits enforced across servers
- No duplicate requests slipping through

### Q: Can rate limits be bypassed?

Rate limiting can be circumvented but it's expensive:
- Use multiple IPs/VPNs: Blocked by Redis user-based limiting
- Rotate accounts: Each account subject to same limits
- Distributed attacks: Harder to execute, easy to detect

### Q: What about legitimate APIs consuming under limits?

**A**: Monitor rate limit headers:
```typescript
if (remaining < limit * 0.1) {
  // Less than 10% remaining, implement backoff
  await sleep(5000);
}
```

## Additional Resources

- [express-rate-limit documentation](https://github.com/nfriedly/express-rate-limit)
- [rate-limit-redis](https://github.com/wyattjoh/rate-limit-redis)
- [Redis documentation](https://redis.io/documentation)
- [OWASP Rate Limiting](https://owasp.org/www-community/attacks/Brute_force_attack)

## Support & Maintenance

### Regular Maintenance

1. **Daily**: Monitor violation logs
2. **Weekly**: Check Redis memory usage
3. **Monthly**: Review and adjust limits
4. **Quarterly**: Update rate limit strategies

### Monitoring Checklist

- [ ] Redis connection healthy
- [ ] Rate limit violations < 1% of requests
- [ ] Response times acceptable
- [ ] Memory usage stable
- [ ] No false positives (legitimate users blocked)

### Future Enhancements

1. Dynamic rate limiting based on load
2. ML-based fraud detection
3. Geographic-based rate limiting
4. Usage-based plan tiers with API rate limits
5. Webhook notifications for violations
