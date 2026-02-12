# Redis Caching - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Start Redis Locally

```bash
# Start Redis with Docker
docker-compose up -d redis

# Verify Redis is running
docker-compose logs redis
# Should see: "Ready to accept connections"
```

### 2. Use Cache in Your Controller

```typescript
import { cacheService, CACHE_TTL, CACHE_KEYS } from '../services/CacheService';

// Simple cache-aside pattern
async function getMenus(req: Request, res: Response) {
  const restaurantId = req.tenant.id;
  const cacheKey = `${CACHE_KEYS.MENU}${restaurantId}`;

  const menus = await cacheService.getWithCacheAside(
    cacheKey,
    () => Menu.findAll({ where: { restaurant_id: restaurantId } }),
    CACHE_TTL.MENU_ITEMS // 1 hour
  );

  res.json(menus);
}
```

### 3. Add Cache Middleware to Route

```typescript
import { cacheMiddleware, CACHE_TTL } from '../middleware/cache.middleware';

router.get('/api/menus',
  cacheMiddleware({ ttl: CACHE_TTL.MENU_ITEMS }),
  menuController.getMenus
);
```

### 4. Invalidate Cache on Update

```typescript
import { cacheInvalidationMiddleware, CACHE_KEYS } from '../middleware/cache.middleware';

router.put('/api/menus/:id',
  cacheInvalidationMiddleware(`${CACHE_KEYS.MENU}*`),
  menuController.updateMenu
);
```

## 📋 Common Examples

### Cache Menu Items
```typescript
const menus = await cacheService.getWithCacheAside(
  `menu:${restaurantId}`,
  () => Menu.findAll({ where: { restaurant_id: restaurantId } }),
  CACHE_TTL.MENU_ITEMS // 1 hour
);
```

### Cache Inventory Stock
```typescript
const stock = await cacheService.getWithCacheAside(
  `inventory:${restaurantId}:stock`,
  () => InventoryItem.findAll({ where: { restaurant_id: restaurantId } }),
  CACHE_TTL.INVENTORY_LEVELS // 5 minutes
);
```

### Cache Dashboard Stats
```typescript
const stats = await cacheService.getWithCacheAside(
  `dashboard:${restaurantId}:stats`,
  () => getDashboardStats(restaurantId),
  CACHE_TTL.DASHBOARD // 1 minute
);
```

### Store Session Data
```typescript
await cacheService.hmset(`session:${userId}`, {
  user_id: userId,
  email: user.email,
  role: user.role,
  login_time: new Date().toISOString()
});
await cacheService.setTTL(`session:${userId}`, CACHE_TTL.SESSION);
```

### Rate Limiting Counter
```typescript
const attempts = await cacheService.increment(
  `ratelimit:${userId}:login`,
  1,
  CACHE_TTL.RATE_LIMIT // 60 seconds
);

if (attempts > 5) {
  return res.status(429).json({ error: 'Too many attempts' });
}
```

## 🧪 Testing

### With Mock Cache (No Redis Needed)
```typescript
import { MockCacheService, cacheTestUtils, cacheTestSetup } from '../utils/cacheTestUtils';

describe('Menu Caching', () => {
  let cache: MockCacheService;

  beforeEach(async () => {
    cache = new MockCacheService();
    await cacheTestSetup.beforeEach();
  });

  test('should cache menu', async () => {
    const menu = { id: 1, name: 'Main' };
    await cache.set('menu:1', menu);
    const cached = await cache.get('menu:1');
    expect(cached).toEqual(menu);
  });
});
```

### Test Cache Hit Rate
```typescript
const result = await cacheTestUtils.testCacheHitRate([
  { key: 'menu:1', fetch: getMenu },
  { key: 'items:1', fetch: getItems }
], 100);

console.log(`Hit Rate: ${result.hitRate.toFixed(2)}%`);
```

### Measure Performance
```typescript
const perf = await cacheTestUtils.measurePerformance(
  'menu_fetch',
  () => cacheService.get('menu:1'),
  100
);

console.log(`Avg: ${perf.avgTime.toFixed(2)}ms`);
```

## 🔍 Check Cache Status

```typescript
import { isRedisAvailable, getRedisHealth } from '../utils/cacheTestUtils';

// Is Redis running?
const available = await isRedisAvailable();

// Detailed health
const health = await getRedisHealth();
console.log(health);
// { connected: true, status: 'ready', canPing: true }
```

## 🛠️ Cache TTL Values

```typescript
CACHE_TTL.MENU_ITEMS = 3600       // 1 hour
CACHE_TTL.INVENTORY = 300         // 5 minutes
CACHE_TTL.RECENT_ORDERS = 60      // 1 minute
CACHE_TTL.SESSION = 86400         // 24 hours
CACHE_TTL.RATE_LIMIT = 60         // 1 minute
CACHE_TTL.DASHBOARD = 60          // 1 minute
```

## 🚀 Environment Setup

```env
# .env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=
REDIS_ENABLED=true
```

## 📊 Expected Performance

- **Dashboard**: 5-8s → 300-500ms ✅
- **Menu API**: 2.5s → 300ms ✅
- **DB CPU**: 85% → 15% ✅
- **Cache hit rate**: 80%+ ✅

## ⚠️ Gotchas

1. **Multi-tenant isolation**: Always include restaurant/user ID in cache key
   ```typescript
   // ✅ Good
   const key = `menu:${restaurantId}:items`;
   
   // ❌ Bad (data leak between tenants)
   const key = `menu:items`;
   ```

2. **Cache invalidation**: Update both cache and DB
   ```typescript
   // ✅ Good
   await cacheService.invalidate(cacheKey);
   await Menu.update(data, { where: { id } });
   
   // ❌ Bad (stale cache)
   await Menu.update(data, { where: { id } });
   ```

3. **JSON serialization**: Use objects, not special types
   ```typescript
   // ✅ Good
   await cacheService.set(key, { id: 1, date: date.toISOString() });
   
   // ❌ Bad (Dates don't serialize)
   await cacheService.set(key, { id: 1, date: new Date() });
   ```

## 🆘 Troubleshooting

### Redis not connecting?
```bash
# Check if Redis is running
docker-compose ps redis

# Verify connection
redis-cli ping
# Should return: PONG

# Check logs
docker-compose logs redis
```

### Cache not working?
```typescript
// Check Redis status
const health = await getRedisHealth();
console.log(health);

// Force clear cache
await cacheService.clear();

// Try again
```

### Stale data?
```typescript
// Manual cache clear
await cacheService.invalidatePattern('menu:*');

// Or specific key
await cacheService.invalidate(`menu:${restaurantId}`);
```

## 📚 Full Documentation

See [REDIS_SETUP_GUIDE.md](./REDIS_SETUP_GUIDE.md) for complete documentation.

## 🎯 Next Steps

1. Add caching to your endpoints
2. Run: `npm test` to verify caching works
3. Measure performance improvement
4. Monitor in Sentry dashboard
5. Adjust TTLs based on your needs

---

**Pro Tip**: Start with high-traffic endpoints first (menu list, dashboard, inventory). Measure before and after to see the performance gain! 🚀
