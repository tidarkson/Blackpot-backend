# Session Management Quick Reference

## TL;DR - Essential Info

### Sessions are now Redis-backed and persistent
- ✅ Survives server restarts
- ✅ Works across multiple servers
- ✅ Expires after 24 hours of inactivity
- ✅ Limits to 3 concurrent devices per user

### Login now creates a session AND JWT token
```typescript
POST /api/v1/auth/login
Body: { email, password, rememberMe? }
Response: { accessToken, refreshToken, user, sessionId }
```

### Logout clears session from Redis
```typescript
POST /api/v1/auth/logout
// Session destroyed from Redis immediately
```

## Common Scenarios

### 1. User Logs In on Device A
```
1. Credentials verified
2. Session created in Redis (24h timeout)
3. JWT token generated
4. Session ID sent in cookie
5. User is authenticated
```

### 2. User Logs In on Device B (Same User)
```
1. Previous session still valid (Device A)
2. New session created for Device B
3. User now has 2 active sessions
4. Both devices remain logged in
```

### 3. User Logs In on Device D (4th Device)
```
1. 3 devices already logged in
2. Oldest session (Device A) automatically removed
3. Device A user gets logged out
4. Device D gets new session
5. Only Devices B, C, D now active
```

### 4. User Clicks "Logout from Other Devices"
```
POST /api/v1/auth/sessions/logout-all-other
1. Gets all user sessions
2. Keeps CURRENT device session
3. Removes all OTHER device sessions
4. User stays logged in on current device
5. All other devices logged out
```

### 5. User Changes Password
```
1. Password updated in database
2. ALL sessions for user invalidated
3. User must log back in on all devices
4. Security best practice enforced
```

### 6. 24 Hours Later (No Activity)
```
1. Redis automatically expired session
2. Next request to protected endpoint returns 401
3. User must log back in
4. Session TTL never extended due to inactivity
```

### 7. User Makes Request After 5 Hours (Active)
```
1. Session validation checks fingerprint
2. Session timeout extended to 24h again
3. Request proceeds normally
4. Last activity timestamp updated
```

## API Endpoints

### Authentication
```http
POST   /api/v1/auth/login              # Login (creates session + JWT)
POST   /api/v1/auth/logout             # Logout (destroys session)
POST   /api/v1/auth/register           # Register
GET    /api/v1/auth/me                 # Get current user
```

### Session Management
```http
GET    /api/v1/auth/sessions           # List all active sessions
DELETE /api/v1/auth/sessions/:id       # Logout from specific device
POST   /api/v1/auth/sessions/logout-all-other  # Logout all other devices
```

### Password Management  
```http
PUT    /api/v1/auth/password           # Change password (invalidates all sessions)
POST   /api/v1/auth/forgot-password    # Request password reset
POST   /api/v1/auth/reset-password     # Reset password with token
```

## Response Examples

### Get All Sessions
```json
{
  "status": "success",
  "data": {
    "activeSessions": [
      {
        "sessionId": "s__abc123def456",
        "loginTime": "2026-02-13T10:30:00Z",
        "ipAddress": "192.168.1.1",
        "rememberMe": false
      },
      {
        "sessionId": "s__xyz789uvw012",
        "loginTime": "2026-02-13T14:15:00Z",
        "ipAddress": "10.0.0.5",
        "rememberMe": true
      }
    ],
    "count": 2
  }
}
```

### Revoke Session
```json
{
  "status": "success",
  "message": "Session revoked successfully"
}
```

### Logout All Other Sessions
```json
{
  "status": "success",
  "message": "All other sessions have been logged out",
  "data": {
    "revokedCount": 2
  }
}
```

## Code Examples

### Check Session in Middleware
```typescript
// Already done, but here's how it works:
import { requireSession } from './middleware/session.middleware';

router.get('/protected', requireSession, (req, res) => {
  // req.session will have user info
  const userId = req.session.user_id;
  const email = req.session.email;
  // ...
});
```

### Get Current User's Sessions
```typescript
import { SessionService } from './services/SessionService';

const sessions = await SessionService.getUserSessions(userId);
// Returns array of sessions with timestamps, IPs, etc.
```

### Invalidate All User Sessions (Admin)
```typescript
import { SessionService } from './services/SessionService';

// Force user to log in everywhere (e.g., after password change)
await SessionService.invalidateAllUserSessions(userId);
```

### Create Session After Login
```typescript
// Already done in AuthController.login(), but:
await sessionService.createSession(
  req,
  userId,
  restaurantId,
  userRole,
  userEmail,
  rememberMe // true = 30 days, false = 24 hours
);
```

## Frontend Integration

### Login with Remember Me
```javascript
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  credentials: 'include', // Important: Include cookies!
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123',
    rememberMe: true  // 30-day session
  })
});

const data = await response.json();
// Store tokens for API calls
localStorage.setItem('accessToken', data.data.accessToken);
localStorage.setItem('refreshToken', data.data.refreshToken);
// Session cookie handled automatically
```

### Make Authenticated Requests
```javascript
// Include cookies automatically with credentials
const response = await fetch('/api/v1/orders', {
  method: 'GET',
  credentials: 'include',  // Include session cookie
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});
```

### List Active Sessions
```javascript
const response = await fetch('/api/v1/auth/sessions', {
  credentials: 'include',
  headers: { 'Authorization': `Bearer ${accessToken}` }
});

const data = await response.json();
const devices = data.data.activeSessions;

devices.forEach(device => {
  console.log(`
    Logged in from: ${device.ipAddress}
    Login time: ${device.loginTime}
    Remember device: ${device.rememberMe}
  `);
});
```

### Logout from Specific Device
```javascript
async function revokeSession(sessionId) {
  const response = await fetch(`/api/v1/auth/sessions/${sessionId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.ok;
}
```

### Logout from All Other Devices
```javascript
async function logoutOthers() {
  const response = await fetch('/api/v1/auth/sessions/logout-all-other', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  console.log(`Revoked ${data.data.revokedCount} other sessions`);
}
```

### Logout
```javascript
async function logout() {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  // Clear local storage
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  
  // Redirect to login
  window.location.href = '/login';
}
```

## Environment Variables (Quick Set)

```bash
# Development
SESSION_SECRET=dev-secret-key-min-32-chars
SESSION_TIMEOUT_MS=86400000  # 24 hours
NODE_ENV=development
REDIS_ENABLED=true

# Production
SESSION_SECRET=<generate-with-crypto>
SESSION_TIMEOUT_MS=86400000
COOKIE_DOMAIN=yourdomain.com
NODE_ENV=production
REDIS_ENABLED=true
```

## Troubleshooting

### "Session not persisting"
1. Check Redis is running: `redis-cli ping`
2. Check cookie is sent: Browser DevTools → Application → Cookies
3. Check credentials include: `credentials: 'include'` in fetch

### "Fingerprint mismatch"
1. In development: Disable in env: `SESSION_ENABLE_FINGERPRINTING=false`
2. Or use strict: false mode
3. For mobile: Expect IP changes, disable IP validation

### "Sessions not shared across servers"
1. Verify all servers use same Redis host
2. Verify same SESSION_SECRET
3. Check Redis is not behind a firewall
4. Test with: `redis-cli DBSIZE` from each server

### "User logged out unexpectedly"
1. Check session TTL: `redis-cli TTL session:<id>`
2. Check if 24h timeout elapsed without activity
3. Check if user logged in from 4th device (oldest removed)
4. Check if password was changed (all sessions invalidated)

## Security Notes

✅ **Secure by Default:**
- SessionID is cryptographically random
- Fingerprinting prevents device hijacking
- HttpOnly cookies prevent XSS
- HTTPS enforced in production
- Password change invalidates all sessions

⚠️ **Be Careful:**
- Never log SessionID in plain text
- Don't expose session data in error messages
- Validate fingerprint in strict mode on production
- Keep Redis password strong
- Monitor for unusual session patterns

## Performance Notes

- Redis session lookup: ~1ms
- Fingerprint generation: <1ms
- Session extension: ~2ms
- Concurrent sessions per user: Max 3 (configurable)
- Session cleanup: Automatic via Redis TTL

## Related Files

- Config: `backend/src/config/session.config.ts`
- Service: `backend/src/services/SessionService.ts`
- Middleware: `backend/src/middleware/session.middleware.ts`
- Controller: `backend/src/controllers/AuthController.ts`
- Routes: `backend/src/routes/auth.ts`
- Tests: `backend/tests/SessionService.test.ts`
- Docs: `docs/SESSION_MANAGEMENT.md`

---

**Quick Links:**
- 📚 [Full Documentation](./SESSION_MANAGEMENT.md)
- ✅ [Implementation Checklist](./SESSION_IMPLEMENTATION_CHECKLIST.md)
- 🧪 [Test Examples](../backend/tests/SessionService.test.ts)
- ⚙️ [Configuration](../.env.session.example)
