# Session Management Developer Integration Guide

## Getting Started for Frontend Developers

### What Changed?
- Users now have persistent sessions stored in Redis
- Sessions survive server restarts (multiserver-safe)
- Automatic device tracking and management
- "Remember me" feature (30 days)
- Better security with fingerprinting and device limits

### What Stayed the Same?
- JWT tokens still work for API authentication
- Login endpoint still returns tokens
- Middleware still protects routes
- Password-based authentication

## Integration Checklist

### 1. Session Cookie Handling

**Important:** Include `credentials: 'include'` in all fetch requests

❌ **WRONG:**
```javascript
fetch('/api/v1/auth/login', {
  method: 'POST',
  body: JSON.stringify(data)
  // Missing credentials!
});
```

✅ **CORRECT:**
```javascript
fetch('/api/v1/auth/login', {
  method: 'POST',
  credentials: 'include',  // ← This is critical!
  header

s: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### 2. Login Implementation

**Basic Login:**
```javascript
async function login(email, password) {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) throw new Error('Login failed');

  const { data } = await response.json();
  
  // Store tokens for API calls
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  
  // Session cookie is handled automatically ✅
  return data;
}
```

**Login with "Remember Me":**
```javascript
async function loginWithRemember(email, password, rememberMe) {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      rememberMe  // ← Send this flag
    })
  });

  if (!response.ok) throw new Error('Login failed');

  const { data } = await response.json();
  
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  
  // If rememberMe=true, session lasts 30 days instead of 24 hours
  return data;
}
```

### 3. Protected Requests

**Always include both cookie AND token:**
```javascript
async function fetchProtected(url, options = {}) {
  const token = localStorage.getItem('accessToken');

  return fetch(url, {
    ...options,
    credentials: 'include',  // Include session cookie
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,  // Include JWT token
      'Content-Type': 'application/json'
    }
  });
}

// Usage:
const response = await fetchProtected('/api/v1/orders');
const orders = await response.json();
```

### 4. Logout Implementation

**Complete Logout:**
```javascript
async function logout() {
  try {
    // Call logout endpoint (clears session from Redis)
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
      }
    });
  } finally {
    // Clear local storage (frontend)
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    // Clear session cookie (automatic)
    // Browser handles this if cookies set to expire
    
    // Redirect to login
    window.location.href = '/login';
  }
}
```

### 5. Multi-Device Management

**Show User Their Active Sessions:**
```javascript
async function getActiveSessions() {
  const response = await fetch('/api/v1/auth/sessions', {
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
    }
  });

  if (!response.ok) throw new Error('Failed to fetch sessions');
  
  const { data } = await response.json();
  return data.activeSessions;  // Array of sessions
}

// Usage:
const sessions = await getActiveSessions();
console.log(`You're logged in on ${sessions.length} devices:`);

sessions.forEach((session, index) => {
  console.log(`
    Device ${index + 1}:
    - Last login: ${new Date(session.loginTime).toLocaleString()}
    - IP Address: ${session.ipAddress}
    - Remember device: ${session.rememberMe ? 'Yes (30 days)' : 'No (24 hours)'}
  `);
});
```

**Logout from Specific Device:**
```javascript
async function logoutFromDevice(sessionId) {
  const response = await fetch(`/api/v1/auth/sessions/${sessionId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
    }
  });

  if (!response.ok) throw new Error('Failed to revoke session');
  
  console.log('Device logged out successfully');
  
  // Refresh session list
  return await getActiveSessions();
}
```

**"Logout from All Other Devices" Button:**
```javascript
async function logoutAllOthers() {
  const response = await fetch('/api/v1/auth/sessions/logout-all-other', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
    }
  });

  if (!response.ok) throw new Error('Failed to logout other devices');
  
  const { data } = await response.json();
  console.log(`Logged out from ${data.revokedCount} other devices`);
}
```

## React Component Examples

### Login Form with Remember Me

```jsx
import React, { useState } from 'react';

export function LoginForm({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe })
      });

      if (!response.ok) {
        throw new Error('Invalid email or password');
      }

      const { data } = await response.json();
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      
      onLoginSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
        disabled={loading}
      />
      
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
        disabled={loading}
      />
      
      <label>
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          disabled={loading}
        />
        Remember me (30 days)
      </label>
      
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
      
      {error && <div className="error">{error}</div>}
    </form>
  );
}
```

### Active Sessions Component

```jsx
import React, { useEffect, useState } from 'react';

export function SessionManager() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const response = await fetch('/api/v1/auth/sessions', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (!response.ok) throw new Error('Failed to load sessions');
      
      const { data } = await response.json();
      setSessions(data.activeSessions);
    } finally {
      setLoading(false);
    }
  }

  async function revokeSession(sessionId) {
    setRevoking(sessionId);
    try {
      const response = await fetch(`/api/v1/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (!response.ok) throw new Error('Failed to revoke session');
      
      // Reload sessions
      await loadSessions();
    } finally {
      setRevoking(null);
    }
  }

  async function logoutAllOthers() {
    try {
      const response = await fetch('/api/v1/auth/sessions/logout-all-other', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (!response.ok) throw new Error('Failed to logout other devices');
      
      // Reload sessions
      await loadSessions();
    } finally {
      setRevoking(null);
    }
  }

  if (loading) return <div>Loading sessions...</div>;

  return (
    <div className="sessions-manager">
      <h2>Active Sessions ({sessions.length})</h2>
      
      {sessions.length > 1 && (
        <button 
          onClick={logoutAllOthers}
          className="btn-danger"
        >
          Logout All Other Devices
        </button>
      )}

      <div className="sessions-list">
        {sessions.map((session) => (
          <div key={session.sessionId} className="session-item">
            <div>
              <p className="ip">{session.ipAddress}</p>
              <p className="time">
                {new Date(session.loginTime).toLocaleString()}
              </p>
              <p className="remember">
                {session.rememberMe ? '✓ 30-day session' : '⏱ 24-hour session'}
              </p>
            </div>
            
            <button
              onClick={() => revokeSession(session.sessionId)}
              disabled={revoking === session.sessionId}
              className="btn-remove"
            >
              {revoking === session.sessionId ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Common Patterns

### Protected Route Component

```jsx
export function ProtectedRoute({ children }) {
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) throw new Error('No token');

      const response = await fetch('/api/v1/auth/me', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      setIsAuth(response.ok);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (!isAuth) return <Navigate to="/login" />;
  
  return children;
}
```

### Auto-Logout on Session Expiration

```javascript
// In App component
useEffect(() => {
  // Check session every 5 minutes
  const interval = setInterval(async () => {
    try {
      const response = await fetch('/api/v1/auth/me', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        }
      });

      if (!response.ok) {
        // Session expired, logout
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('Session check failed:', err);
    }
  }, 5 * 60 * 1000);

  return () => clearInterval(interval);
}, []);
```

## Debugging Tips

### Check if Session Cookie is Present

```javascript
// In browser console
console.log(document.cookie);
// Should contain: blackpot-session=<sessionid>
```

### Verify Session in Redux/Context

```javascript
const [user, setUser] = useState(null);

useEffect(() => {
  // User info in session
  console.log('Session User:', localStorage.getItem('currentUser'));
  
  // Fetch current user
  fetch('/api/v1/auth/me', {
    credentials: 'include',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
    }
  })
  .then(r => r.json())
  .then(data => setUser(data.data));
}, []);
```

### Test Session Expiration

```javascript
// In browser console, manually expire session
// Wait 24 hours or...
// Clear Redis: redis-cli FLUSHDB
// Then try: fetch('/api/v1/protected', {credentials:'include'})
// Should get 401 Unauthorized
```

## Troubleshooting

### "401 Unauthorized" on Protected Routes
- [ ] Check cookies are sent: `credentials: 'include'`
- [ ] Check token exists: `localStorage.getItem('accessToken')`
- [ ] Check token not expired: decode JWT and check `exp`
- [ ] Check session not expired: Redis might have removed it

### "Session not persisting"
- [ ] Enable third-party cookies in browser
- [ ] Check domain matches (development: localhost)
- [ ] Verify Redis is running: `redis-cli ping`

### "Can't see other devices"
- [ ] Make sure logged in on multiple devices
- [ ] All devices should be hitting same server/Redis
- [ ] Check session endpoint: `GET /api/v1/auth/sessions`

## Environment-Specific Notes

### Development
```javascript
// Cookies work on localhost
// Fingerprinting less strict
// IP validation disabled
```

### Production
```javascript
// HTTPS required (secure cookies)
// Fingerprinting strict
// Optional IP validation
// Set COOKIE_DOMAIN=yourdomain.com
```

## Performance Considerations

1. **Minimize fetches to /auth/sessions**
   - Cache result for 30 seconds
   - Only refresh on user action

2. **Use token + session together**
   - Token for stateless API calls
   - Session for persistence

3. **Handle offline scenarios**
   - Queue requests offline
   - Retry when online

## Security Reminders

- ⚠️ Never log accessToken to console in production
- ⚠️ Always use `credentials: 'include'` for session requests
- ⚠️ Always use HTTPS in production
- ⚠️ Never expose sessionId in logs/monitoring
- ⚠️ Validate user permissions on backend, never just client-side

## Support

- Check [SESSION_MANAGEMENT.md](./SESSION_MANAGEMENT.md) for backend details
- Check [SESSION_QUICK_REFERENCE.md](./SESSION_QUICK_REFERENCE.md) for API details
- Review test examples in `backend/tests/SessionService.test.ts`

---

**Last Updated:** February 13, 2026
**Status:** Ready for Integration
