# CRITICAL PHASE 1 - Implementation Files

This directory contains all implementations for the critical phase 1 fixes.

## Files in this phase:

1. **FIX 1: EmailService.ts** ✅ (Already updated)
   - Nodemailer integration with Gmail/SendGrid support
   - Password reset email template
   - Welcome email template
   - Error handling and logging

2. **FIX 2: PaymentService.ts** - Payment Transaction Integrity
   - Database transaction wrapping
   - Payment amount validation
   - Financial consistency checks

3. **FIX 3: OrderService.ts** - Order State Validation
   - Order state machine (OPEN → IN_PROGRESS → READY → COMPLETED → PAID → CLOSED)
   - State transition validation
   - Completion requirements checking

4. **FIX 4: KitchenService.ts** - Kitchen State Machine
   - Course state machine (PENDING → FIRED → PREPARING → READY → SERVED)
   - State transition tracking
   - Timing metrics

5. **FIX 5: TableService.ts** - Table Locking
   - Concurrent access prevention
   - Table lock/unlock mechanism
   - Capacity validation

6. **FIX 6: New File - RoleBasedAccessFilter.ts**
   - Role-based data filtering middleware
   - Permission checking utilities
   - Owner-only, read-only, own-only filters

## Setup Instructions

### 1. Install Required Dependencies

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

### 2. Update Environment Variables

Add to .env:

```
# Email Configuration
EMAIL_PROVIDER=GMAIL
GMAIL_USER=your-email@gmail.com
GMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@blackpot.com
FRONTEND_URL=http://localhost:3000

# Or for SendGrid:
# EMAIL_PROVIDER=SENDGRID
# SENDGRID_API_KEY=your-sendgrid-key
```

### 3. Test Email Setup

```bash
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## Implementation Order

1. Complete EmailService updates ✅
2. Update PaymentService with transactions (next)
3. Update OrderService with state validation
4. Update KitchenService with state machine
5. Create TableService with locking
6. Create RoleBasedAccessFilter utility
7. Run comprehensive tests
8. Deploy to staging

## Testing Strategy

See **CRITICAL_PHASE_1_TESTS.md** for detailed test cases.

Quick Test:
```bash
# Test password reset email
npm run test:critical:phase1

# Test order state transitions
npm run test:order:state-machine

# Test kitchen state machine
npm run test:kitchen:state-machine

# Test payment transactions
npm run test:payment:transactions

# Test table locking
npm run test:table:locking
```

## Rollback Plan

If any fix causes issues:
```bash
# Restore to previous working commit
git revert <commit-hash>

# Clear database transactions
npm run db:reset:dev

# Restart service
npm restart
```

## Completion Checklist

- [ ] EmailService fully implemented and tested
- [ ] PaymentService uses transactions
- [ ] OrderService validates state transitions
- [ ] KitchenService implements state machine
- [ ] TableService implements locking
- [ ] RoleBasedAccessFilter created and integrated
- [ ] All tests passing
- [ ] Code review completed
- [ ] Ready for Phase 2
