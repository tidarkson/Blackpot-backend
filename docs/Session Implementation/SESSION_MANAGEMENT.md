# Redis-Based Session Management Implementation Guide

## Overview
This document provides comprehensive guidance on the Redis-backed session management system implemented for BlackPot's restaurant SaaS platform. This replaces in-memory sessions with Redis-backed persistent sessions, enabling multi-server deployments and preventing session loss on server restarts.

## Architecture

### Session Flow
```
User Login
    ↓
JWT Token Generated
    ↓
Express Session Created in Redis
    ↓
User Makes Requests with Session Cookie
    ↓
Session Validated & Fingerprinted on Each Request
    ↓
Session TTL Extended (Sliding Window)
    ↓
User Logout
    ↓
Session Destroyed from Redis
```

### Key Components

#### 1. Session Configuration (`config/session.config.ts`)
- Express session setup with Redis store
- Session cookie security configuration
- Session timeout management (24 hours default)
- Session fingerprinting for hijacking prevention

#### 2. Session Service (`services/SessionService.ts`)
- Core session operations (create, validate, destroy)
- Concurrent session limiting (max 3 devices)
- Session fingerprinting and validation
- Session metadata tracking
- Batch session operations

#### 3. Session Middleware (`middleware/session.middleware.ts`)
- Session validation on each request
- Session lifecycle management
- Security checks (HTTPS enforcement in production)
- Inactivity timeout tracking
- Concurrent session limiting

#### 4. Auth Controller Updates (`controllers/AuthController.ts`)
- Session creation on login
- Session clearing on logout
- Multi-device management endpoints
- Automatic session invalidation on password change

## Features Implemented

### ✅ Session Persistence
**Problem Solved:** Users getting logged out on server restart
**Solution:** Redis stores all session data with automatic expiration
- Sessions survive server restarts
- Works across multiple server instances
- Automatic cleanup of expired sessions

### ✅ Multi-Server Deployment
**Problem Solved:** Sessions not shared across load-balanced servers
**Solution:** Redis acts as central session store
- All servers can access user sessions
- Session consistency across instances
- No session duplication or conflicts

### ✅ Session Expiration (24 hours)
**Implementation:** 
```typescript
SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000 // 24 hours
```
- Automatic expiration in Redis using TTL
- Sliding window extension on activity
- Configurable via environment variables

### ✅ Session Refresh on Activity
**Feature:** Sliding window timeout
```typescript
// Each request extends session timeout
await SessionService.extendSession(req);
```
- Session TTL resets with each request
- Prevents timeout during active usage
- Preserves user experience during long operations

### ✅ Multi-Server Session Sharing
**Implementation:**
- All sessions stored in central Redis instance
- Session IDs shared across all servers
- Concurrent session tracking per user

### ✅ Logout Clears Session
**Implementation:**
```typescript
await sessionService.clearSession(req);
```
- Destroys session from Redis
- Destroys Express session
- Clears all session metadata

## Security Features

### 1. Session Fingerprinting
**Purpose:** Prevent session hijacking
```typescript
const fingerprint = generateSessionFingerprint(req);
// Creates hash of: user-agent + accept-language + IP address
```
**Validation:**
- Strict mode (production): Fingerprints must match exactly
- Non-strict mode (development): Allows SOME mismatch
- Function: `validateSessionFingerprint()`

### 2. Secure Cookies
```typescript
cookie: {
  secure: true,        // HTTPS only in production
  httpOnly: true,      // No client-side JS access
  sameSite: 'strict',  // CSRF protection
  maxAge: 86400000     // 24 hours
}
```

### 3. Session Hijacking Prevention
- Fingerprinting validates device consistency
- IP validation (optional, configurable)
- Automatic session invalidation on suspicious activity

### 4. Concurrent Session Limits
**Default:** 3 devices per user
```typescript
MAX_CONCURRENT_SESSIONS = 3;
```
- Oldest session removed when limit exceeded
- Prevents unauthorized multi-device access
- Configurable via environment variables

### 5. Password Change Session Invalidation
```typescript
// When password is reset, invalidate all sessions
await sessionService.invalidateAllUserSessions(userId);
```
- Forces user to log back in
- Prevents unauthorized access
- Security best practice

## API Endpoints

### Session Management Endpoints

#### Get Active Sessions
```http
GET /api/v1/auth/sessions
Authorization: Bearer <token>

Response (200):
{
  "status": "success",
  "data": {
    "activeSessions": [
      {
        "sessionId": "abc123...",
        "loginTime": "2026-02-13T10:00:00Z",
        "ipAddress": "192.168.1.1",
        "rememberMe": false
      }
    ],
    "count": 1
  }
}
```

#### Revoke Specific Session
```http
DELETE /api/v1/auth/sessions/:sessionId
Authorization: Bearer <token>

Response (200):
{
  "status": "success",
  "message": "Session revoked successfully"
}
```

#### Logout All Other Sessions
```http
POST /api/v1/auth/sessions/logout-all-other
Authorization: Bearer <token>

Response (200):
{
  "status": "success",
  "message": "All other sessions have been logged out",
  "data": {
    "revokedCount": 2
  }
}
```

## Configuration

### Environment Variables
```env
# Session Configuration
SESSION_SECRET=your-secret-key
SESSION_TIMEOUT_MS=86400000              # 24 hours
REMEMBER_ME_TIMEOUT_MS=2592000000        # 30 days
COOKIE_DOMAIN=yourdomain.com             # Set for production
SESSION_ENABLE_FINGERPRINTING=true       # Enable fingerprinting
SESSION_VALIDATE_IP=false                # Optional: validate IP address
SESSION_MAX_CONCURRENT=3                 # Max devices per user

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=0
REDIS_ENABLED=true
```

### Programmatic Configuration
```typescript
// Customize session timeout
const timeout = getSessionTimeout(rememberMe); // Returns 24h or 30d

// Adjust concurrent session limits
const maxSessions = config.SESSION_MAX_CONCURRENT; // Default: 3
```

## Implementation Examples

### 1. Enable "Remember Me" Feature

**Frontend:**
```javascript
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123',
    rememberMe: true  // ← Enable 30-day session
  })
});
```

**Backend (Automatic):**
- SessionService detects `rememberMe` flag
- Sets session timeout to 30 days
- Stores preference in Redis

### 2. Invalidate All Sessions (Password Change)

```typescript
// In auth.controller.ts - changePassword method
static async changePassword(req: Request, res: Response) {
  const userId = req.user!.userId;
  
  // Change password
  await authService.changePassword(userId, oldPwd, newPwd);
  
  // Invalidate all sessions - forces re-login
  await SessionService.invalidateAllUserSessions(userId);
  
  // Return success
  return res.json({ message: 'Password changed. Please log in again.' });
}
```

### 3. Concurrent Session Management

**Feature: "Logout from all other devices"**
```typescript
// User finds unauthorized login
POST /api/v1/auth/sessions/logout-all-other
Authorization: Bearer <token>

// Backend logic:
1. Get current user's session ID from request
2. Fetch all user sessions from Redis
3. Revoke all sessions EXCEPT current
4. User remains logged in on current device
```

### 4. Session Validation Middleware

```typescript
// Applied to all authenticated routes
const { sessionValidator } = require('../middleware/session.middleware');

app.use(sessionValidator);

// Validates on each request:
// ✓ Session exists
// ✓ Fingerprint matches
// ✓ Not expired
// ✓ Extends TTL (sliding window)
```

## Migration from JWT-Only Auth

### Strategy 1: Gradual Migration
1. **Keep both systems active:**
   - Users can authenticate with JWT or session
   - Easy rollback if issues occur

2. **Implementation:**
```typescript
// In auth middleware
const isValidJWT = validateJWT(token);
const isValidSession = req.session?.user_id;

if (!isValidJWT && !isValidSession) {
  // Reject request
}
```

3. **New users:** Get both JWT and session
4. **Existing users:** Upgrade sessions on next login

### Strategy 2: Session Primary, JWT Secondary
1. **Sessions handle:** User credentials, device tracking, real-time validation
2. **JWT handles:** API token for external integrations
3. **Advantages:** 
   - Better device management with sessions
   - Better API integration with JWT
   - Flexible architecture

### Strategy 3: Session-Only (Full Migration)
1. **Remove JWT dependency** for traditional auth
2. **Keep JWT for:**
   - Third-party API tokens
   - Service-to-service communication
3. **Benefits:** Simpler security model, better session control
4. **Migration window:** Recommend 6-month rollout

## Monitoring and Debugging

### Check Session Status
```typescript
// Get session statistics
const stats = await SessionService.getSessionStats();
console.log(`Active sessions: ${stats.activeSessions}`);
console.log(`Total users: ${stats.totalUsers}`);
```

### View User Sessions
```typescript
// Get all sessions for specific user
const sessions = await SessionService.getUserSessions(userId);
sessions.forEach(session => {
  console.log(`
    Session ID: ${session.sessionId}
    Login: ${session.loginTime}
    IP: ${session.ipAddress}
    Remember: ${session.rememberMe}
  `);
});
```

### Monitor Redis Session Storage
```bash
# Connect to Redis CLI
redis-cli

# List all session keys
KEYS session:*

# Get session count
DBSIZE

# Inspect specific session
GET session:abc123...

# Check expiration
TTL session:abc123...
```

### Log Analysis
Session events are logged with context:
```
[INFO] Session created for user [userId]
[WARN] Session fingerprint mismatch for user [userId]
[INFO] Session cleared for user [userId]
[WARN] Session limit exceeded. Removed oldest session for user [userId]
[ERROR] Redis session store error
```

## Performance Optimization

### 1. Session Cleanup
```typescript
// Automatic via Redis TTL
// Manual cleanup:
await SessionService.cleanupExpiredSessions();
```

### 2. Concurrent Request Handling
- Redis connection pooling (via ioredis)
- Non-blocking session operations
- Async middleware for validation

### 3. Database Queries
```typescript
// Minimal DB queries during session validation
// Only updates last_login during actual login
// Session data stored entirely in Redis
```

## Troubleshooting

### Issue: "Redis connection failed"
**Solution:**
```bash
# Check Redis is running
redis-cli ping
# Should return: PONG
```

### Issue: "Session expires immediately"
**Check:**
```typescript
// Verify SESSION_TIMEOUT_MS is set correctly
console.log(config.SESSION_TIMEOUT_MS); // Should be 86400000 (24h)

// Check Redis TTL
redis-cli TTL session:<sessionid>
```

### Issue: "Fingerprint mismatch errors"
**Solutions:**
1. Disable strict mode (development):
```env
NODE_ENV=development
```

2. Or disable fingerprinting:
```env
SESSION_ENABLE_FINGERPRINTING=false
```

### Issue: "Sessions not persisting across requests"
**Check:**
1. Redis connection: `redis-cli ping`
2. Session middleware order in app.js
3. Cookie settings match domain
4. Check browser cookies are enabled

## Testing

### Unit Tests
```bash
npm run test -- SessionService.test.ts
```

### Session Flow Test
1. Login with email/password → Session created
2. Make authenticated request → Session validated and extended
3. Wait 24 hours or force expiration → Session removed
4. Try authenticated request → 401 Unauthorized
5. Logout → Session destroyed immediately

### Multi-Device Test
1. Login on Device A → Session 1 created
2. Login on Device B → Session 2 created
3. Login on Device C → Session 3 created
4. Login on Device D → Session 1 (oldest) removed
5. List sessions → Shows 3 current sessions
6. Logout from Device B → Session 2 removed

### Fingerprint Validation Test
1. Login on Device A → Fingerprint recorded
2. Request from Device A → Fingerprint valid ✓
3. Simulate different UA → Fingerprint mismatch ✗
4. Disable strict mode → Allows mismatch ✓

## Security Checklist

- [ ] `secure: true` enabled for production cookies
- [ ] `httpOnly: true` prevents XSS access
- [ ] `sameSite: 'strict'` prevents CSRF
- [ ] Session fingerprinting enabled
- [ ] HTTPS enforced in production
- [ ] Redis password protected
- [ ] Session timeout configured (24h)
- [ ] Max concurrent sessions set (3)
- [ ] Password change invalidates sessions
- [ ] Logout properly cleans up Redis
- [ ] Session metadata logged securely
- [ ] Rate limiting on login endpoint
- [ ] IP validation optional/configurable

## References

- [Express Session Documentation](https://github.com/expressjs/session)
- [Connect Redis Documentation](https://github.com/tj/connect-redis)
- [OWASP Session Management](https://owasp.org/www-community/attacks/Session_fixation)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review test files for examples
3. Check Redis connection status
4. Review application logs for session errors
5. Contact development team

---

**Last Updated:** February 13, 2026
**Version:** 1.0.0
**Status:** Production Ready
