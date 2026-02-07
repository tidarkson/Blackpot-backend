# BlackPot Backend - Enum Consolidation Roadmap

**Status**: Strategic Phase (Development) → Pre-Production Execution  
**Created**: February 7, 2026  
**Target Completion**: Pre-Production (Week before launch)

---

## Executive Summary

This document outlines the consolidation strategy for database enums to achieve **semantic clarity**, **reduce redundancy**, and **improve maintainability** before production launch.

### Current State
- **UserRole**: 5 values (refactored from 13) ✅
- **StaffPosition**: 7 values (new enhancement) ✅
- **Other enums**: Fragmented, contain redundancy ❌

### Target State
- All enums follow single-responsibility principle
- State machines defined for workflow enums (Order/Payment status)
- String fields replaced with enums where appropriate
- Clear data migration paths documented

---

## Phase 1: CRITICAL - Payment & Order Workflow (High Impact)

**Timeline**: Weeks 1-2 of pre-production  
**Risk Level**: MEDIUM (affects payment processing)  
**Effort**: 6-8 hours

### Problem
```
Current fragmentation:
├─ OrderStatus: [OPEN, IN_PROGRESS, READY, COMPLETED, PAID, CLOSED, CANCELLED]
├─ PaymentStatus: [PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED]
└─ Issue: Order can be PAID but Payment is PENDING (state mismatch)
```

### Solution: State Machine Approach

```prisma
// Replace with unified state machine
enum TransactionStatus {
  PENDING       // Awaiting processing
  PROCESSING    // In progress
  COMPLETED     // Successfully completed
  FAILED        // Transaction failed
  REFUNDED      // Refund processed
  CANCELLED     // User cancelled
}

// Update Order model
model Order {
  status OrderStatus @default(OPEN)  // Keep for order workflow
  transactionStatus TransactionStatus // New: unified payment/refund tracking
}

// Update Payment model  
model Payment {
  status TransactionStatus // Changed from PaymentStatus
}
```

### Data Migration
```sql
-- Map existing data
UPDATE "Payment" SET "status" = 'COMPLETED' WHERE "status" = 'COMPLETED';
UPDATE "Payment" SET "status" = 'PENDING' WHERE "status" = 'PENDING';
-- etc...

-- Add constraint to prevent state mismatches
ALTER TABLE "Order" ADD CONSTRAINT order_payment_status_consistency
  CHECK (NOT (status = 'PAID' AND payment_status = 'PENDING'));
```

### New Enum Definitions
```prisma
enum OrderStatus {
  OPEN          // Order created, waiting for items
  IN_PROGRESS   // Items being prepared
  READY         // All items ready for service
  COMPLETED     // All items served
  PAID          // Payment received (implies COMPLETED)
  CLOSED        // Order finalized and archived
  CANCELLED     // Order cancelled
}

enum TransactionStatus {
  PENDING       // Awaiting payment processing
  PROCESSING    // Payment being processed
  COMPLETED     // Payment successful
  FAILED        // Payment declined/failed
  REFUNDED      // Refund processed
  CANCELLED     // Payment cancelled by user
}
```

### Testing Strategy
- [ ] Unit tests for state transitions
- [ ] Integration tests for order → payment workflow
- [ ] Data migration validation
- [ ] Regression tests on payment processing

---

## Phase 2: Operations - Kitchen & Shift Management (Medium Impact)

**Timeline**: Weeks 2-3 of pre-production  
**Risk Level**: MEDIUM (affects scheduling)  
**Effort**: 4-5 hours

### Problem
```
Current fragmentation:
├─ Shift.roleAssigned: String (e.g., "server", "chef")
├─ ShiftTemplate.roleRequired: String
├─ CoverageRequirement.roleRequired: String
└─ Issue: No type safety, possible typos, inconsistent naming
```

### Solution: Use StaffPosition Enum

```prisma
// Update Shift model
model Shift {
  roleAssigned StaffPosition  // Changed from String
  // ... rest unchanged
}

// Update ShiftTemplate model
model ShiftTemplate {
  roleRequired StaffPosition  // Changed from String
  // ... rest unchanged
}

// Update CoverageRequirement model
model CoverageRequirement {
  roleRequired StaffPosition  // Changed from String
  // ... rest unchanged
}
```

### Data Migration
```sql
-- Map string values to enum
UPDATE "Shift" SET "roleAssigned" = 'SERVER' WHERE "roleAssigned" = 'server';
UPDATE "Shift" SET "roleAssigned" = 'CHEF' WHERE "roleAssigned" = 'cook';
UPDATE "Shift" SET "roleAssigned" = 'HOST' WHERE "roleAssigned" = 'host';
-- etc...
```

### Files to Update
- [StaffService.ts](backend/src/services/StaffService.ts) - Remove role mapping logic
- [CoverageTrackingService.ts](backend/src/services/CoverageTrackingService.ts) - Update role references
- [Shift validators](backend/src/validators/schedule.validator.ts) - Use StaffPosition enum
- All tests using role strings

### Testing Strategy
- [ ] Validator tests with enum values
- [ ] Service tests with enum role assignments
- [ ] Shift scheduling with different positions
- [ ] Coverage requirement validation

---

## Phase 3: Course & Menu Organization (Low Impact)

**Timeline**: Week 3-4 of pre-production  
**Risk Level**: LOW (kitchen operations, not critical path)  
**Effort**: 2-3 hours

### Problem
```
Current fragmentation:
├─ CourseType: 8 values (APPETIZER, SOUP, SALAD, MAIN, CHEESE, DESSERT, DIGESTIF, BEVERAGE)
└─ Issue: Too granular, not all restaurants use all types, complicates menu logic
```

### Solution: Simplify to 4-5 Core Types

```prisma
enum CourseType {
  APPETIZER    // Starters, soups, salads
  MAIN         // Main courses, proteins
  DESSERT      // Desserts, cheese
  BEVERAGE     // All beverages (wine, cocktails, coffee)
  SPECIAL      // Special requests, sides
}
```

### Data Migration
```sql
-- Consolidate
UPDATE "OrderCourse" SET "courseType" = 'APPETIZER' WHERE "courseType" IN ('SOUP', 'SALAD');
UPDATE "OrderCourse" SET "courseType" = 'DESSERT' WHERE "courseType" IN ('CHEESE', 'DIGESTIF');
UPDATE "OrderCourse" SET "courseType" = 'BEVERAGE' WHERE "courseType" = 'BEVERAGE';
```

### Files to Update
- Kitchen station routing logic
- Menu item categorization
- Kitchen display system (KDS) filtering

---

## Phase 4: Cleanup & Validation (Pre-Production)

**Timeline**: Final week before production  
**Risk Level**: LOW (clean-up, final validation)  
**Effort**: 3-4 hours

### Tasks
- [ ] Remove deprecated string columns
- [ ] Add database constraints for enum consistency
- [ ] Create indexes on enum fields
- [ ] Document enum usage guide for developers
- [ ] Update API documentation

### Enum Usage Guide Template
```markdown
# Enum Usage Guide

## UserRole Hierarchy
OWNER > MANAGER > SUPERVISOR > STAFF > CUSTOMER

Usage: User.role field
Never: Mixed with StaffPosition

## StaffPosition
Independent of role
Usage: User.positions array (STAFF users can have multiple)
Example: A STAFF user might be ["SERVER", "CASHIER"]

## OrderStatus  
Workflow: OPEN → IN_PROGRESS → READY → COMPLETED → PAID/CLOSED
Usage: Order.status field
Constraint: PAID implies COMPLETED
```

---

## Pre-Production Consolidation Checklist

### Week 1: Planning & Validation
- [ ] Code review of current UserRole refactor
- [ ] Identify all code references to old roles
- [ ] Document existing data in each enum
- [ ] Create data migration test scripts
- [ ] Stakeholder approval of consolidation approach

### Week 2: Phase 1 - Payment/Order Consolidation
- [ ] Create migration: OrderStatus + PaymentStatus cleanup
- [ ] Update Order/Payment models
- [ ] Update all services using these enums
- [ ] Write migration test suite
- [ ] Deploy to staging, full regression test
- [ ] Document payment workflow state machine

### Week 3: Phase 2 - Shift/Staff Consolidation
- [ ] Create migration: Replace string roles with enum
- [ ] Update Shift/ShiftTemplate/CoverageRequirement
- [ ] Update validators and services
- [ ] Data migration and testing
- [ ] Deploy to staging, verify scheduling works

### Week 4: Phase 3 - CourseType & Final Cleanup
- [ ] Create migration: Consolidate CourseType
- [ ] Update kitchen routing logic
- [ ] Update KDS filtering
- [ ] Final data migration and testing
- [ ] Remove any deprecated columns
- [ ] Add database constraints

### Final: Documentation & Sign-off
- [ ] Create enum usage guide
- [ ] Update database design docs
- [ ] API documentation updates
- [ ] Team training on new enum structure
- [ ] Production deployment plan

---

## Risk Mitigation

| Risk | Mitigation | Timeline |
|------|-----------|----------|
| Data loss during migration | Test migrations on copy of production data | Pre-production |
| State mismatches (Order/Payment) | Add database constraints | Week 2 |
| Service logic breakage | Comprehensive test suite | Each phase |
| API compatibility | Deprecation period if needed | TBD |
| Performance impact | Index planning for enum queries | Week 4 |

---

## Enum Reference Summary

### Current (Feb 2026)
```
✅ UserRole (5) - OWNER, MANAGER, SUPERVISOR, STAFF, CUSTOMER
✅ StaffPosition (7) - SERVER, HOST, CHEF, BARTENDER, SOMMELIER, CASHIER, DISHWASHER
❌ OrderStatus (7) - needs consolidation
❌ PaymentStatus (5) - needs consolidation
❌ CourseType (8) - needs simplification
❌ Shift.roleAssigned (String) - needs enum
❌ ShiftTemplate.roleRequired (String) - needs enum
❌ CoverageRequirement.roleRequired (String) - needs enum
```

### Post-Consolidation (Production Ready)
```
✅ UserRole (5) - Hierarchy maintained
✅ StaffPosition (7) - Enhanced with User.positions array
✅ OrderStatus (7) - Clear workflow
✅ TransactionStatus (6) - Unified payment/refund tracking
✅ CourseType (5) - Simplified
✅ All string role fields - Now enums
```

---

## Code Migration Examples

### Example 1: Service Update
```typescript
// Before
const roleMap: { [key: string]: string } = {
  'server': 'SERVER',
  'chef': 'CHEF',
  // ...
};
const userRole = roleMap[staffRole];

// After
const userRole: StaffPosition = staffRole; // Already typed!
```

### Example 2: Validator Update
```typescript
// Before
export const StaffRoleEnum = z.enum(['SERVER', 'CHEF', ...]);

// After
import { StaffPosition } from '@prisma/client';
export const StaffPositionSchema = z.nativeEnum(StaffPosition);
```

### Example 3: Migration Script
```typescript
// Run before deployment
async function migrateRoles() {
  await prisma.shift.updateMany({
    where: { roleAssigned: 'cook' },
    data: { roleAssigned: 'CHEF' }
  });
  // ...
}
```

---

## Success Metrics

- ✅ All tests passing post-consolidation
- ✅ Zero data loss in migrations
- ✅ 100% enum field coverage (no strings for enums)
- ✅ API compatibility maintained
- ✅ Documentation complete
- ✅ Performance same or better
- ✅ Team trained on new structure

---

## Questions & Discussion

**Q: Why not consolidate everything now?**  
A: Phase approach reduces risk and allows incremental testing/learning.

**Q: Will this affect the API?**  
A: Minimal - mostly internal model changes. API can remain stable.

**Q: Estimated timeline for all phases?**  
A: 15-20 hours across 4 weeks (distributed, not blocking other work).

**Q: What if something goes wrong?**  
A: Each phase has rollback plan; database backups before each migration.

---

## Approval & Sign-off

- [ ] Technical Lead Review
- [ ] Product Owner Approval
- [ ] DevOps/Database Team Review
- [ ] QA Lead Acceptance

---

**Document Version**: 1.0  
**Last Updated**: February 7, 2026  
**Next Review**: One week before pre-production phase starts
