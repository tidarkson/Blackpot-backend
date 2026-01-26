# BlackPot Backend - Role-Based Access Control (RBAC) Matrix

**Version**: 1.0  
**Date**: January 23, 2026  
**Scope**: All 60+ API endpoints

---

## 📋 RBAC OVERVIEW

This document defines which roles can perform which actions across all API endpoints.

### Role Definitions

```
OWNER         │ Restaurant owner/admin - Full access
MANAGER       │ Restaurant manager - Most operations, no financial settings
SUPERVISOR    │ Shift supervisor - Active service management
SERVER        │ Wait staff - Order taking, own tables/orders
HOST          │ Hostess/Maitre d' - Reservations and seating
CHEF          │ Kitchen staff - Orders and kitchen operations
SOMMELIER     │ Wine service - Wine menu and service
DISHWASHER    │ Dishwashing - Table status (implied in full schema)
BARTENDER     │ Bar staff - Inventory and drink orders
```

### Access Levels

- ✅ **FULL** - Can read, create, update, delete
- **READ** - Can view only
- **OWN** - Can only access own data
- **LIMITED** - Can perform specific actions only
- ❌ **NONE** - No access

---

## 🔐 RBAC MATRIX BY ENDPOINT

### 1. AUTHENTICATION ENDPOINTS

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/auth/register` | POST | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/auth/login` | POST | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/auth/logout` | POST | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/auth/refresh` | POST | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/auth/password` | PUT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Notes**: All public; password reset only for self

---

### 2. USER MANAGEMENT ENDPOINTS

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/users` | GET | ✅ | ✅ | **READ** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/users` | POST | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/users/:userId` | GET | ✅ | ✅ | **READ** | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** |
| `/users/:userId` | PUT | ✅ | ✅ | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** |
| `/users/:userId` | DELETE | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/users/me` | GET | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/users/:userId/shifts` | GET | ✅ | ✅ | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** |
| `/users/:userId/shifts` | POST | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Permission Rules**:
- Users can only read/update their own profile
- Only OWNER/MANAGER can create users or view all staff list
- SUPERVISOR can read staff list (for scheduling)
- Password changes always self-only

---

### 3. TABLE MANAGEMENT ENDPOINTS

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/locations/:locationId/tables` | GET | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/tables/:tableId` | GET | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/tables/:tableId` | PUT | ✅ | ✅ | ✅ | **LIMITED** | ✅ | ❌ | ✅ | ✅ | ✅ |
| `/tables/:tableId/reservations` | GET | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Permission Rules**:
- All staff can view table floor plans
- SERVER can only update status (occupied/available), not position
- HOST can fully manage table info
- DISHWASHER can update status (table cleaned)

---

### 4. ORDER MANAGEMENT ENDPOINTS

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/orders` | GET | ✅ | ✅ | ✅ | **OWN** | ❌ | **READ** | **OWN** | ❌ | **OWN** |
| `/orders` | POST | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/orders/:orderId` | GET | ✅ | ✅ | ✅ | **OWN** | ❌ | **READ** | **OWN** | ❌ | **OWN** |
| `/orders/:orderId` | PUT | ✅ | ✅ | ✅ | **OWN** | ❌ | ❌ | **LIMITED** | ❌ | ❌ |
| `/orders/:orderId` | DELETE | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/orders/:orderId/close` | POST | ✅ | ✅ | ✅ | **OWN** | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/orders/:orderId/courses` | GET | ✅ | ✅ | ✅ | **OWN** | ❌ | ✅ | **OWN** | ❌ | **OWN** |
| `/orders/:orderId/courses` | POST | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Permission Rules**:
- SERVER owns their orders (can only see/manage own)
- CHEF can read all orders for kitchen display
- SOMMELIER can read own orders and update wine selections
- BARTENDER can read and add drink orders to own orders
- Only MANAGER can cancel orders

---

### 5. COURSE MANAGEMENT ENDPOINTS

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/orders/:orderId/courses` | GET | ✅ | ✅ | ✅ | **OWN** | ❌ | ✅ | **OWN** | ❌ | **OWN** |
| `/orders/:orderId/courses` | POST | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/courses/:courseId` | PUT | ✅ | ✅ | ✅ | **LIMITED** | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/courses/:courseId` | DELETE | ✅ | ✅ | ✅ | **LIMITED** | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/courses/:courseId/fire` | POST | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/courses/:courseId/complete` | POST | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

**Permission Rules**:
- SERVER fires courses (sends to kitchen)
- CHEF marks courses complete (ready for service)
- SERVER can modify status before firing
- Only MANAGER can fully delete courses

---

### 6. ORDER ITEMS (MENU ITEMS IN ORDER)

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/courses/:courseId/items` | GET | ✅ | ✅ | ✅ | **OWN** | ❌ | ✅ | **OWN** | ❌ | **OWN** |
| `/courses/:courseId/items` | POST | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | **LIMITED** | ❌ | **LIMITED** |
| `/items/:itemId` | PUT | ✅ | ✅ | ✅ | **OWN** | ❌ | ❌ | **LIMITED** | ❌ | **LIMITED** |
| `/items/:itemId` | DELETE | ✅ | ✅ | ✅ | **OWN** | ❌ | ❌ | ❌ | ❌ | ❌ |

**Permission Rules**:
- SOMMELIER limited to wine items only
- BARTENDER limited to beverage items only
- SERVER owns items in their orders
- Only notes/quantity can be modified after firing

---

### 7. MENU & MENU ITEMS

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/menus` | GET | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/menus` | POST | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/menus/:menuId` | GET | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/menus/:menuId` | PUT | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | **LIMITED** | ❌ | **LIMITED** |
| `/menus/:menuId/sections` | GET | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/menus/:menuId/items` | GET | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Permission Rules**:
- All staff can view menus
- Only MANAGER/OWNER can create/update menus
- SOMMELIER can update wine availability/pricing
- BARTENDER can update drink availability/pricing

---

### 8. PAYMENTS & BILLING

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/orders/:orderId/bill` | GET | ✅ | ✅ | ✅ | **OWN** | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/orders/:orderId/payments` | POST | ✅ | ✅ | ✅ | **OWN** | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/payments/:paymentId` | GET | ✅ | ✅ | ✅ | **OWN** | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/payments/:paymentId` | PUT | ✅ | ✅ | **LIMITED** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/orders/:orderId/tips` | POST | ✅ | ✅ | ✅ | **OWN** | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/orders/:orderId/tips` | GET | ✅ | ✅ | ✅ | **OWN** | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/orders/:orderId/service-charge` | POST | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Permission Rules**:
- SERVER can only view/add payments for own orders
- SUPERVISOR can only refund/adjust (not create new)
- Tips always owned by SERVER
- Service charges only by MANAGER

---

### 9. RESERVATIONS

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/reservations` | GET | ✅ | ✅ | ✅ | **READ** | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/reservations` | POST | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/reservations/:reservationId` | GET | ✅ | ✅ | ✅ | **READ** | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/reservations/:reservationId` | PUT | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/reservations/:reservationId` | DELETE | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/reservations/:reservationId/seat` | POST | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Permission Rules**:
- HOST manages all reservations
- MANAGER can modify reservations
- SERVER can see reservations for awareness
- SUPERVISOR can seat/modify during shift

---

### 10. KITCHEN DISPLAY SYSTEM (KDS)

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/kitchen/stations` | GET | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `/kitchen/stations/:stationId` | GET | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `/kitchen/stations/:stationId/orders` | GET | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `/kitchen/orders?status=FIRED` | GET | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `/courses/:courseId/complete` | PUT | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `/kitchen/metrics` | GET | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

**Permission Rules**:
- CHEF/MANAGER primary users of KDS
- Only CHEF/SUPERVISOR can mark courses complete
- SUPERVISOR can manage multiple stations during service

---

### 11. INVENTORY & SUPPLIERS

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/inventory` | GET | ✅ | ✅ | **READ** | ❌ | ❌ | **LIMITED** | **LIMITED** | ❌ | **LIMITED** |
| `/inventory/:itemId` | GET | ✅ | ✅ | **READ** | ❌ | ❌ | **LIMITED** | **LIMITED** | ❌ | **LIMITED** |
| `/inventory/:itemId` | PUT | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/inventory/:itemId/movements` | POST | ✅ | ✅ | **LIMITED** | ❌ | ❌ | **LIMITED** | ❌ | ❌ | ❌ |
| `/inventory/low-stock` | GET | ✅ | ✅ | ✅ | ❌ | ❌ | **LIMITED** | **LIMITED** | ❌ | **LIMITED** |
| `/suppliers` | GET | ✅ | ✅ | **READ** | ❌ | ❌ | **READ** | ❌ | ❌ | ❌ |
| `/suppliers` | POST | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Permission Rules**:
- CHEF can see produce/protein inventory (not wine)
- SOMMELIER can see wine inventory (not food)
- BARTENDER can see beverage inventory
- Only MANAGER can modify quantities
- CHEF/SOMMELIER can log movements (usage)

---

### 12. REPORTS & ANALYTICS

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/reports/daily` | GET | ✅ | ✅ | **READ** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/reports/weekly` | GET | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/reports/monthly` | GET | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/reports/server/:serverId` | GET | ✅ | ✅ | ❌ | **OWN** | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/reports/revenue` | GET | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/reports/kitchen-metrics` | GET | ✅ | ✅ | ✅ | ❌ | ❌ | **READ** | ❌ | ❌ | ❌ |
| `/reports/inventory-cost` | GET | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Permission Rules**:
- OWNER only: Monthly, revenue, inventory cost
- MANAGER: Daily, weekly, server performance
- SUPERVISOR: Can see daily report
- SERVER: Can see own performance only
- CHEF: Can see kitchen metrics (prep times, etc.)

---

### 13. BUSINESS OPERATIONS

| Endpoint | Method | OWNER | MANAGER | SUPERVISOR | SERVER | HOST | CHEF | SOMMELIER | DISHWASHER | BARTENDER |
|----------|--------|-------|---------|------------|--------|------|------|-----------|------------|-----------|
| `/shifts` | GET | ✅ | ✅ | ✅ | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** |
| `/shifts` | POST | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/shifts/:shiftId` | GET | ✅ | ✅ | ✅ | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** | **OWN** |
| `/shifts/:shiftId` | PUT | ✅ | ✅ | **LIMITED** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/business-day/open` | POST | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/business-day/close` | POST | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/business-day/:date` | GET | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Permission Rules**:
- MANAGER opens/closes business day
- SUPERVISOR can only view/modify clocking times
- Staff can only see own shifts
- Business day summary limited to MANAGER/OWNER

---

## 🚀 IMPLEMENTATION GUIDELINES

### Middleware Pattern

```typescript
// Example: Implement middleware for role-based protection

async function requireRole(...allowedRoles: UserRole[]) {
  return async (req, res, next) => {
    const user = req.user; // From JWT
    
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        status: 'error',
        code: 403,
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }
    
    next();
  };
}

// Usage:
app.get('/users', requireRole('OWNER', 'MANAGER'), getUsersController);
```

### Ownership Pattern

```typescript
// For endpoints with OWN access
async function verifyOwnership(resource, userId) {
  if (resource.userId !== userId && user.role !== 'MANAGER') {
    throw new ForbiddenError('Cannot access other users resources');
  }
}
```

### Limited Action Pattern

```typescript
// For LIMITED access (e.g., SOMMELIER can only update wine items)
async function updateMenu(req, res) {
  const { menuId } = req.params;
  const menu = await getMenu(menuId);
  
  // SOMMELIER can only update wine-related items
  if (req.user.role === 'SOMMELIER') {
    const updates = req.body;
    
    // Filter to only wine fields
    updates = {
      wineItems: updates.wineItems,
      winePricing: updates.winePricing
    };
  }
  
  return updateMenuWithChanges(menu, updates);
}
```

---

## 📊 PERMISSION SUMMARY BY ROLE

### OWNER
```
✅ Full access to all endpoints
✅ Can create/delete users, menus, suppliers
✅ Can view all reports and analytics
✅ Can manage financial settings
```

### MANAGER
```
✅ Can manage staff (create, view, edit)
✅ Can manage orders, payments, reservations
✅ Can view daily/weekly reports
✅ Can manage inventory
✅ Cannot: Monthly reports, financial settings, supplier management
```

### SUPERVISOR
```
✅ Can view active orders and reservations
✅ Can manage table status during service
✅ Can complete courses from kitchen
✅ Can view daily reports
✅ Cannot: Edit inventory, create users, view financial data
```

### SERVER
```
✅ Can create orders for own tables
✅ Can manage own courses and items
✅ Can process own payments and tips
✅ Can see own performance metrics
✅ Cannot: View other servers' orders, manage staff, view financial data
```

### HOST
```
✅ Can create/manage/cancel reservations
✅ Can view tables and seating chart
✅ Can seat reservations
✅ Can see reservations for their section
✅ Cannot: Access kitchen, financial, or inventory data
```

### CHEF
```
✅ Can view all kitchen orders and stations
✅ Can mark courses complete
✅ Can view kitchen performance metrics
✅ Can see relevant inventory (food items)
✅ Cannot: Modify menus, access payments, manage reservations
```

### SOMMELIER
```
✅ Can view wine menu items
✅ Can update wine availability/pricing
✅ Can view wine inventory
✅ Can manage wine orders and notes
✅ Cannot: Modify other menu sections, access kitchen display
```

### DISHWASHER
```
✅ Can update table status (cleaned)
✅ Can view table assignments
✅ Cannot: Access orders, payments, or other systems
```

### BARTENDER
```
✅ Can view beverage inventory
✅ Can add drink orders to orders
✅ Can manage beverage pricing
✅ Cannot: Access financial data or payment systems
```

---

## ⚠️ SPECIAL CASES & EDGE CASES

### Case 1: Server Accessing Own vs. Manager Accessing Server's Order

```typescript
GET /api/v1/orders/order-123

// If user is SERVER and owns order-123 → ✅ ALLOWED
// If user is SERVER and doesn't own order-123 → ❌ DENIED
// If user is MANAGER → ✅ ALLOWED (always)
// If user is CHEF → ✅ READ (for kitchen display)
```

### Case 2: Updating Menu Items (Multi-Role)

```typescript
PUT /api/v1/menus/menu-1/items/wine-item-1

// OWNER → ✅ Can update price, description, availability
// MANAGER → ✅ Can update price, availability
// SOMMELIER → ✅ Can update availability, pricing (wine only)
// BARTENDER → ✅ Can update availability, pricing (beverage only)
// CHEF → ❌ DENIED (unless modifying own section)
```

### Case 3: Inventory Stock Movement Logging

```typescript
POST /api/v1/inventory/inv-123/movements

// MANAGER → ✅ Full access (any movement type)
// CHEF → ✅ Limited (usage movements only for food)
// SOMMELIER → ✅ Limited (usage movements only for wine)
// SERVER → ❌ DENIED
```

### Case 4: Service Charge Application

```typescript
POST /api/v1/orders/order-123/service-charge

// OWNER → ✅ Can apply any service charge
// MANAGER → ✅ Can apply standard service charges
// SUPERVISOR → ❌ DENIED (must use default settings)
// SERVER → ❌ DENIED
```

---

## 🔄 AUDIT LOGGING REQUIREMENTS

All role-based actions should be logged:

```typescript
// Log when role-protected action is taken
logger.info({
  action: 'CREATE_USER',
  performedBy: req.user.id,
  performedByRole: req.user.role,
  resourceId: newUser.id,
  resourceType: 'USER',
  timestamp: new Date(),
  tenantId: req.user.tenantId,
  ipAddress: req.ip
});

// Log when role-protected action is DENIED
logger.warn({
  action: 'CREATE_USER',
  performedBy: req.user.id,
  performedByRole: req.user.role,
  result: 'DENIED',
  reason: 'INSUFFICIENT_PERMISSIONS',
  timestamp: new Date()
});
```

---

## ✅ VERIFICATION CHECKLIST

- [ ] All 9 roles properly implemented in database
- [ ] JWT token includes role field
- [ ] All endpoints have role guards
- [ ] Audit logging captures all role-based decisions
- [ ] Tests verify access denied for unauthorized roles
- [ ] Multi-role endpoints tested for each role
- [ ] OWN access verified (comparing IDs)
- [ ] LIMITED access filters applied correctly
- [ ] Error responses consistent (403 for forbidden)
- [ ] Documentation matches implementation

---

**Next Steps**:
1. Use this matrix to implement middleware
2. Create role-based route guards
3. Add tests for each permission combination
4. Set up audit logging
5. Deploy and monitor for unauthorized attempts

See `ENDPOINTS_SPECIFICATION.md` for detailed endpoint documentation.
