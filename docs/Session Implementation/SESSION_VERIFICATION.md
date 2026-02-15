# Session Implementation Verification Guide

## Quick Verification Steps

### Step 1: Verify Files Created ✅

```bash
# Check session configuration
ls -la backend/src/config/session.config.ts

# Check session service
ls -la backend/src/services/SessionService.ts

# Check session middleware  
ls -la backend/src/middleware/session.middleware.ts

# Check session types
ls -la backend/src/types/session.ts

# Check tests
ls -la backend/tests/SessionService.test.ts

# Check documentation
ls -la docs/SESSION_*.md
ls -la .env.session.example
```

### Step 2: Verify Dependencies Updated ✅

```bash
# Check package.json for new dependencies
grep -E "express-session|connect-redis|@types/express-session" package.json

# Expected output:
# "express-session": "^1.17.3",
# "connect-redis": "^7.1.0",
# "@types/express-session": "^1.17.11",
```

### Step 3: Verify Environment Configuration ✅

```bash
# Check environment config updated
grep -E "SESSION_|REMEMBER_ME_|COOKIE_DOMAIN" backend/src/config/environment.ts

# Should show these new config variables:
# SESSION_SECRET
# SESSION_TIMEOUT_MS
# REMEMBER_ME_TIMEOUT_MS
# SESSION_ENABLE_FINGERPRINTING
# SESSION_VALIDATE_IP
# SESSION_MAX_CONCURRENT
# COOKIE_DOMAIN
```

### Step 4: Verify Controller Updates ✅

```bash
# Check AuthController updated
grep -E "getActiveSessions|revokeSession|logoutAllOtherSessions" \
  backend/src/controllers/AuthController.ts

# Should show three new methods
```

### Step 5: Verify Routes Updated ✅

```bash
# Check auth routes
grep -E "\/sessions|logout-all-other" backend/src/routes/auth.ts

# Should show new session endpoints
```

### Step 6: Verify Main App Updated ✅

```bash
# Check index.ts has session imports
grep "initializeSessionConfig\|session.middleware" backend/src/index.ts

# Check middleware order (session AFTER bodyParser)
grep -A5 "express.json()" backend/src/index.ts
```

## Detailed Verification

### Verify SessionService Implementation

Run this in Node to check the service:

```javascript
const { SessionService } = require('./backend/dist/services/SessionService');

// Check methods exist
const service = new SessionService();
console.log('✓ SessionService.createSession:', typeof service.createSession);
console.log('✓ SessionService.validateSession:', typeof service.validateSession);
console.log('✓ SessionService.clearSession:', typeof service.clearSession);
console.log('✓ SessionService.getUserSessions:', typeof service.getUserSessions);
console.log('✓ SessionService.invalidateAllUserSessions:', typeof service.invalidateAllUserSessions);
console.log('✓ SessionService.revokeSession:', typeof service.revokeSession);
```

### Verify Configuration

```javascript
const { initializeSessionConfig } = require('./backend/dist/config/session.config');

// Check config can be initialized
const config = initializeSessionConfig();
console.log('✓ Session config:', config.secret ? 'OK' : 'MISSING');
console.log('✓ Session store:', config.store ? 'OK' : 'MISSING');
console.log('✓ Cookie settings:', config.cookie ? 'OK' : 'MISSING');
```

### Verify Middleware

```javascript
const { sessionValidator, requireSession } = 
  require('./backend/dist/middleware/session.middleware');

console.log('✓ sessionValidator:', typeof sessionValidator === 'function');
console.log('✓ requireSession:', typeof requireSession === 'function');
console.log('✓ concurrentSessionLimiter:', require('./backend/dist/middleware/session.middleware').concurrentSessionLimiter);
```

## Integration Test Checklist

### Manual Testing Workflow

#### Test 1: Basic Login/Logout
```bash
# 1. Start server
npm run dev

# 2. In another terminal, test login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  -c cookies.txt

# Should return: { accessToken, refreshToken, user }
# cookies.txt should contain session cookie

# 3. Test authenticated endpoint with cookie
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>" \
  -b cookies.txt

# Should return: { user data }

# 4. Test logout
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer <accessToken>" \
  -b cookies.txt

# Session should be cleared from Redis
```

#### Test 2: Session Persistence
```bash
# 1. Login and create session
# (same as Test 1)

# 2. Check Redis for session
redis-cli
> KEYS session:*
# Should see session keys

# 3. Check TTL
> TTL session:abc123
# Should show roughly 86400 seconds (24 hours)

# 4. Stop and restart server
# Sessions should still exist in Redis

# 5. Make authenticated request
# Should work without re-login (session still valid)
```

#### Test 3: Concurrent Sessions
```bash
# 1. Login on Device A
# Get sessionId_A from cookies

# 2. Login on Device B (different browser/incognito)
# Get sessionId_B from cookies

# 3. Login on Device C
# Get sessionId_C from cookies

# 4. Get active sessions
curl http://localhost:3000/api/v1/auth/sessions \
  -H "Authorization: Bearer <token>" \
  -b cookies.txt

# Should return 3 sessions

# 5. Login on Device D
# Get sessionId_D from cookies

# 6. Check sessions again
# Should still have only 3 (oldest removed)
# Device A should be gone
```

#### Test 4: Remember Me
```bash
# 1. Login with rememberMe=true
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","rememberMe":true}' \
  -c cookies.txt

# 2. Check Redis TTL
redis-cli
> TTL session:abc123
# Should show roughly 2592000 seconds (30 days, not 24 hours)
```

#### Test 5: Session Revocation
```bash
# 1. Get active sessions and note sessionId_1, sessionId_2

# 2. Revoke sessionId_2
curl -X DELETE http://localhost:3000/api/v1/auth/sessions/sessionId_2 \
  -H "Authorization: Bearer <token>" \
  -b cookies.txt

# 3. Get sessions again
# sessionId_2 should be gone
```

#### Test 6: Password Change Invalidation
```bash
# 1. Login on Device A (note token and session)

# 2. Login on Device B (different session)

# 3. Change password on Device A
curl -X PUT http://localhost:3000/api/v1/auth/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"currentPassword":"old","newPassword":"new"}' \
  -b cookies.txt

# 4. Try authenticated request on Device B
# Should get 401 Unauthorized (session invalidated)

# 5. Try to get all sessions on Device A
# Should be empty or only show Device A's new session
```

## Code Review Checklist

### Check AuthController
- [ ] `login()` calls `SessionService.createSession()`
- [ ] `login()` passes `rememberMe` flag
- [ ] `logout()` calls `SessionService.clearSession()`
- [ ] `changePassword()` calls `invalidateAllUserSessions()`
- [ ] `getActiveSessions()` returns session list
- [ ] `revokeSession()` accepts sessionId parameter
- [ ] `logoutAllOtherSessions()` works correctly

### Check index.ts
- [ ] Session config imported
- [ ] Session middleware imported
- [ ] Session initialized AFTER bodyParser
- [ ] Session middleware BEFORE routes
- [ ] Proper middleware order maintained

### Check SessionService
- [ ] Redis connection checked
- [ ] Concurrent session limit enforced
- [ ] Fingerprint generated and validated
- [ ] TTL properly extended
- [ ] All CRUD operations present

### Check Environment
- [ ] SESSION_SECRET present
- [ ] SESSION_TIMEOUT_MS correct (24h)
- [ ] REMEMBER_ME_TIMEOUT_MS correct (30d)
- [ ] REDIS_ENABLED set to true

## Compile and Build Check

```bash
# Clean build
rm -rf backend/dist
npm run build

# Check for compile errors
npm run lint

# Run tests
npm run test -- SessionService.test.ts
```

### Expected Build Output
```
✓ No TypeScript errors
✓ No ESLint errors
✓ Session tests pass (or mostly pass if DB unavailable)
```

## Runtime Verification

### Start Server
```bash
npm run dev
```

### Expected Logs
```
✅ Redis connection initialized successfully
✅ Redis session store initialized
● Server running on port 3000
✓ Express Session middleware configured
```

### Health Check
```bash
curl http://localhost:3000/health

# Expected response:
{
  "status": "OK",
  "timestamp": "2026-02-13T...",
  "redis": "connected"
}
```

## Database Considerations

### Check Prisma Schema (if needed)
```bash
# Session data doesn't require DB changes
# Sessions stored entirely in Redis

# But these fields track logins:
# User.lastLoginAt
# User.lastLoginIp

# Verify in schema.prisma:
grep -E "lastLoginAt|lastLoginIp" database/prisma/schema.prisma
```

## Redis Verification

### Check Redis is Running
```bash
redis-cli ping
# Should return: PONG

redis-cli info
# Should show version and stats
```

### Check Session Storage
```bash
redis-cli

# List all session keys
> KEYS session:*
# Example output: session:s_abc123xyz

# Get session TTL
> TTL session:s_abc123xyz
# Example output: 86394 (seconds remaining)

# View session metadata
> HGETALL user:sessions:userId123
# Shows all session metadata for user
```

## Frontend Verification (If Frontend Available)

### Login Test
1. Open browser DevTools
2. Go to Application → Cookies
3. Login on page
4. Check new cookie appears: `blackpot-session=<sessionid>`
5. Verify httpOnly flag is set

### Session Persistence
1. Login and close browser
2. Reopen browser
3. Cookie should still exist
4. Page should load user data

### Multi-Device
1. Login on Desktop
2. Login on Mobile (incognito/different browser)
3. Check both devices logged in
4. List devices on one browser
5. Both should appear

## Performance Verification

### Session Operations Speed
```bash
# Test Redis performance
redis-cli --latency -i 1
# Should show <1ms latency for local Redis

redis-cli --bigkeys
# Should show healthy key distribution
```

### Memory Usage
```bash
redis-cli
> INFO memory
# Check used_memory is reasonable
# Should grow with active sessions

> DBSIZE
# Should match number of sessions
```

## Troubleshooting Failed Checks

### If Tests Fail
```bash
# Check Redis is running
redis-cli ping

# Check database connection
npm run db:studio

# Run specific test
npm run test -- SessionService.test.ts --verbose

# Check logs
cat backend/logs/error.log
```

### If Middleware Order Wrong
**Wrong Order:**
```typescript
app.use(sessionMiddleware);
app.use(express.json());  // ← WRONG
```

**Correct Order:**
```typescript
app.use(express.json());
app.use(sessionMiddleware);  // ← CORRECT
```

### If Sessions Not Persisting
1. Check Redis connection: `redis-cli ping`
2. Check Redis is not flushed: `redis-cli DBSIZE`
3. Check credentials in fetch: `credentials: 'include'`
4. Check browser cookies enabled

## Final Verification Checklist

### Code Quality
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] No unused imports
- [ ] Proper error handling
- [ ] Security best practices
- [ ] Constants properly defined

### Features
- [ ] Session creation works
- [ ] Session validation works
- [ ] Session destruction works
- [ ] Concurrent session limiting works
- [ ] Remember me feature works
- [ ] Password reset invalidation works
- [ ] Multi-device management works

### Security
- [ ] Fingerprinting implemented
- [ ] HTTPS in production (testable)
- [ ] HttpOnly cookies
- [ ] SameSite=strict
- [ ] Session timeout enforced
- [ ] Password reset invalidates sessions

### Documentation
- [ ] Implementation guide complete
- [ ] Quick reference created
- [ ] Checklist provided
- [ ] Frontend integration guide provided
- [ ] Environment template created

### Testing
- [ ] Unit tests pass
- [ ] Manual tests work
- [ ] Integration tests planned
- [ ] Edge cases covered

### Deployment Ready
- [ ] Dependencies installed
- [ ] Environment variables configured
- [ ] Database migrated (if needed)
- [ ] Redis running
- [ ] Server starts without errors
- [ ] Health endpoint working

## Success Criteria

✅ **All of these should be true:**

1. `npm install` succeeds without errors
2. `npm run build` creates dist folder
3. `npm run test` runs without fatal errors
4. Server starts with `npm run dev`
5. Health endpoint responds
6. Login creates session in Redis
7. Session survives server restart
8. Logout clears session from Redis
9. Multiple concurrent sessions work
10. Session endpoints respond correctly

If all are true, you're ready for deployment! 🚀

---

**Verification Date:** February 13, 2026
**Status:** Ready for Testing
