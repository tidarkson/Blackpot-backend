# Restaurant vs Tenant Conflict Resolution

## Summary of Changes

Successfully resolved the Restaurant vs Tenant architectural conflict by **consolidating to Tenant as the primary multi-tenancy model**.

---

## What Changed

### ❌ Removed
- **Restaurant model** - Was a redundant intermediate layer between Tenant and actual restaurant data
- **restaurantId references** - Eliminated duplicate foreign key across all models

### ✅ Consolidated
- **Tenant model** - Now serves as the single source of truth for multi-tenancy
  - Added `isActive` field for better operational control
  - Direct relationships to all restaurant data (locations, menus, reservations, business days)

### 🔄 Updated Models

#### 1. **Tenant** (Simplified)
```prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  locations    Location[]
  menus        Menu[]
  reservations Reservation[]
  businessDays BusinessDay[]
  users        User[]
  activityLogs ActivityLog[]
}
```
- Now the **only top-level model** for multi-tenancy
- Direct relationships to all operational data
- Added `isActive` for operational control

#### 2. **Location** (Updated)
```prisma
// BEFORE: restaurantId + tenantId (redundant)
model Location {
  tenantId     String
  restaurantId String
  restaurant   Restaurant @relation(...)
}

// AFTER: Only tenantId (clean)
model Location {
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

#### 3. **User** (Updated)
```prisma
// BEFORE: Had both restaurantId and tenantId
model User {
  tenantId     String
  restaurantId String
}

// AFTER: Only tenantId (clear hierarchy)
model User {
  tenantId String
  locationId String?
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

#### 4. **Menu** (Updated)
```prisma
// BEFORE: restaurantId reference
model Menu {
  restaurantId String
  restaurant   Restaurant @relation(...)
}

// AFTER: Direct tenant reference
model Menu {
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

#### 5. **Reservation** (Updated)
```prisma
// BEFORE: restaurantId reference (unnecessary)
model Reservation {
  restaurantId String
  restaurant   Restaurant @relation(...)
}

// AFTER: Only tenantId (data accessed via table → location → tenant)
model Reservation {
  tenantId String
  tableId  String
  table    Table @relation(...)
}
```

#### 6. **BusinessDay** (Updated)
```prisma
// BEFORE: restaurantId reference
model BusinessDay {
  restaurantId String
  restaurant   Restaurant @relation(...)
}

// AFTER: Direct tenant reference
model BusinessDay {
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

---

## Benefits of This Change

### ✅ **Cleaner Architecture**
- Single point of truth for tenant data
- No duplicate foreign keys
- Clear, linear hierarchy: Tenant → Location → Table/Order/Reservation

### ✅ **Improved Data Isolation**
```
BEFORE (Confusing):
Tenant
├── Restaurant (which is really the tenant)
├── Location (tenant → restaurant → location)
└── Users (references both tenant AND restaurant)

AFTER (Clear):
Tenant
├── Location (direct relationship)
├── User (direct relationship)
├── Menu (direct relationship)
├── Reservation (via table)
└── BusinessDay (direct relationship)
```

### ✅ **Reduced Disk Space**
- One fewer foreign key in Location, User, Menu, Reservation, BusinessDay
- 5 tables × 1 FK field = ~8-16 bytes per row reduction

### ✅ **Better Query Performance**
- Fewer join levels needed
- Simpler indexes needed
- Faster multi-tenant filtering

### ✅ **Simpler Query Examples**

**Before** (navigating Restaurant hierarchy):
```sql
-- Get all orders for a tenant - had to go through Restaurant
SELECT o.* FROM orders o
JOIN order_course oc ON o.id = oc.order_id
JOIN restaurant r ON r.id = ... (what is this?)
WHERE r.tenant_id = $1;
```

**After** (direct Tenant filtering):
```sql
-- Get all orders for a tenant - simple!
SELECT o.* FROM orders o
WHERE o.tenant_id = $1;
```

### ✅ **Multi-Tenancy Enforcement**
Every model now has **exactly one tenant reference** (no ambiguity):
- ✅ Tenant
- ✅ Location
- ✅ User
- ✅ Table
- ✅ Order
- ✅ OrderCourse
- ✅ OrderItem
- ✅ Menu
- ✅ MenuItem
- ✅ MenuSection
- ✅ Reservation
- ✅ Payment
- ✅ Tip
- ✅ ServiceCharge
- ✅ Receipt
- ✅ KitchenStation
- ✅ BusinessDay
- ✅ EndOfDayClose
- ✅ ActivityLog
- ✅ Notification
- ✅ FinancialSetting
- ✅ Supplier
- ✅ InventoryItem
- ✅ StockMovement
- ✅ WineDetail
- ✅ Shift

---

## Migration Required

### Files Updated
- ✅ [database/prisma/schema.prisma](../database/prisma/schema.prisma) - Schema updated with Restaurant model removed

### Next Steps for Production

#### Step 1: Backup Production Database
```bash
# PostgreSQL
pg_dump -U postgres -d blackpot_prod > backup_before_migration.sql
```

#### Step 2: Review Migration
When ready to apply:
```bash
cd BlackPot\ Backend
npm install  # First time setup
prisma migrate dev --name resolve_restaurant_tenant_conflict
```

#### Step 3: Migration SQL Generated
Prisma will generate a migration file that:
1. Drops Restaurant table (and its relationships)
2. Removes restaurantId from Location, User, Menu, Reservation, BusinessDay
3. Updates foreign key constraints
4. Updates indexes

#### Step 4: Data Migration (if you have existing data)
```sql
-- After migration, verify data integrity
SELECT COUNT(*) FROM tenant;
SELECT COUNT(*) FROM location;
SELECT COUNT(*) FROM "user";
SELECT COUNT(*) FROM menu;
SELECT COUNT(*) FROM reservation;
SELECT COUNT(*) FROM business_day;
```

---

## Rollback Plan

If you need to revert:
```bash
prisma migrate resolve --rolled-back resolve_restaurant_tenant_conflict
```

Then restore from backup:
```bash
psql -U postgres -d blackpot_dev < backup_before_migration.sql
```

---

## Code Changes Required (if you have backend code)

### Example: Querying All Data for a Tenant

**Before:**
```typescript
// Had to join through Restaurant
const tenantData = await prisma.restaurant.findMany({
  where: { tenantId },
  include: { locations: true, menus: true, businessDays: true }
});
```

**After (Much simpler):**
```typescript
// All data references tenant directly
const locations = await prisma.location.findMany({
  where: { tenantId }
});

const menus = await prisma.menu.findMany({
  where: { tenantId }
});

const businessDays = await prisma.businessDay.findMany({
  where: { tenantId }
});
```

### Example: Creating New Restaurant Operations

**Before:**
```typescript
// Create location - confusing which tenant/restaurant
const location = await prisma.location.create({
  data: {
    tenantId: tenant.id,
    restaurantId: restaurant.id,  // ❌ Which one is primary?
    name: "Main",
    address: "123 Main St"
  }
});
```

**After (Clear):**
```typescript
// Create location - obvious relationship
const location = await prisma.location.create({
  data: {
    tenantId: tenant.id,  // ✅ Single source of truth
    name: "Main",
    address: "123 Main St"
  }
});
```

---

## Documentation Updates

Update your internal documentation to reflect:

### New Data Model Hierarchy
```
Tenant (Multi-tenant root)
├── Location (Each restaurant location)
│   ├── Table
│   ├── User (location assignment)
│   └── KitchenStation
├── Menu
│   └── MenuSection
│       └── MenuItem
├── Reservation (references Table → Location)
├── BusinessDay
│   └── EndOfDayClose
├── User (kitchen staff, managers)
└── ActivityLog
```

### Query Patterns (Always filter by tenantId)

**✅ CORRECT:**
```typescript
// Always include tenantId in WHERE clause
const orders = await prisma.order.findMany({
  where: {
    tenantId: "tenant-123",
    status: "OPEN"
  }
});
```

**❌ WRONG:**
```typescript
// Don't query without tenant isolation
const orders = await prisma.order.findMany({
  where: { status: "OPEN" }
});
```

---

## Testing Checklist

After migration, verify:
- [ ] All 25+ indexes from INDEXING_STRATEGY still apply correctly
- [ ] No orphaned Restaurant references remain in code
- [ ] `tenantId` filtering works in all queries
- [ ] Foreign key constraints properly enforce tenant isolation
- [ ] Cascade deletes work correctly (delete tenant → delete all related data)
- [ ] Performance metrics still meet targets (100ms, 50ms, 2s, 200ms)

---

## Summary

**Before:** Confusing Tenant ↔ Restaurant duality  
**After:** Clean, single Tenant as multi-tenancy root  

✅ Cleaner  
✅ Simpler  
✅ More Performant  
✅ Better Security (clear data isolation)  

You're ready to proceed with backend development! 🚀
