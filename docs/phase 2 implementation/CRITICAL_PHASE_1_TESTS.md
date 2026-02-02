# Phase 2 Complete Testing & Validation Guide

**Purpose**: Comprehensive testing strategy for Phase 2 fixes  
**Duration**: 2-3 days of testing  
**Success Criteria**: 100% test pass rate before Phase 3 start

---

## 🧪 TESTING OVERVIEW

### Test Pyramid

```
                    E2E Tests (10%)
                   /             \
               Integration Tests (30%)
              /                      \
         Unit Tests (60%)
```

### Test Types

- **Unit Tests**: Individual functions in isolation (Jest)
- **Integration Tests**: Service interactions with database (Jest + Docker)
- **E2E Tests**: Full API workflows (Postman/curl)
- **Performance Tests**: Query optimization verification (Query logs)
- **Security Tests**: Role-based access, data leakage

---

## CRITICAL PHASE 1 - TESTING

### FIX 1: Email Service Testing

#### 1.1 Unit Test: Email Service
```bash
# File: backend/src/services/__tests__/EmailService.test.ts

npm test -- EmailService

# Expected results:
✓ Should initialize transporter successfully
✓ Should verify connection on construction
✓ Should send password reset email
✓ Should send welcome email
✓ Should handle email sending errors
✓ Should log email operations
```

#### 1.2 Integration Test: Password Reset Flow
```bash
# Test the complete password reset workflow:

# Step 1: Request password reset
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Expected:
# - Returns 200 OK
# - Email is sent (check logs)
# - Reset token is created in database

# Step 2: Verify reset token via email
# Extract token from email or from test logs

# Step 3: Verify reset token endpoint
curl -X GET http://localhost:3000/api/v1/auth/reset-password/:token \
  -H "Authorization: Bearer <token>"

# Expected:
# - Returns 200 OK
# - Confirms token is valid

# Step 4: Reset password with token
curl -X POST http://localhost:3000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token":"<reset-token>",
    "newPassword":"NewPassword123!"
  }'

# Expected:
# - Returns 200 OK
# - Password is reset
# - Confirmation email is sent
# - Token is invalidated

# Step 5: Login with new password
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "password":"NewPassword123!"
  }'

# Expected:
# - Returns 200 OK with JWT token
```

#### 1.3 Error Scenarios
```bash
# Test invalid email
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@example.com"}'
# Expected: 404 User not found

# Test expired reset token
curl -X POST http://localhost:3000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token":"expired-token",
    "newPassword":"NewPassword123!"
  }'
# Expected: 401 Token expired

# Test invalid token format
curl -X GET http://localhost:3000/api/v1/auth/reset-password/invalid-token
# Expected: 400 Invalid token
```

---

### FIX 2: Payment Transaction Integrity Testing

#### 2.1 Unit Tests: Payment Service
```bash
npm test -- PaymentService

# Expected:
✓ Should calculate bill correctly with tax
✓ Should use tenant financial settings for tax rate
✓ Should validate payment amount
✓ Should detect overpayments
✓ Should reject payment exceeding bill total
✓ Should create payment in transaction
✓ Should update order status to PAID when fully paid
✓ Should verify payment integrity
```

#### 2.2 Integration Test: Payment Recording
```bash
# Create order with items
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "tableId":"table-123",
    "guestCount":2
  }'

# Response: { "orderId": "order-123", "subtotal": 0 }

# Add course to order
curl -X POST http://localhost:3000/api/v1/orders/order-123/courses \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"courseType":"MAIN"}'

# Response: { "courseId": "course-123" }

# Add items to course
curl -X POST http://localhost:3000/api/v1/courses/course-123/items \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "menuItemId":"item-123",
    "quantity":2
  }'

# Get bill to see total
curl -X GET http://localhost:3000/api/v1/orders/order-123/bill \
  -H "Authorization: Bearer <token>"

# Response:
# {
#   "subtotal": 50.00,
#   "tax": 4.13,
#   "total": 54.13,
#   "amountPaid": 0
# }

# Record payment
curl -X POST http://localhost:3000/api/v1/orders/order-123/payments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"CARD",
    "amount":54.13,
    "lastFour":"4242"
  }'

# Expected:
# - Returns 200 OK
# - Payment recorded
# - Order status changes to PAID
# - Database transaction is atomic

# Verify payment recorded
curl -X GET http://localhost:3000/api/v1/orders/order-123/bill \
  -H "Authorization: Bearer <token>"

# Expected:
# {
#   "amountPaid": 54.13,
#   "remainingBalance": 0
# }
```

#### 2.3 Error Scenarios
```bash
# Test overpayment
curl -X POST http://localhost:3000/api/v1/orders/order-123/payments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"CARD",
    "amount":100.00,
    "lastFour":"4242"
  }'
# Expected: 400 Payment amount exceeds bill total

# Test payment on closed order
# First close the order
curl -X POST http://localhost:3000/api/v1/orders/order-123/close \
  -H "Authorization: Bearer <token>"

# Then try to pay
curl -X POST http://localhost:3000/api/v1/orders/order-123/payments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"method":"CASH","amount":54.13}'

# Expected: 400 Order is already closed or paid
```

---

### FIX 3: Order State Validation Testing

#### 3.1 State Machine Transitions
```
Order States:
OPEN → IN_PROGRESS → READY → COMPLETED → PAID → CLOSED

Valid Transitions:
- OPEN → IN_PROGRESS (fire first course)
- IN_PROGRESS → READY (all items ready)
- READY → COMPLETED (serve all items)
- COMPLETED → PAID (payment received)
- PAID → CLOSED (close order)

Invalid Transitions:
- OPEN → CLOSED (skip steps)
- READY → PAID (must be COMPLETED first)
- etc.
```

#### 3.2 Test Order State Transitions
```bash
# Create order (status: OPEN)
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"tableId":"table-123","guestCount":2}'

# Verify status is OPEN
curl -X GET http://localhost:3000/api/v1/orders/order-123 \
  -H "Authorization: Bearer <token>"
# Status: OPEN ✓

# Add course and fire it (transition to IN_PROGRESS)
curl -X POST http://localhost:3000/api/v1/orders/order-123/courses \
  -H "Authorization: Bearer <token>" \
  -d '{"courseType":"MAIN"}'

# Add items
curl -X POST http://localhost:3000/api/v1/courses/course-123/items \
  -H "Authorization: Bearer <token>" \
  -d '{"menuItemId":"item-123","quantity":1}'

# Fire course (send to kitchen)
curl -X PUT http://localhost:3000/api/v1/courses/course-123/fire \
  -H "Authorization: Bearer <token>" \
  -d '{"kitchenStationId":"station-123"}'

# Verify status changed to IN_PROGRESS
curl -X GET http://localhost:3000/api/v1/orders/order-123 \
  -H "Authorization: Bearer <token>"
# Status: IN_PROGRESS ✓

# Complete course
curl -X PUT http://localhost:3000/api/v1/courses/course-123/complete \
  -H "Authorization: Bearer <token>"

# Verify status changed to READY
# Status: READY ✓

# Try to close order without payment (should fail)
curl -X POST http://localhost:3000/api/v1/orders/order-123/close \
  -H "Authorization: Bearer <token>"
# Expected: 400 Order must be PAID before closing

# Add payment
curl -X POST http://localhost:3000/api/v1/orders/order-123/payments \
  -H "Authorization: Bearer <token>" \
  -d '{"method":"CASH","amount":54.13}'

# Verify status changed to PAID
# Status: PAID ✓

# Now close order
curl -X POST http://localhost:3000/api/v1/orders/order-123/close \
  -H "Authorization: Bearer <token>"

# Verify status is CLOSED
# Status: CLOSED ✓
```

#### 3.3 Invalid Transitions (Should Fail)
```bash
# Try to skip IN_PROGRESS and go directly to READY (should fail)
# Try to mark as PAID without payment (should fail)
# Try to close without all courses complete (should fail)
```

---

### FIX 4: Kitchen State Machine Testing

#### 4.1 Kitchen State Transitions
```
Course States:
PENDING → FIRED → PREPARING → READY → SERVED

Timing:
- PENDING: Initial state
- FIRED: Kitchen receives order
- PREPARING: Chef starts cooking
- READY: Food ready for service
- SERVED: Delivered to table
```

#### 4.2 Test Kitchen Operations
```bash
# Create order with items (status: PENDING)
# ... (same as before)

# Fire course (PENDING → FIRED)
curl -X PUT http://localhost:3000/api/v1/courses/course-123/fire \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"kitchenStationId":"station-123"}'

# Expected:
# - Status: FIRED
# - firedAt: current timestamp
# - kitchenStationId: station-123

# Verify metrics calculation
curl -X GET http://localhost:3000/api/v1/kitchen/metrics \
  -H "Authorization: Bearer <token>"

# Expected:
# {
#   "totalFiredInLastHour": 1,
#   "averagePrepTime": 0,
#   "allPendingCourses": 0
# }

# Mark course as ready (FIRED → READY)
curl -X PUT http://localhost:3000/api/v1/courses/course-123/complete \
  -H "Authorization: Bearer <token>"

# Expected:
# - Status: READY
# - completedAt: current timestamp

# Verify metrics updated
curl -X GET http://localhost:3000/api/v1/kitchen/metrics \
  -H "Authorization: Bearer <token>"

# Expected:
# - averagePrepTime: ~60 seconds (or whatever elapsed time)
```

#### 4.3 Kitchen Display System Integration
```bash
# Get pending orders for kitchen station
curl -X GET http://localhost:3000/api/v1/kitchen/stations/station-123/orders \
  -H "Authorization: Bearer <token>"

# Expected: All fired courses for this station

# Get all pending orders
curl -X GET http://localhost:3000/api/v1/kitchen/pending \
  -H "Authorization: Bearer <token>"

# Expected: All courses not yet served
```

---

### FIX 5: Table Locking Testing

#### 5.1 Table Locking Mechanism
```bash
# User 1: Seat at table (locks table)
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <token-user1>" \
  -H "Content-Type: application/json" \
  -d '{"tableId":"table-123","guestCount":2}'

# User 2: Try to seat at same table (should be locked)
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <token-user2>" \
  -H "Content-Type: application/json" \
  -d '{"tableId":"table-123","guestCount":2}'

# Expected: 409 Conflict - Table is currently occupied

# User 1: Close order and release table
curl -X POST http://localhost:3000/api/v1/orders/order-123/close \
  -H "Authorization: Bearer <token-user1>"

# User 2: Now can seat at table
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <token-user2>" \
  -H "Content-Type: application/json" \
  -d '{"tableId":"table-123","guestCount":2}'

# Expected: 200 OK - Table is now available
```

#### 5.2 Concurrent Access Test
```bash
# Simulate concurrent requests from multiple users
ab -n 10 -c 10 -p data.json \
  -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/v1/orders

# Only one request should succeed, others should get table locked error
```

---

### FIX 6: Role-Based Data Filtering Testing

#### 6.1 Authorization Tests
```bash
# Test different roles can only see their data

# Owner: Can see all orders
curl -X GET http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <owner-token>"
# Expected: All orders returned

# Server: Can only see their own orders
curl -X GET http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <server-token>"
# Expected: Only orders where serverId = current user's id

# Manager: Can see location orders
curl -X GET http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer <manager-token>"
# Expected: Only orders from their managed location

# Chef: Can see assigned courses
curl -X GET http://localhost:3000/api/v1/kitchen/pending \
  -H "Authorization: Bearer <chef-token>"
# Expected: Only courses for their assigned station
```

#### 6.2 Data Leakage Tests
```bash
# Server tries to access another server's orders
curl -X GET http://localhost:3000/api/v1/orders/other-server-order \
  -H "Authorization: Bearer <server-token>"

# Expected: 403 Forbidden - Access denied

# Non-owner tries to view financial reports
curl -X GET http://localhost:3000/api/v1/reports/revenue \
  -H "Authorization: Bearer <manager-token>"

# Expected: 403 Forbidden - Only owners can view revenue
```

---

## CRITICAL PHASE 2 - TESTING

### FIX 7: Payment Reconciliation Testing

```bash
# Verify payment reconciliation endpoint
curl -X GET http://localhost:3000/api/v1/orders/order-123/verify-payment \
  -H "Authorization: Bearer <token>"

# Expected:
# {
#   "isValid": true,
#   "billTotal": 54.13,
#   "amountPaid": 54.13,
#   "difference": 0,
#   "issues": []
# }

# Test with overpayment
# Expected: isValid false, issue: "Overpayment detected"

# Test with underpayment
# Expected: isValid false, issue: "Order not fully paid"
```

---

### FIX 8: End-of-Day Closure Testing

```bash
# Close business day
curl -X POST http://localhost:3000/api/v1/business-day/close \
  -H "Authorization: Bearer <manager-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "cashExpected": 5000.00,
    "cashActual": 4980.00,
    "notes": "Difference due to gift card redemption"
  }'

# Expected:
# - All orders marked as final
# - Discrepancy calculated and recorded
# - Tip distribution generated
# - Report generated

curl -X GET http://localhost:3000/api/v1/business-day/latest \
  -H "Authorization: Bearer <manager-token>"

# Expected:
# {
#   "totalSales": 5432.10,
#   "cashExpected": 5000.00,
#   "cashActual": 4980.00,
#   "discrepancy": -20.00,
#   "status": "CLOSED"
# }
```

---

## PERFORMANCE TESTING

### Query Performance Baselines

```bash
# Measure query execution time
# Add query logging to database

# Test 1: Get bill (should use specific columns, not N+1)
curl -X GET http://localhost:3000/api/v1/orders/order-123/bill \
  -H "Authorization: Bearer <token>"

# Expected: < 100ms

# Test 2: Get order with all relations
curl -X GET http://localhost:3000/api/v1/orders/order-123 \
  -H "Authorization: Bearer <token>"

# Expected: < 150ms

# Test 3: List orders (pagination)
curl -X GET "http://localhost:3000/api/v1/orders?page=1&limit=20" \
  -H "Authorization: Bearer <token>"

# Expected: < 200ms
```

---

## AUTOMATED TEST SUITE

### Setup Jest Tests

```bash
# Create test file
touch backend/src/__tests__/critical-phase-1.test.ts

# Run tests
npm test -- critical-phase-1

# With coverage
npm test -- critical-phase-1 --coverage
```

### Sample Test File Structure

```typescript
describe('CRITICAL PHASE 1 TESTS', () => {
  describe('Fix 1: Email Service', () => {
    test('should send password reset email', async () => {
      // Test implementation
    });
  });

  describe('Fix 2: Payment Transactions', () => {
    test('should reject overpayments', async () => {
      // Test implementation
    });
  });

  // ... more tests
});
```

---

## TESTING CHECKLIST

### Critical Phase 1

- [ ] Email Service tests passing (6/6)
- [ ] Password reset flow working end-to-end
- [ ] Payment transaction integrity verified
- [ ] Order state transitions validated
- [ ] Kitchen state machine working
- [ ] Table locking prevents double-seating
- [ ] Role-based filtering verified
- [ ] No security vulnerabilities detected
- [ ] Performance baselines established

### Critical Phase 2

- [ ] Payment reconciliation working
- [ ] End-of-day closure complete
- [ ] Database indexes added and verified
- [ ] Reports generating correctly
- [ ] All queries using correct indexes
- [ ] No N+1 query issues

### Sign-off

- [ ] Product Owner approval
- [ ] QA sign-off
- [ ] Security review passed
- [ ] Performance acceptable
- [ ] Ready for Phase 3

---

## QUICK TEST COMMANDS

```bash
# Run all Phase 1 tests
npm run test:critical:phase1

# Run all Phase 2 tests
npm run test:critical:phase2

# Run E2E tests
npm run test:e2e

# Check for N+1 queries
npm run test:performance

# Run security tests
npm run test:security

# Full test suite
npm test -- --coverage
```

---

## TROUBLESHOOTING

### Email Service Not Working
```bash
# Check email configuration
env | grep EMAIL

# Check logs
npm run logs -- EmailService

# Verify SMTP connection
npm run test:email-connection
```

### Payment Transaction Failed
```bash
# Check database logs
npm run db:logs

# Review transaction history
npm run db:query "SELECT * FROM _prisma_migrations"
```

### Performance Issues
```bash
# Enable query logging
export DEBUG=prisma:*

# Run performance tests
npm run test:performance --verbose
```

---

Generated: February 2, 2026
