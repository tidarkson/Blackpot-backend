# Split Check Functionality - Implementation Analysis

**Analysis Date:** February 4, 2026  
**Status:** ❌ NOT IMPLEMENTED (0% - No split check backend components found)

---

## Executive Summary

Your Split Check functionality **has NOT been implemented yet**. The backend currently lacks:
- Database models for split payments
- Service layer for split logic
- API endpoints for split operations
- Validators for split data
- Payment tracking for split bills

However, the foundational payment infrastructure (Payment, Tip, Order models) exists and can be extended to support split checks.

---

## SPECIFICATION REQUIREMENTS vs IMPLEMENTATION

### Backend Specification: Split Check API

#### Required Endpoint
```
POST /api/orders/:id/split
```

**Request Body:**
```json
{
  "split_type": "equal" | "item" | "custom",
  "splits": [
    {
      "person_id": 1,
      "amount": 45.50,      // for custom split
      "items": [...],       // for item split
      "person_count": 2     // for equal split
    }
  ]
}
```

**Response:**
```json
{
  "orderId": "order-123",
  "splits": [
    {
      "bill_number": 1,
      "person": 1,
      "items": [...],
      "subtotal": 45.50,
      "tax": 3.75,
      "total": 49.25,
      "status": "pending"
    }
  ]
}
```

---

## FEATURE REQUIREMENTS vs IMPLEMENTATION

| Feature | Required | Implemented | Status |
|---------|----------|-------------|--------|
| **Equal Split Calculation** | ✅ | ❌ | NOT STARTED |
| **Item-Based Split** | ✅ | ❌ | NOT STARTED |
| **Custom Amount Split** | ✅ | ❌ | NOT STARTED |
| **Payment Status Tracking** | ✅ | ❌ | NOT STARTED |
| **Partial Payment Handling** | ✅ | ❌ | NOT STARTED |
| **Split Validation** | ✅ | ❌ | NOT STARTED |
| **Bill Generation** | ✅ | ❌ | NOT STARTED |
| **Print Preview Support** | ✅ | ❌ | NOT STARTED |
| **Undo Split Capability** | ✅ | ❌ | NOT STARTED |

---

## ACCEPTANCE CRITERIA STATUS

| Criterion | Status | Implementation |
|-----------|--------|-----------------|
| **Equal split calculation correct** | ❌ | No split service |
| **Item split assignment working** | ❌ | No split models |
| **Custom split validates properly** | ❌ | No validators |
| **Bills generated correctly** | ❌ | No bill split generation |
| **Payment tracking functional** | ❌ | No split payment records |
| **Print preview working** | ❌ | No split bill endpoint |
| **API integration complete** | ❌ | No split endpoint |
| **All split types tested** | ❌ | No tests |

**Overall Status: 0/8 (0%)**

---

## WHAT WOULD BE NEEDED

### 1. Database Schema Models

#### Model 1: `SplitPayment` (for tracking individual split bills)
```prisma
model SplitPayment {
  id              String @id @default(uuid())
  tenantId        String
  orderId         String
  billNumber      Int               // 1, 2, 3, etc.
  personNumber    Int               // Person 1, Person 2, etc.
  subtotal        Decimal @db.Decimal(10, 2)
  tax             Decimal @db.Decimal(10, 2)
  total           Decimal @db.Decimal(10, 2)
  paid            Decimal @db.Decimal(10, 2) @default(0)
  remaining       Decimal @db.Decimal(10, 2)
  status          PaymentStatus @default(PENDING)  // PENDING, PAID, PARTIAL, FAILED
  splitType       String            // "equal", "item", "custom"
  paymentRef      String?           // Link to Payment record
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  tenant    Tenant          @relation(fields: [tenantId], references: [id])
  order     Order           @relation(fields: [orderId], references: [id])
  items     SplitPaymentItem[]
  payment   Payment?        @relation(fields: [paymentRef], references: [id])
  
  @@index([orderId])
  @@index([tenantId])
  @@index([status])
  @@unique([orderId, billNumber])
}

model SplitPaymentItem {
  id              String @id @default(uuid())
  splitPaymentId  String
  orderItemId     String
  quantity        Int
  price           Decimal @db.Decimal(10, 2)
  
  splitPayment  SplitPayment  @relation(fields: [splitPaymentId], references: [id])
  orderItem     OrderItem     @relation(fields: [orderItemId], references: [id])
  
  @@index([splitPaymentId])
}
```

#### Model 2: Extend `Payment` model
```prisma
model Payment {
  // ... existing fields
  
  // Add these:
  splitPaymentId    String?
  isSplitPayment    Boolean @default(false)
  billNumber        Int?    // For split payments
  
  splitPayment      SplitPayment?  @relation(fields: [splitPaymentId], references: [id])
}
```

### 2. Service Layer: `SplitCheckService`

```typescript
export class SplitCheckService {
  // Equal split: Total ÷ Number of people
  async calculateEqualSplit(
    orderId: string,
    numPeople: number,
    tenantId: string
  ): Promise<SplitBill[]>
  
  // Item split: Assign items to people, calculate per-person total
  async calculateItemSplit(
    orderId: string,
    itemAssignments: { personNumber: number, itemIds: string[] }[],
    tenantId: string
  ): Promise<SplitBill[]>
  
  // Custom split: Validate amounts sum to total
  async calculateCustomSplit(
    orderId: string,
    amounts: { personNumber: number, amount: Decimal }[],
    tenantId: string
  ): Promise<SplitBill[]>
  
  // Create split records in database
  async createSplits(orderId: string, splits: SplitBill[], tenantId: string)
  
  // Track payment on individual split
  async recordSplitPayment(splitId: string, amount: Decimal, method: PaymentMethod)
  
  // Check if all splits are paid
  async checkAllSplitsPaid(orderId: string, tenantId: string): Boolean
  
  // Undo split before payment
  async undoSplit(orderId: string, tenantId: string)
}
```

### 3. Controller: `SplitCheckController`

```typescript
export class SplitCheckController {
  // POST /api/orders/:orderId/split
  async createSplit(req: Request, res: Response)
  
  // GET /api/orders/:orderId/splits
  async getSplits(req: Request, res: Response)
  
  // GET /api/orders/:orderId/splits/:splitId
  async getSplitBill(req: Request, res: Response)
  
  // POST /api/splits/:splitId/pay
  async paymentSplit(req: Request, res: Response)
  
  // DELETE /api/orders/:orderId/splits
  async undoSplit(req: Request, res: Response)
  
  // GET /api/orders/:orderId/splits/print/:splitId
  async getSplitBillForPrint(req: Request, res: Response)
}
```

### 4. Validators: `split-check.validator.ts`

```typescript
// Zod schemas needed:
- equalSplitSchema: { numPeople: 2-10 }
- itemSplitSchema: { items: [{ personNumber, itemIds }] }
- customSplitSchema: { amounts: [{ personNumber, amount }], validate sum = total }
- splitPaymentSchema: { splitId, amount, method }
```

### 5. Routes: `split.ts`

```typescript
POST   /api/orders/:orderId/split          // Create split
GET    /api/orders/:orderId/splits         // List all splits for order
GET    /api/orders/:orderId/splits/:id     // Get single split bill
POST   /api/splits/:id/pay                 // Pay individual split
DELETE /api/orders/:orderId/splits         // Undo split
GET    /api/orders/:orderId/splits/:id/print // Print split bill
```

---

## CURRENT FOUNDATION

### ✅ What DOES Exist (Can be built upon)

1. **Payment Infrastructure**
   - `Payment` model with status tracking (COMPLETED, PENDING, FAILED)
   - `PaymentService.addPayment()` with validation
   - `PaymentService.getBill()` calculates subtotal, tax, total
   - Payment method support (CASH, CARD, CHECK)

2. **Order Infrastructure**
   - `Order` model with full relationships
   - Order item tracking via `OrderCourse` → `OrderItem`
   - Tax calculation (8.25% default)
   - Order status transitions

3. **Financial Calculations**
   - Decimal precision using `@prisma/client/runtime/library`
   - Tax rate from `FinancialSetting.taxRate`
   - Proper accounting patterns

### ❌ What DOESN'T Exist

1. Split payment models
2. Split calculation logic
3. Split API endpoints
4. Split validators
5. Split tests
6. Bill generation for splits
7. Print preview for splits

---

## IMPLEMENTATION ROADMAP

### Phase 1: Database (1-2 hours)
- [ ] Create `SplitPayment` model
- [ ] Create `SplitPaymentItem` model
- [ ] Add `splitPaymentId` to `Payment` model
- [ ] Create migration

### Phase 2: Service Layer (2-3 hours)
- [ ] Implement `SplitCheckService`
  - [ ] `calculateEqualSplit()`
  - [ ] `calculateItemSplit()`
  - [ ] `calculateCustomSplit()`
  - [ ] `createSplits()`
  - [ ] `recordSplitPayment()`
  - [ ] `checkAllSplitsPaid()`
  - [ ] `undoSplit()`

### Phase 3: Validation (1 hour)
- [ ] Create `split-check.validator.ts` with Zod schemas
- [ ] Validate split amounts sum to total
- [ ] Validate person numbers
- [ ] Validate item assignments

### Phase 4: API Layer (2-3 hours)
- [ ] Create `SplitCheckController`
- [ ] Create `split.ts` routes (6 endpoints)
- [ ] Implement all split endpoints
- [ ] Add error handling

### Phase 5: Testing (2-3 hours)
- [ ] Unit tests for split calculations
- [ ] Integration tests for endpoints
- [ ] Edge case tests (overpayment, underpayment)
- [ ] Multi-tenant isolation tests

### Phase 6: Integration (1 hour)
- [ ] Register routes in `index.ts`
- [ ] Update order workflow to support splits
- [ ] Update reconciliation to handle split payments

**Total Estimated Time: 9-13 hours**

---

## KEY ARCHITECTURAL DECISIONS NEEDED

### 1. Split Payment Model Relationship
**Question:** Should `Payment` have 1→1 to `SplitPayment` or should `SplitPayment` be the primary entity?

**Recommendation:** 
- `SplitPayment` is primary (represents individual bill)
- `Payment` links to `SplitPayment` (records actual payment against split)
- Allows multiple payments per split (partial payments)

### 2. Status Management
**Question:** How to track split status vs payment status?

**Recommendation:**
- `SplitPayment.status` = PENDING/PARTIAL/PAID (overall split status)
- `Payment.status` = COMPLETED/PENDING/FAILED (individual payment status)
- When all payments for split complete → mark split as PAID

### 3. Tax Distribution
**Question:** How to split tax among people?

**Recommendation:**
- Tax splits proportionally: (Person Subtotal / Order Subtotal) × Total Tax
- Use Decimal for precision: `subtotal.mul(totalTax).div(orderSubtotal)`
- Store calculated tax in SplitPayment for accuracy

### 4. Item Sharing
**Question:** How to handle items shared among multiple people?

**Recommendation:**
- Create `SplitPaymentItem` with shared flag
- Split shared item cost equally among selected people
- Calculate: `itemPrice / numberOfPeopleSplitting`

---

## DESIGN NOTES

### Security Considerations
- ✅ Verify orderId belongs to user's tenant (multi-tenant isolation)
- ✅ Verify user has permission to create splits (role-based)
- ✅ Prevent double-payment of splits (idempotency)
- ✅ Audit split creation/payment (logging)

### Financial Accuracy
- ✅ Use Decimal for all calculations (no floating point errors)
- ✅ Validate splits sum exactly to order total (rounding handling)
- ✅ Store original amounts in DB (not calculated)
- ✅ Handle overpayment scenarios

### Error Handling
- ❌ Cannot split already-paid order
- ❌ Cannot split order with active payment
- ❌ Cannot modify split after first payment
- ✅ Custom split amounts must sum to total

---

## COMPARISON WITH EXISTING PATTERNS

Your codebase follows consistent patterns that should guide split check implementation:

### Pattern 1: Service + Controller + Routes
**Existing:** OrderService → OrderController → order.ts  
**Split Check:** SplitCheckService → SplitCheckController → split.ts

### Pattern 2: Validation with Zod
**Existing:** table.validator.ts with schemas  
**Split Check:** split-check.validator.ts with split schemas

### Pattern 3: Decimal for Money
**Existing:** `Decimal` from `@prisma/client/runtime/library`  
**Split Check:** Use same for all split calculations

### Pattern 4: Transaction Safety
**Existing:** `prisma.$transaction()` in PaymentService  
**Split Check:** Use transactions when creating multiple split payments

### Pattern 5: Logging
**Existing:** `logger.info()` and `logger.error()`  
**Split Check:** Log split creation, payments, undos

---

## EXAMPLE IMPLEMENTATION FLOW

### Equal Split Example
```
Order Total: $100.00 (including tax)
Subtotal: $92.31
Tax (8.25%): $7.61
Number of People: 2

Per Person:
- Subtotal: $46.15
- Tax: $3.80
- Total: $49.95  ← Note: rounding to $49.95 for person 1, $50.05 for person 2
```

### Item Split Example
```
Order Items:
- Pizza ($20) → Person 1
- Salad ($15) → Person 2
- Dessert ($30) → Person 1 & 2 (shared)

Subtotal: $65
Tax: $5.36

Person 1:
- Pizza: $20
- Dessert (50%): $15
- Subtotal: $35
- Tax (proportional): $2.88
- Total: $37.88

Person 2:
- Salad: $15
- Dessert (50%): $15
- Subtotal: $30
- Tax (proportional): $2.47
- Total: $32.47
```

### Custom Split Example
```
Validation Example:
Amount 1: $35.00
Amount 2: $40.00
Amount 3: $25.00
Total: $100.00 ✅ VALID

If Amount 3 was $24.99:
Total: $99.99 ⚠️ WARNING: Under by $0.01
Can manually adjust or show error
```

---

## NEXT STEPS

1. **Define Acceptance Criteria** for split check (done - see above)
2. **Design Database Schema** (see schema.prisma models above)
3. **Create Migration** with new models
4. **Implement SplitCheckService** with all calculation methods
5. **Add SplitCheckController** and routes
6. **Create Validators** with Zod schemas
7. **Implement Tests** for all split types
8. **Integration Testing** with Postman

---

## CURRENT BLOCKER

❌ **Split check functionality is not started**

The following must be completed before any split operations can work:
1. Database models (SplitPayment, SplitPaymentItem)
2. Prisma migration
3. Service layer logic
4. API endpoints

**Estimated effort to complete: 9-13 hours** (all items above)

---

## CONCLUSION

Split Check functionality is **not yet implemented**. The codebase has solid foundations in payment processing, order management, and validation that can be leveraged. A complete implementation would follow existing patterns and take approximately 2 weeks part-time or 2-3 days full-time.

**Readiness: 0%** - Requirements not yet built, but architecture clear and foundation exists.

---

**Status: READY FOR SPECIFICATION REVIEW & DESIGN APPROVAL** ⏳
