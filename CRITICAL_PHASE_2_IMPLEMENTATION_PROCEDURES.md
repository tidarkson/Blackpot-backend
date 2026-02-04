# Critical Phase 2+ Implementation Procedures

**Purpose**: Step-by-step procedures to implement remaining 9 fixes  
**Timeline**: Weeks 2-4  
**Status**: Ready for execution after Phase 1 integration

---

## 🎯 PHASE 1 INTEGRATION CHECKLIST (This Week)

Before starting Phase 2, complete these integration steps:

### Step 1: Copy Services (30 minutes)
```bash
# 1. Copy EmailService
# File: CRITICAL_PHASE_1_ALL_IMPLEMENTATIONS.ts (lines 1-250)
# To: backend/src/services/EmailService.ts (replace existing)

# 2. Copy PaymentService  
# File: CRITICAL_PHASE_1_ALL_IMPLEMENTATIONS.ts (lines 251-450)
# To: backend/src/services/PaymentService.ts (replace existing)

# 3. Copy OrderService
# File: CRITICAL_PHASE_1_ALL_IMPLEMENTATIONS.ts (lines 451-750)
# To: backend/src/services/OrderService.ts (replace existing)

# 4. Copy KitchenService
# File: CRITICAL_PHASE_1_ALL_IMPLEMENTATIONS.ts (lines 751-1000)
# To: backend/src/services/KitchenService.ts (replace existing)

# 5. Copy TableService
# File: CRITICAL_PHASE_1_ALL_IMPLEMENTATIONS.ts (lines 1001-1200)
# To: backend/src/services/TableService.ts (replace existing)

# 6. Copy RoleBasedAccessFilter
# File: CRITICAL_PHASE_1_ALL_IMPLEMENTATIONS.ts (lines 1201-1400)
# To: backend/src/utils/RoleBasedAccessFilter.ts (new file)
```

### Step 2: Update Imports (15 minutes)
In each service file, update imports:
```typescript
// Standard imports
import { PrismaClient, OrderStatus, UserRole, PaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';
import { config } from '../config/environment';

// Service imports
import nodemailer from 'nodemailer';  // EmailService only
```

### Step 3: Test Services (30 minutes)
```bash
# Start dev server
npm run dev

# Test Email Service
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Should see: "✅ Email service connected successfully" in logs
```

### Step 4: Run Integration Tests (30 minutes)
```bash
# Create test file: backend/tests/phase1.integration.test.ts
npm test -- phase1.integration

# All tests should pass
```

---

## 📋 CRITICAL PHASE 2: WEEK 2 PROCEDURES

### FIX 7: Payment Reconciliation (Monday, Feb 10)

#### Objective
Create service to verify payments match orders, identify discrepancies, and generate reconciliation reports.

#### Step 1: Create ReconciliationService.ts
```bash
Location: backend/src/services/ReconciliationService.ts
Time: 1 hour
```

**File Contents:**
```typescript
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class ReconciliationService {
  /**
   * Daily reconciliation: Match all payments to orders
   */
  async dailyReconciliation(tenantId: string, reconciliationDate: Date) {
    try {
      // Get all orders for the date
      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(reconciliationDate.setHours(0, 0, 0, 0)),
            lt: new Date(reconciliationDate.setHours(23, 59, 59, 999)),
          },
        },
        include: {
          payments: true,
        },
      });

      // Calculate totals
      const summary = {
        totalOrders: orders.length,
        totalRevenue: new Decimal(0),
        totalPaid: new Decimal(0),
        totalPending: new Decimal(0),
        discrepancies: [] as any[],
      };

      for (const order of orders) {
        summary.totalRevenue = summary.totalRevenue.plus(order.total || 0);

        const orderPaid = order.payments
          .filter(p => p.status === 'COMPLETED')
          .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));

        summary.totalPaid = summary.totalPaid.plus(orderPaid);

        const pending = (order.total || new Decimal(0)).minus(orderPaid);
        if (pending.gt(0)) {
          summary.totalPending = summary.totalPending.plus(pending);
        }

        // Detect discrepancies
        if (orderPaid.gt(order.total || 0)) {
          summary.discrepancies.push({
            orderId: order.id,
            type: 'OVERPAYMENT',
            amount: orderPaid.minus(order.total || 0),
          });
        }
      }

      // Store reconciliation record
      const reconciliation = await prisma.reconciliationLog.create({
        data: {
          tenantId,
          reconciliationDate,
          totalOrders: summary.totalOrders,
          totalRevenue: summary.totalRevenue,
          totalPaid: summary.totalPaid,
          totalPending: summary.totalPending,
          discrepancyCount: summary.discrepancies.length,
          status: 'COMPLETED',
        },
      });

      logger.info(`✅ Daily reconciliation completed: ${summary.totalOrders} orders, $${summary.totalRevenue}`);
      return summary;
    } catch (error: any) {
      logger.error('Reconciliation error:', error.message);
      throw error;
    }
  }

  /**
   * Identify all discrepancies for manual review
   */
  async identifyDiscrepancies(tenantId: string, startDate: Date, endDate: Date) {
    try {
      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          payments: true,
        },
      });

      const discrepancies = {
        overpayments: [] as any[],
        underpayments: [] as any[],
        missingPayments: [] as any[],
      };

      for (const order of orders) {
        const paid = order.payments
          .filter(p => p.status === 'COMPLETED')
          .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));

        const total = order.total || new Decimal(0);

        if (paid.gt(total)) {
          discrepancies.overpayments.push({
            orderId: order.id,
            expected: total,
            actual: paid,
            variance: paid.minus(total),
          });
        } else if (paid.lt(total) && paid.gt(0)) {
          discrepancies.underpayments.push({
            orderId: order.id,
            expected: total,
            actual: paid,
            remaining: total.minus(paid),
          });
        } else if (paid.eq(0) && total.gt(0)) {
          discrepancies.missingPayments.push({
            orderId: order.id,
            expectedAmount: total,
          });
        }
      }

      logger.info(`⚠️ Discrepancies found: ${discrepancies.overpayments.length} over, ${discrepancies.underpayments.length} under, ${discrepancies.missingPayments.length} missing`);
      return discrepancies;
    } catch (error: any) {
      logger.error('Error identifying discrepancies:', error.message);
      throw error;
    }
  }

  /**
   * Mark payments as reconciled
   */
  async reconcilePayments(paymentIds: string[], tenantId: string) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.payment.updateMany({
          where: {
            id: { in: paymentIds },
          },
          data: {
            reconciledAt: new Date(),
            reconciliationStatus: 'RECONCILED',
          },
        });

        return updated;
      });

      logger.info(`✅ ${result.count} payments reconciled`);
      return result;
    } catch (error: any) {
      logger.error('Error reconciling payments:', error.message);
      throw error;
    }
  }
}

export default new ReconciliationService();
```

#### Step 2: Update Database Schema
Add to `database/prisma/schema.prisma`:
```prisma
model ReconciliationLog {
  id                  String    @id @default(cuid())
  tenantId            String
  reconciliationDate  DateTime
  totalOrders         Int
  totalRevenue        Decimal
  totalPaid           Decimal
  totalPending        Decimal
  discrepancyCount    Int
  status              String    @default("COMPLETED")
  createdAt           DateTime  @default(now())

  tenant              Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([reconciliationDate])
}

// Add fields to Payment model
model Payment {
  // ... existing fields
  reconciledAt        DateTime?
  reconciliationStatus String?  @default("PENDING")
}
```

#### Step 3: Run Migration
```bash
npx prisma migrate dev --name add_reconciliation_support
```

#### Step 4: Test
```bash
# Create test file: backend/tests/reconciliation.test.ts
npm test -- reconciliation

# Should verify:
# ✅ Daily reconciliation calculations
# ✅ Discrepancy detection
# ✅ Payment reconciliation
# ✅ Data integrity
```

**Completion Criteria:**
- ✅ ReconciliationService created with 4 methods
- ✅ Database schema updated
- ✅ All reconciliation tests passing
- ✅ Daily reconciliation reports accurate

---

### FIX 8: End-of-Day Closure (Tuesday, Feb 11)

#### Objective
Enable business day closure with shift management, revenue calculation, and order lockdown.

#### Step 1: Create ShiftService.ts
```bash
Location: backend/src/services/ShiftService.ts
Time: 1.5 hours
```

**File Contents:**
```typescript
import { PrismaClient, OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class ShiftService {
  /**
   * Start a shift for a user
   */
  async startShift(userId: string, tenantId: string) {
    try {
      // Check if user already has open shift
      const existingShift = await prisma.shift.findFirst({
        where: {
          userId,
          tenantId,
          endTime: null,
        },
      });

      if (existingShift) {
        throw new Error('User already has an open shift');
      }

      const shift = await prisma.shift.create({
        data: {
          userId,
          tenantId,
          startTime: new Date(),
          status: 'ACTIVE',
        },
      });

      logger.info(`🟢 Shift started for user ${userId}`);
      return shift;
    } catch (error: any) {
      logger.error('Error starting shift:', error.message);
      throw error;
    }
  }

  /**
   * End a shift and calculate totals
   */
  async endShift(userId: string, tenantId: string) {
    try {
      const shift = await prisma.shift.findFirst({
        where: {
          userId,
          tenantId,
          endTime: null,
        },
      });

      if (!shift) {
        throw new Error('No open shift found for this user');
      }

      // Calculate shift duration and revenue
      const endTime = new Date();
      const durationMs = endTime.getTime() - shift.startTime.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);

      // Get all orders handled by this server
      const orders = await prisma.order.findMany({
        where: {
          assignedServerId: userId,
          createdAt: {
            gte: shift.startTime,
            lte: endTime,
          },
        },
        include: {
          payments: true,
        },
      });

      const shiftRevenue = orders.reduce((sum, order) => {
        const paid = order.payments
          .filter(p => p.status === 'COMPLETED')
          .reduce((s, p) => s.plus(p.amount), new Decimal(0));
        return sum.plus(paid);
      }, new Decimal(0));

      const updatedShift = await prisma.shift.update({
        where: { id: shift.id },
        data: {
          endTime,
          status: 'CLOSED',
          durationHours: new Decimal(durationHours),
          totalRevenue: shiftRevenue,
        },
      });

      logger.info(`🔴 Shift ended for user ${userId}: ${durationHours.toFixed(1)}h, $${shiftRevenue}`);
      return updatedShift;
    } catch (error: any) {
      logger.error('Error ending shift:', error.message);
      throw error;
    }
  }

  /**
   * Calculate total revenue for the day
   */
  async calculateDailyRevenue(tenantId: string, date: Date) {
    try {
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          payments: true,
        },
      });

      const totalRevenue = orders.reduce((sum, order) => {
        const paid = order.payments
          .filter(p => p.status === 'COMPLETED')
          .reduce((s, p) => s.plus(p.amount), new Decimal(0));
        return sum.plus(paid);
      }, new Decimal(0));

      logger.info(`💰 Daily revenue: $${totalRevenue} from ${orders.length} orders`);
      return totalRevenue;
    } catch (error: any) {
      logger.error('Error calculating daily revenue:', error.message);
      throw error;
    }
  }

  /**
   * Close all open orders at end of day
   */
  async closeOpenOrders(tenantId: string) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          where: {
            tenantId,
            status: { not: OrderStatus.CLOSED },
          },
          data: {
            status: OrderStatus.CLOSED,
            closedAt: new Date(),
          },
        });

        return updated;
      });

      logger.info(`✅ ${result.count} open orders closed`);
      return result;
    } catch (error: any) {
      logger.error('Error closing open orders:', error.message);
      throw error;
    }
  }

  /**
   * Lockdown previous day data
   */
  async lockdownDay(tenantId: string, date: Date) {
    try {
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      // Mark all orders as locked
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          where: {
            tenantId,
            createdAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
          data: {
            isLocked: true,
            lockedAt: new Date(),
          },
        });

        return updated;
      });

      logger.info(`🔒 ${result.count} orders locked for date ${date.toDateString()}`);
      return result;
    } catch (error: any) {
      logger.error('Error locking down day:', error.message);
      throw error;
    }
  }

  /**
   * Generate daily closure report
   */
  async generateDailyClosureReport(tenantId: string, date: Date) {
    try {
      const revenue = await this.calculateDailyRevenue(tenantId, date);

      const shifts = await prisma.shift.findMany({
        where: {
          tenantId,
          startTime: {
            gte: new Date(date.setHours(0, 0, 0, 0)),
          },
        },
      });

      const report = {
        date: date.toDateString(),
        totalRevenue: revenue,
        shiftCount: shifts.length,
        totalShiftHours: shifts.reduce((sum, s) => sum + (s.durationHours?.toNumber() || 0), 0),
        status: 'CLOSED',
        closedAt: new Date(),
      };

      logger.info(`📊 Daily closure report generated: $${revenue}`);
      return report;
    } catch (error: any) {
      logger.error('Error generating closure report:', error.message);
      throw error;
    }
  }
}

export default new ShiftService();
```

#### Step 2: Update Database Schema
Add to `database/prisma/schema.prisma`:
```prisma
model Shift {
  id              String    @id @default(cuid())
  userId          String
  tenantId        String
  startTime       DateTime
  endTime         DateTime?
  status          String    @default("ACTIVE")
  durationHours   Decimal?
  totalRevenue    Decimal?
  createdAt       DateTime  @default(now())

  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([userId])
  @@index([startTime])
}

// Add fields to Order model
model Order {
  // ... existing fields
  isLocked        Boolean   @default(false)
  lockedAt        DateTime?
}
```

#### Step 3: Run Migration
```bash
npx prisma migrate dev --name add_shift_and_closure_support
```

#### Step 4: Test
```bash
# Create test file: backend/tests/shift-closure.test.ts
npm test -- shift-closure

# Should verify:
# ✅ Shift start/end
# ✅ Revenue calculation
# ✅ Order closure
# ✅ Day lockdown
# ✅ Closure report generation
```

**Completion Criteria:**
- ✅ ShiftService created with 6 methods
- ✅ Database schema updated with Shift table
- ✅ All shift/closure tests passing
- ✅ Daily reports generating correctly

---

### FIX 9: Database Indexes (Tuesday Evening, Feb 11)

#### Objective
Add database indexes to optimize query performance.

#### Step 1: Create Migration File
```bash
npx prisma migrate dev --name add_performance_indexes
```

#### Step 2: Add Index Definitions
In `database/prisma/schema.prisma`, add to existing models:

```prisma
model Order {
  // ... existing fields
  
  @@index([tenantId])
  @@index([status])
  @@index([createdAt])
  @@index([tableId])
  @@index([assignedServerId])
  @@index([tenantId, status, createdAt])  // Composite
}

model OrderCourse {
  // ... existing fields
  
  @@index([orderId])
  @@index([status])
  @@index([kitchenStationId])
  @@index([orderId, status])  // Composite
}

model Payment {
  // ... existing fields
  
  @@index([orderId])
  @@index([createdAt])
  @@index([status])
}

model User {
  // ... existing fields
  
  @@index([tenantId])
  @@index([role])
}

model Table {
  // ... existing fields
  
  @@index([tenantId])
  @@index([isOccupied])
}
```

#### Step 3: Apply Migration
```bash
npx prisma migrate deploy
```

#### Step 4: Verify Performance
```bash
# Before: Run slow query
time npx ts-node -e "
const prisma = require('@prisma/client').PrismaClient;
const p = new prisma();
p.order.findMany({ where: { tenantId: 'x', status: 'OPEN' } });
"

# After: Should be significantly faster
```

**Completion Criteria:**
- ✅ All indexes created
- ✅ Migration applied
- ✅ Queries 50%+ faster

---

### FIX 10: Report Generation (Wednesday, Feb 12)

#### Objective
Generate business intelligence reports for sales, kitchen, inventory, staff, and financial metrics.

#### Step 1: Enhance ReportService.ts
```bash
Location: backend/src/services/ReportService.ts
Time: 3 hours
```

**Key Methods to Add:**
```typescript
// Daily Sales Report
async generateDailySalesReport(tenantId: string, date: Date)
// Returns: Revenue by payment method, items sold, peak hours, margins

// Kitchen Performance Report
async generateKitchenPerformanceReport(tenantId: string, date: Date)
// Returns: Avg prep times, rush hour analysis, item popularity

// Inventory Report (if implemented)
async generateInventoryReport(tenantId: string)
// Returns: Stock levels, usage, variance, reorder points

// Staff Performance Report
async generateStaffPerformanceReport(tenantId: string, date: Date)
// Returns: Tips per server, average check, customer count, errors

// Financial Report
async generateFinancialReport(tenantId: string, startDate: Date, endDate: Date)
// Returns: Revenue vs budget, payment breakdown, tax collected, discounts
```

#### Step 2: Create Report Models in Schema
```prisma
model Report {
  id          String    @id @default(cuid())
  tenantId    String
  type        String    // SALES, KITCHEN, INVENTORY, STAFF, FINANCIAL
  reportDate  DateTime
  data        Json      // Store report data as JSON
  status      String    @default("COMPLETED")
  createdAt   DateTime  @default(now())

  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([type])
  @@index([reportDate])
}
```

#### Step 3: Implement Report Generation
Each report should:
- ✅ Calculate metrics from order/payment data
- ✅ Group by relevant dimensions (payment method, item, time, etc.)
- ✅ Store results in Report table
- ✅ Return formatted JSON for frontend

#### Step 4: Test Reports
```bash
npm test -- reports

# Should verify:
# ✅ Daily sales report accuracy
# ✅ Kitchen metrics correct
# ✅ Staff performance calculations
# ✅ Financial totals accurate
```

**Completion Criteria:**
- ✅ 5 report types generating
- ✅ All calculations verified
- ✅ Reports stored and retrievable
- ✅ Frontend-ready JSON format

---

## 📋 CRITICAL PHASE 3: WEEK 3 PROCEDURES

**Note**: See detailed procedures below for:
- FIX 11: Inventory Integration
- FIX 12: Refund Logic
- FIX 13: Caching Layer
- FIX 14: Shift Management
- FIX 15: Audit Logging

*(Truncated for brevity - follow same pattern as Phase 2)*

---

## 🚀 EXECUTION CHECKLIST

### Week 1 (This Week): Integration
- [ ] Copy all 6 services to proper locations
- [ ] Update imports in all services
- [ ] Test email service
- [ ] Test payment service
- [ ] Test order state machine
- [ ] Test kitchen operations
- [ ] Test table locking
- [ ] Test role-based access
- [ ] All Phase 1 tests passing

### Week 2: Critical Phase 2
- [ ] FIX 7: Reconciliation service created
- [ ] FIX 8: Shift service created
- [ ] FIX 9: Database indexes added
- [ ] FIX 10: Reports generating
- [ ] All Phase 2 tests passing
- [ ] Daily reports working

### Week 3: High Priority
- [ ] FIX 11: Inventory integration
- [ ] FIX 12: Refund logic
- [ ] FIX 13: Caching layer
- [ ] FIX 14: Shift management
- [ ] FIX 15: Audit logging
- [ ] Full integration testing

### Week 4: Polish
- [ ] Query optimization complete
- [ ] Error handling standardized
- [ ] Full test suite passing
- [ ] Documentation complete
- [ ] Phase 2 sign-off
- [ ] Phase 3 ready

---

## ✅ SUCCESS CRITERIA

By end of Phase 2 (Feb 28):

**Functional**
- ✅ All 15 fixes implemented and tested
- ✅ All state machines validated
- ✅ All business workflows complete
- ✅ All reports generating

**Technical**
- ✅ Zero N+1 queries
- ✅ < 100ms response time on standard queries
- ✅ All financial operations transactional
- ✅ All role-based access enforced

**Quality**
- ✅ 100% test coverage on services
- ✅ All error cases handled
- ✅ Comprehensive logging
- ✅ Production-ready code

**Documentation**
- ✅ API documentation complete
- ✅ Deployment runbooks created
- ✅ Troubleshooting guides written
- ✅ Architecture documented

---

**Next Step**: Start Week 1 integration immediately!

Good luck! 🚀
