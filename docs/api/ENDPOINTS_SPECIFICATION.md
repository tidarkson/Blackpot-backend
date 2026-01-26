# BlackPot Backend - Complete API Endpoint Specification

**Version**: 1.0  
**Date**: January 23, 2026  
**Status**: Ready for Implementation  

---

## 📑 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [Resource Endpoints](#resource-endpoints)
4. [Response Format](#response-format)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Endpoint Reference](#endpoint-reference)

---

## OVERVIEW

### API Architecture
- **Framework**: Express.js (recommended) / Fastify / NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT (Bearer tokens)
- **Authorization**: Role-Based Access Control (RBAC)

### Core Principles
1. **Multi-Tenancy**: All endpoints filtered by `tenantId` (from JWT)
2. **Role-Based Access**: Every endpoint has role requirements
3. **Soft Deletes**: Deleted items have `deletedAt` timestamp
4. **Timestamps**: All resources have `createdAt`, `updatedAt`
5. **Decimal Money**: All prices/amounts use Decimal type

### Base URL
```
Development:  http://localhost:3000/api/v1
Staging:      https://staging-api.blackpot.com/api/v1
Production:   https://api.blackpot.com/api/v1
```

---

## AUTHENTICATION & AUTHORIZATION

### Authentication Flow

```
1. POST /auth/login
   ├─ Username/Email + Password
   └─ Response: { accessToken, refreshToken, user }

2. Use accessToken in all requests
   ├─ Header: Authorization: Bearer <accessToken>
   └─ Token includes: userId, tenantId, role, permissions

3. Token expires in 24 hours
   └─ POST /auth/refresh to get new token
```

### Role Hierarchy

```
┌──────────────────────────────────────────┐
│ OWNER (Admin)                            │
│ └─ Can do everything                     │
│                                          │
├──────────────────────────────────────────┤
│ MANAGER (Supervisor)                     │
│ └─ Can manage staff, view reports        │
│                                          │
├──────────────────────────────────────────┤
│ SUPERVISOR (Shift Lead)                  │
│ └─ Can manage active service             │
│                                          │
├──────────────────────────────────────────┤
│ SERVER (Wait Staff)                      │
│ └─ Can manage own orders/tables          │
│                                          │
├──────────────────────────────────────────┤
│ HOST (Hostess/Maitre D')                 │
│ └─ Can manage reservations, seating      │
│                                          │
├──────────────────────────────────────────┤
│ CHEF (Kitchen)                           │
│ └─ Can view kitchen display system       │
│                                          │
├──────────────────────────────────────────┤
│ SOMMELIER (Wine Service)                 │
│ └─ Can manage wine menu and service      │
│                                          │
└──────────────────────────────────────────┘
```

### Authorization Examples

```typescript
// Only OWNER can access
GET /api/v1/admin/reports/financial
[Authorization: OWNER]

// MANAGER and above
GET /api/v1/admin/staff
[Authorization: OWNER, MANAGER]

// SERVER can only access their own orders
GET /api/v1/orders/:orderId
[Authorization: OWNER, MANAGER, SERVER (if serverId matches)]

// CHEF can only view kitchen orders
GET /api/v1/kitchen/orders
[Authorization: OWNER, MANAGER, CHEF]
```

---

## RESOURCE ENDPOINTS

### 1. AUTHENTICATION (Auth)

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| POST | `/auth/register` | Create account | None | Public |
| POST | `/auth/login` | Login with credentials | None | Public |
| POST | `/auth/logout` | Logout (invalidate token) | JWT | All |
| POST | `/auth/refresh` | Get new access token | JWT | All |
| POST | `/auth/reset-password` | Request password reset | None | Public |
| PUT | `/auth/password` | Update password | JWT | All |

**Example: Login**
```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "server1@blackpot.com",
  "password": "secure_password"
}

Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-123",
    "email": "server1@blackpot.com",
    "name": "Alex Johnson",
    "role": "SERVER",
    "tenantId": "tenant-123",
    "locationId": "location-456"
  }
}
```

---

### 2. USERS (Staff Management)

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/users` | List all staff | JWT | OWNER, MANAGER |
| POST | `/users` | Create new staff | JWT | OWNER, MANAGER |
| GET | `/users/:userId` | Get staff details | JWT | OWNER, MANAGER, SELF |
| PUT | `/users/:userId` | Update staff | JWT | OWNER, MANAGER, SELF |
| DELETE | `/users/:userId` | Deactivate staff | JWT | OWNER, MANAGER |
| GET | `/users/me` | Get current user | JWT | All |
| GET | `/users/:userId/shifts` | Get user shifts | JWT | OWNER, MANAGER, SELF |
| POST | `/users/:userId/shifts` | Create shift | JWT | OWNER, MANAGER |

**Example: Create Server**
```bash
POST /api/v1/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newserver@blackpot.com",
  "name": "New Server",
  "role": "SERVER",
  "locationId": "location-456",
  "password": "initial_password"
}

Response: 201 Created
{
  "id": "user-789",
  "email": "newserver@blackpot.com",
  "name": "New Server",
  "role": "SERVER",
  "isActive": true,
  "locationId": "location-456",
  "tenantId": "tenant-123",
  "createdAt": "2026-01-23T10:30:00Z",
  "updatedAt": "2026-01-23T10:30:00Z"
}
```

---

### 3. TABLES (Floor Management)

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/locations/:locationId/tables` | Get all tables | JWT | All |
| GET | `/tables/:tableId` | Get table details | JWT | All |
| PUT | `/tables/:tableId` | Update table status/position | JWT | OWNER, MANAGER, SUPERVISOR, HOST |
| GET | `/tables/:tableId/reservations` | Get table reservations | JWT | All |
| GET | `/tables/:tableId/current-order` | Get active order | JWT | All |

**Example: Get Floor Plan (All Tables)**
```bash
GET /api/v1/locations/location-456/tables
Authorization: Bearer <token>

Response: 200 OK
[
  {
    "id": "table-1",
    "locationId": "location-456",
    "name": "Table 1",
    "capacity": 2,
    "status": "OCCUPIED",
    "x": 1.0,
    "y": 1.0,
    "width": 0.8,
    "height": 0.8,
    "currentOrderId": "order-123",
    "upcomingReservation": null
  },
  {
    "id": "table-2",
    "name": "Table 2",
    "capacity": 4,
    "status": "AVAILABLE",
    ...
  }
]
```

---

### 4. ORDERS (Core POS)

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/orders` | List orders (filtered) | JWT | All |
| POST | `/orders` | Create new order | JWT | SERVER, MANAGER |
| GET | `/orders/:orderId` | Get order details | JWT | SERVER (own), MANAGER, CHEF |
| PUT | `/orders/:orderId` | Update order | JWT | SERVER (own), MANAGER |
| DELETE | `/orders/:orderId` | Cancel order (soft delete) | JWT | MANAGER, SUPERVISOR |
| POST | `/orders/:orderId/close` | Close order (payment) | JWT | SERVER (own), MANAGER |
| GET | `/orders/:orderId/courses` | Get order courses | JWT | All |
| POST | `/orders/:orderId/courses` | Add course to order | JWT | SERVER, MANAGER |

**Example: Create Order**
```bash
POST /api/v1/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "tableId": "table-1",
  "guestCount": 2,
  "serverId": "user-123"
}

Response: 201 Created
{
  "id": "order-123",
  "tableId": "table-1",
  "serverId": "user-123",
  "status": "OPEN",
  "guestCount": 2,
  "openedAt": "2026-01-23T19:00:00Z",
  "courses": [],
  "total": 0.00,
  "createdAt": "2026-01-23T19:00:00Z"
}
```

---

### 5. ORDER COURSES (Kitchen Flow)

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/orders/:orderId/courses` | List courses | JWT | All |
| POST | `/orders/:orderId/courses` | Create course | JWT | SERVER, MANAGER |
| PUT | `/courses/:courseId` | Update course status | JWT | CHEF, MANAGER |
| DELETE | `/courses/:courseId` | Remove course | JWT | MANAGER |
| POST | `/courses/:courseId/fire` | Fire course to kitchen | JWT | SERVER, MANAGER |
| POST | `/courses/:courseId/complete` | Mark course ready | JWT | CHEF, MANAGER |

**Example: Fire Course to Kitchen**
```bash
POST /api/v1/courses/course-456/fire
Authorization: Bearer <token>
Content-Type: application/json

{
  "kitchenStationId": "station-grill",
  "notes": "Medium-rare, no salt"
}

Response: 200 OK
{
  "id": "course-456",
  "orderId": "order-123",
  "courseType": "MAIN",
  "status": "FIRED",
  "kitchenStationId": "station-grill",
  "firedAt": "2026-01-23T19:15:00Z",
  "items": [...]
}
```

---

### 6. ORDER ITEMS (Menu Items in Order)

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/courses/:courseId/items` | List items | JWT | All |
| POST | `/courses/:courseId/items` | Add menu item | JWT | SERVER, MANAGER |
| PUT | `/items/:itemId` | Update item (quantity, notes) | JWT | SERVER, MANAGER |
| DELETE | `/items/:itemId` | Remove item | JWT | SERVER, MANAGER |

**Example: Add Item to Course**
```bash
POST /api/v1/courses/course-456/items
Authorization: Bearer <token>
Content-Type: application/json

{
  "menuItemId": "menu-item-789",
  "quantity": 2,
  "specialNotes": "Medium rare, no salt"
}

Response: 201 Created
{
  "id": "item-999",
  "courseId": "course-456",
  "menuItemId": "menu-item-789",
  "quantity": 2,
  "specialNotes": "Medium rare, no salt",
  "status": "PENDING"
}
```

---

### 7. MENU (Restaurant Menu)

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/menus` | List menus | JWT | All |
| POST | `/menus` | Create menu | JWT | OWNER, MANAGER |
| GET | `/menus/:menuId` | Get menu details | JWT | All |
| PUT | `/menus/:menuId` | Update menu | JWT | OWNER, MANAGER |
| GET | `/menus/:menuId/sections` | Get menu sections | JWT | All |
| GET | `/menus/:menuId/items` | Get all items | JWT | All |

**Example: Get Current Menu**
```bash
GET /api/v1/menus?active=true
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "menu-1",
  "name": "Seasonal Tasting Menu",
  "version": 1,
  "isActive": true,
  "sections": [
    {
      "id": "section-appetizers",
      "name": "Appetizers",
      "position": 1,
      "items": [
        {
          "id": "item-1",
          "name": "Oysters 3 Ways",
          "description": "Fresh oysters prepared classically...",
          "price": 24.00,
          "isAvailable": true
        }
      ]
    }
  ]
}
```

---

### 8. PAYMENTS & BILLING

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/orders/:orderId/bill` | Get order bill | JWT | SERVER (own), MANAGER |
| POST | `/orders/:orderId/payments` | Add payment | JWT | SERVER (own), MANAGER |
| GET | `/payments/:paymentId` | Get payment details | JWT | MANAGER |
| PUT | `/payments/:paymentId` | Update payment | JWT | MANAGER |
| POST | `/orders/:orderId/tips` | Add tip | JWT | SERVER (own), MANAGER |
| GET | `/orders/:orderId/tips` | Get tips | JWT | SERVER (own), MANAGER |
| POST | `/orders/:orderId/service-charge` | Add service charge | JWT | MANAGER |

**Example: Get Bill**
```bash
GET /api/v1/orders/order-123/bill
Authorization: Bearer <token>

Response: 200 OK
{
  "orderId": "order-123",
  "subtotal": 125.50,
  "tax": 10.35,
  "serviceCharge": 0.00,
  "tipSuggestions": [18.83, 22.60, 26.38],
  "total": 135.85,
  "items": [
    {
      "description": "Oysters 3 Ways × 1",
      "price": 24.00
    }
  ]
}
```

---

### 9. RESERVATIONS (Table Booking)

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/reservations` | List reservations | JWT | All |
| POST | `/reservations` | Create reservation | JWT | HOST, MANAGER, OWNER |
| GET | `/reservations/:reservationId` | Get reservation | JWT | All |
| PUT | `/reservations/:reservationId` | Update reservation | JWT | HOST, MANAGER |
| DELETE | `/reservations/:reservationId` | Cancel reservation | JWT | HOST, MANAGER |
| POST | `/reservations/:reservationId/seat` | Seat reservation | JWT | HOST, MANAGER |
| GET | `/reservations/date/:date` | Get day's reservations | JWT | All |

**Example: Create Reservation**
```bash
POST /api/v1/reservations
Authorization: Bearer <token>
Content-Type: application/json

{
  "guestName": "John Smith",
  "guestEmail": "john@example.com",
  "guestPhone": "+1-555-0100",
  "guestCount": 4,
  "reservedAt": "2026-01-25T19:00:00Z",
  "tableId": "table-6"
}

Response: 201 Created
{
  "id": "reservation-1",
  "guestName": "John Smith",
  "guestCount": 4,
  "reservedAt": "2026-01-25T19:00:00Z",
  "status": "CONFIRMED",
  "table": {
    "id": "table-6",
    "name": "Table 6",
    "capacity": 6
  }
}
```

---

### 10. KITCHEN DISPLAY SYSTEM (KDS)

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/kitchen/stations` | Get all stations | JWT | CHEF, MANAGER |
| GET | `/kitchen/stations/:stationId/orders` | Get orders for station | JWT | CHEF, MANAGER |
| GET | `/kitchen/orders?status=FIRED` | Get all pending orders | JWT | CHEF, MANAGER |
| PUT | `/courses/:courseId/complete` | Mark course complete | JWT | CHEF, MANAGER |
| GET | `/kitchen/metrics` | KDS metrics (avg prep time) | JWT | MANAGER |

**Example: Get Kitchen Display (Grill Station)**
```bash
GET /api/v1/kitchen/stations/station-grill/orders?status=FIRED
Authorization: Bearer <token>

Response: 200 OK
[
  {
    "orderId": "order-123",
    "courseId": "course-456",
    "courseType": "MAIN",
    "tableNumber": "1",
    "guestCount": 2,
    "items": [
      {
        "menuItem": "Pan-Seared Ribeye",
        "quantity": 2,
        "specialNotes": "Medium rare, no salt",
        "firedAt": "2026-01-23T19:15:00Z",
        "estimatedTime": 15
      }
    ]
  }
]
```

---

### 11. INVENTORY & SUPPLIERS

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/inventory` | List inventory | JWT | MANAGER, CHEF |
| GET | `/inventory/:itemId` | Get item details | JWT | All |
| PUT | `/inventory/:itemId` | Update stock | JWT | MANAGER |
| POST | `/inventory/:itemId/movements` | Log stock movement | JWT | MANAGER |
| GET | `/inventory/low-stock` | Get low-stock items | JWT | MANAGER |
| GET | `/suppliers` | List suppliers | JWT | MANAGER |
| POST | `/suppliers` | Create supplier | JWT | OWNER |

**Example: Get Low Stock Items**
```bash
GET /api/v1/inventory/low-stock
Authorization: Bearer <token>

Response: 200 OK
[
  {
    "id": "inv-456",
    "name": "Fresh Basil",
    "currentStock": 2,
    "minStock": 5,
    "unit": "bunch",
    "reorderLevel": 10
  },
  {
    "id": "inv-789",
    "name": "Diver Scallops",
    "currentStock": 3,
    "minStock": 8,
    "unit": "lb"
  }
]
```

---

### 12. REPORTS & ANALYTICS

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/reports/daily` | Daily sales report | JWT | MANAGER, OWNER |
| GET | `/reports/weekly` | Weekly performance | JWT | MANAGER, OWNER |
| GET | `/reports/monthly` | Monthly summary | JWT | OWNER |
| GET | `/reports/server/:serverId` | Server performance | JWT | MANAGER, OWNER (self if SERVER) |
| GET | `/reports/revenue` | Revenue analytics | JWT | OWNER |
| GET | `/reports/kitchen-metrics` | Kitchen performance | JWT | MANAGER, OWNER |
| GET | `/reports/inventory-cost` | Inventory value | JWT | OWNER |

**Example: Daily Report**
```bash
GET /api/v1/reports/daily?date=2026-01-23
Authorization: Bearer <token>

Response: 200 OK
{
  "date": "2026-01-23",
  "totalSales": 8500.00,
  "totalOrders": 24,
  "averageOrderValue": 354.17,
  "totalGuests": 96,
  "seatsPercentage": 85,
  "staff": {
    "totalServers": 5,
    "totalOnShift": 4
  },
  "topItems": [
    {
      "item": "Pan-Seared Ribeye",
      "quantity": 12,
      "revenue": 648.00
    }
  ],
  "shifts": [...]
}
```

---

### 13. BUSINESS OPERATIONS (Shift Management)

| Method | Endpoint | Purpose | Auth | Roles |
|--------|----------|---------|------|-------|
| GET | `/shifts` | List shifts | JWT | MANAGER, OWNER |
| POST | `/shifts` | Create shift | JWT | MANAGER |
| GET | `/shifts/:shiftId` | Get shift details | JWT | All (self), MANAGER |
| PUT | `/shifts/:shiftId` | Update shift | JWT | MANAGER |
| POST | `/business-day/open` | Open business day | JWT | MANAGER, OWNER |
| POST | `/business-day/close` | Close business day | JWT | MANAGER, OWNER |
| GET | `/business-day/:date` | Get day summary | JWT | MANAGER, OWNER |

**Example: Close Business Day**
```bash
POST /api/v1/business-day/close
Authorization: Bearer <token>
Content-Type: application/json

{
  "date": "2026-01-23",
  "totalSales": 8500.00,
  "cashExpected": 1200.00,
  "cashActual": 1210.00,
  "notes": "Small overage in tips"
}

Response: 201 Created
{
  "id": "close-123",
  "date": "2026-01-23",
  "totalSales": 8500.00,
  "cashExpected": 1200.00,
  "cashActual": 1210.00,
  "discrepancy": 10.00,
  "closedAt": "2026-01-23T23:30:00Z"
}
```

---

## RESPONSE FORMAT

### Success Response (2xx)

```json
{
  "status": "success",
  "code": 200,
  "data": {
    "id": "123",
    "name": "Example"
  },
  "message": "Operation successful",
  "timestamp": "2026-01-23T10:30:00Z"
}
```

### Error Response (4xx/5xx)

```json
{
  "status": "error",
  "code": 400,
  "error": "INVALID_INPUT",
  "message": "Table capacity must be at least 1",
  "details": {
    "field": "capacity",
    "constraint": "MIN_VALUE",
    "value": 0
  },
  "timestamp": "2026-01-23T10:30:00Z"
}
```

### Paginated Response

```json
{
  "status": "success",
  "code": 200,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## ERROR HANDLING

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | Successful GET, PUT |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Table already occupied |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unexpected error |

### Common Error Codes

```
INVALID_CREDENTIALS     - Login failed
INVALID_TOKEN           - JWT invalid/expired
INSUFFICIENT_PERMISSIONS - User role not authorized
RESOURCE_NOT_FOUND      - Item doesn't exist
DUPLICATE_ENTRY         - Unique constraint violation
INVALID_INPUT           - Validation failed
BUSINESS_LOGIC_ERROR    - Can't close occupied table
RATE_LIMIT_EXCEEDED     - Too many requests
INTERNAL_SERVER_ERROR   - Unexpected error
```

---

## RATE LIMITING

```
Default: 1000 requests per hour per IP/user

Limits by endpoint:
├─ Auth:          100 requests/hour
├─ Orders:        500 requests/hour
├─ Reports:       50 requests/hour
└─ Other:         1000 requests/hour

Response Headers:
├─ X-RateLimit-Limit: 1000
├─ X-RateLimit-Remaining: 999
└─ X-RateLimit-Reset: 1645612800
```

---

## ENDPOINT REFERENCE (QUICK)

### Authentication
```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
```

### Users
```
GET    /users
POST   /users
GET    /users/:userId
PUT    /users/:userId
DELETE /users/:userId
```

### Tables
```
GET    /locations/:locationId/tables
GET    /tables/:tableId
PUT    /tables/:tableId
```

### Orders (Core)
```
GET    /orders
POST   /orders
GET    /orders/:orderId
PUT    /orders/:orderId
POST   /orders/:orderId/close
```

### Kitchen
```
GET    /kitchen/stations/:stationId/orders
PUT    /courses/:courseId/complete
```

### Reservations
```
GET    /reservations
POST   /reservations
PUT    /reservations/:reservationId
```

### Menu
```
GET    /menus
GET    /menus/:menuId/sections
```

### Reports
```
GET    /reports/daily
GET    /reports/weekly
GET    /reports/monthly
```

---

**Next Step**: Implement API layer using this specification!

See `DATABASE_SETUP_GUIDE.md` for database setup instructions.
