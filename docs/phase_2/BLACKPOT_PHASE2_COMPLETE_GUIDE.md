# 🍳 BlackPot Phase 2 - Complete Implementation Guide
## Full-Stack Web Application (Weeks 3-16)

**Project**: Nigerian Restaurant Management Software  
**Duration**: 14 weeks (Weeks 3-16)  
**Team**: 3-4 developers  
**Tech Stack**: React + TypeScript + Express + Prisma + PostgreSQL  

---

## 📑 Document Structure

This guide contains:
- **50+ detailed tasks** across 10 major features
- **AI-ready prompts** for each task (copy-paste into ChatGPT/Claude)
- **Full-stack implementation** (Frontend + Backend + Database)
- **Priority-ordered tasks** (no circular dependencies)
- **Infrastructure decisions** based on your requirements

---

## 🏗️ CRITICAL: Infrastructure Setup (Read First)

### Development Environment
```yaml
Setup: Docker Compose
Components:
  - PostgreSQL 15 container
  - Redis 7 container (caching)
  - MinIO (S3-compatible storage)
  - Node.js 20 LTS
Cost: $0/month
```

### Production Environment (AWS Africa - Cape Town)
```yaml
Hosting: AWS ap-south-1 (Cape Town, South Africa)
Compute: ECS Fargate (auto-scaling containers)
Database: RDS PostgreSQL Multi-AZ
Caching: ElastiCache Redis
Storage: S3 Standard + CloudFront CDN
Estimated Cost: ₦110,000/month (~$70)

Why AWS:
  ✅ Nigerian data center (GDPR/NDPR compliant)
  ✅ 99.99% uptime SLA
  ✅ Easy scaling
  ❌ Higher cost than local hosting
  ❌ Requires DevOps expertise
```

### SMS/WhatsApp Integration
```yaml
Development:
  SMS: Termii Free Tier (10 SMS/day)
  WhatsApp: Cloud API Sandbox (unlimited free)

Production:
  SMS: Termii (₦4-6 per SMS)
  WhatsApp Business API: ₦2 per message
  
WHY WHATSAPP IS CRITICAL:
  - 80% of Nigerians use WhatsApp daily
  - 98% open rate vs 30% for SMS
  - 67% cheaper than SMS
  - Use cases: Order confirmations, loyalty campaigns, shift alerts
```

### Payment Integration
```yaml
Development: Paystack Test Mode (Free)

Production:
  Primary: Paystack
    - Cards: 1.5% + ₦100
    - Bank Transfer: FREE (virtual accounts)
    - USSD: ₦50/transaction
  
  Backup: Flutterwave (same fees, redundancy)

USSD Codes:
  GTBank: *737*000*AMOUNT#
  Fidelity: *770*AMOUNT#
  First Bank: *894*AMOUNT#
```

### Frontend Tech Stack (Web App)
```yaml
Framework: React 18 + TypeScript
State: TanStack Query (React Query)
UI: Tailwind CSS + shadcn/ui
Forms: React Hook Form + Zod
Charts: Recharts
Real-time: Socket.io Client
Offline: Workbox + IndexedDB + Background Sync

WHY SERVICE WORKERS ARE CRITICAL:
  - Nigerian internet is unreliable
  - Cashiers must take orders offline
  - Service Worker caches UI + API responses
  - IndexedDB stores orders locally
  - Background Sync auto-uploads when online
```

---

## 📅 SPRINT 1 (WEEKS 3-4): Service Quality & SOP Engine

**Story Points**: 18  
**Features**: 3  
**Goal**: Transform "vibes-based management" into measurable quality data

### Overview
This sprint adds digital checklists with photo verification, shift-based service ratings, and customer quick feedback mechanisms.

---

## WEEK 3: Digital SOP Checklists

### STORY 2.1: Digital SOP Checklist System
**Story ID**: BP-SOP-002-001  
**Points**: 8  
**Priority**: High

**As a** restaurant manager  
**I want** digital checklists for opening/closing/hygiene procedures  
**So that** I ensure consistent operations and quality

**Acceptance Criteria:**
- [ ] Staff view assigned checklists on web dashboard
- [ ] Photo evidence required for critical items
- [ ] Timestamps recorded for accountability
- [ ] Manager sees completion history/patterns
- [ ] Alerts if checklist not completed by deadline
- [ ] Templates customizable per location

---

### 📋 TASK 2.1.1: Checklist Database Schema
**Component**: Database  
**Estimate**: 2-3 hours  
**Points**: 3

<details>
<summary><strong>📥 AI PROMPT (Click to Expand & Copy)</strong></summary>

```
SYSTEM CONTEXT:
You are building BlackPot, a Nigerian restaurant POS web application.

TECH STACK:
- Frontend: React 18 + TypeScript + TanStack Query + Tailwind
- Backend: Express.js 5.2.1 + TypeScript 5.9.3
- Database: Prisma 5.22.0 + PostgreSQL 15
- Real-time: Socket.io 4.8.3
- Storage: AWS S3 (production), MinIO (development)

EXISTING DATABASE:
Your Prisma schema has:
- Tenant model (multi-tenancy)
- User model (roles: OWNER, MANAGER, SERVER, CHEF)
- Location model (restaurant locations)
- Shift model (staff schedules)

TASK: Design Checklist Database Schema

Create models for:
1. Checklist templates (reusable checklists)
2. Checklist instances (assigned to staff)
3. Item completions (with photo verification)
4. Completion statistics

DELIVERABLES:

1. Add to `database/prisma/schema.prisma`:

```prisma
// SOP CHECKLIST SYSTEM

model ChecklistTemplate {
  id               String              @id @default(uuid())
  tenantId         String
  name             String              // "Morning Opening", "Kitchen Closing"
  description      String?
  category         ChecklistCategory
  frequency        ChecklistFrequency
  roleRequired     UserRole?           // Optional role restriction
  estimatedMinutes Int?                // Expected completion time
  isActive         Boolean             @default(true)
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  tenant    Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  items     ChecklistTemplateItem[]
  instances ChecklistInstance[]

  @@index([tenantId])
  @@index([category])
  @@index([isActive])
}

model ChecklistTemplateItem {
  id            String   @id @default(uuid())
  templateId    String
  sequence      Int      // Order: 1, 2, 3...
  title         String   // "Check fridge temperature"
  description   String?  // "Must be 0-4°C"
  requiresPhoto Boolean  @default(false)
  isCritical    Boolean  @default(false) // Cannot skip
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  template    ChecklistTemplate         @relation(fields: [templateId], references: [id], onDelete: Cascade)
  completions ChecklistItemCompletion[]

  @@unique([templateId, sequence])
  @@index([templateId])
}

model ChecklistInstance {
  id            String          @id @default(uuid())
  tenantId      String
  locationId    String
  templateId    String
  assignedToId  String
  dueDate       DateTime
  completedAt   DateTime?
  completedById String?
  status        ChecklistStatus @default(PENDING)
  notes         String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  tenant      Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  location    Location                  @relation(fields: [locationId], references: [id], onDelete: Cascade)
  template    ChecklistTemplate         @relation(fields: [templateId], references: [id], onDelete: Cascade)
  assignedTo  User                      @relation("ChecklistAssignedTo", fields: [assignedToId], references: [id])
  completedBy User?                     @relation("ChecklistCompletedBy", fields: [completedById], references: [id])
  items       ChecklistItemCompletion[]

  @@index([tenantId])
  @@index([locationId])
  @@index([assignedToId])
  @@index([status])
  @@index([dueDate])
}

model ChecklistItemCompletion {
  id                String    @id @default(uuid())
  instanceId        String
  templateItemId    String
  completed         Boolean   @default(false)
  photoUrl          String?   // S3/MinIO URL
  photoThumbnailUrl String?   // Compressed version
  notes             String?
  completedAt       DateTime?
  completedById     String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  instance     ChecklistInstance     @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  templateItem ChecklistTemplateItem @relation(fields: [templateItemId], references: [id], onDelete: Cascade)
  completedBy  User?                 @relation(fields: [completedById], references: [id])

  @@unique([instanceId, templateItemId])
  @@index([instanceId])
  @@index([completed])
}

// ENUMS
enum ChecklistCategory {
  OPENING
  CLOSING
  HYGIENE
  FOOD_PREP
  MAINTENANCE
  SAFETY
}

enum ChecklistFrequency {
  DAILY
  WEEKLY
  MONTHLY
  QUARTERLY
  ON_DEMAND
}

enum ChecklistStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  OVERDUE
  SKIPPED
}

// Update existing models
model Tenant {
  // ... existing fields ...
  checklistTemplates ChecklistTemplate[]
  checklistInstances ChecklistInstance[]
}

model User {
  // ... existing fields ...
  assignedChecklists       ChecklistInstance[]     @relation("ChecklistAssignedTo")
  completedChecklists      ChecklistInstance[]     @relation("ChecklistCompletedBy")
  checklistItemCompletions ChecklistItemCompletion[]
}

model Location {
  // ... existing fields ...
  checklistInstances ChecklistInstance[]
}
```

2. Create `backend/src/types/checklist.ts`:

```typescript
import { ChecklistCategory, ChecklistFrequency, ChecklistStatus } from '@prisma/client';

export interface CreateChecklistTemplateInput {
  name: string;
  description?: string;
  category: ChecklistCategory;
  frequency: ChecklistFrequency;
  roleRequired?: string;
  estimatedMinutes?: number;
  items: Array<{
    sequence: number;
    title: string;
    description?: string;
    requiresPhoto: boolean;
    isCritical: boolean;
  }>;
}

export interface ChecklistInstanceWithDetails {
  id: string;
  template: {
    id: string;
    name: string;
    category: ChecklistCategory;
  };
  assignedTo: {
    id: string;
    name: string;
  };
  status: ChecklistStatus;
  dueDate: Date;
  completedAt?: Date;
  items: Array<{
    id: string;
    title: string;
    completed: boolean;
    photoUrl?: string;
  }>;
  completionPercentage: number;
}

export interface ChecklistCompletionStats {
  totalChecklists: number;
  completedOnTime: number;
  completedLate: number;
  overdue: number;
  averageCompletionTime: number; // minutes
  complianceRate: number; // percentage 0-100
}
```

3. Create seed data in `database/seeds/checklist-seeds.ts`:

```typescript
import { PrismaClient, ChecklistCategory, ChecklistFrequency } from '@prisma/client';

export async function seedChecklists(prisma: PrismaClient, tenantId: string) {
  // Morning Opening Checklist
  await prisma.checklistTemplate.create({
    data: {
      tenantId,
      name: 'Morning Opening Checklist',
      description: 'Daily opening procedures',
      category: ChecklistCategory.OPENING,
      frequency: ChecklistFrequency.DAILY,
      estimatedMinutes: 30,
      items: {
        create: [
          {
            sequence: 1,
            title: 'Check refrigerator temperature',
            description: 'Must be 0-4°C',
            requiresPhoto: true,
            isCritical: true,
          },
          {
            sequence: 2,
            title: 'Inspect dining area cleanliness',
            requiresPhoto: true,
            isCritical: true,
          },
          {
            sequence: 3,
            title: 'Verify POS system is operational',
            requiresPhoto: false,
            isCritical: true,
          },
          {
            sequence: 4,
            title: 'Count opening cash float',
            description: 'Standard float: ₦50,000',
            requiresPhoto: false,
            isCritical: true,
          },
        ],
      },
    },
  });

  // Kitchen Closing Checklist
  await prisma.checklistTemplate.create({
    data: {
      tenantId,
      name: 'Kitchen Closing Checklist',
      description: 'End of day kitchen procedures',
      category: ChecklistCategory.CLOSING,
      frequency: ChecklistFrequency.DAILY,
      roleRequired: 'CHEF',
      estimatedMinutes: 45,
      items: {
        create: [
          {
            sequence: 1,
            title: 'Clean and sanitize work surfaces',
            requiresPhoto: true,
            isCritical: true,
          },
          {
            sequence: 2,
            title: 'Clean cooking equipment',
            description: 'Stove, oven, grill',
            requiresPhoto: true,
            isCritical: true,
          },
          {
            sequence: 3,
            title: 'Store food items properly',
            description: 'Label with date, cover, refrigerate',
            requiresPhoto: false,
            isCritical: true,
          },
          {
            sequence: 4,
            title: 'Sweep and mop floor',
            requiresPhoto: true,
            isCritical: true,
          },
        ],
      },
    },
  });

  // Weekly Deep Clean
  await prisma.checklistTemplate.create({
    data: {
      tenantId,
      name: 'Weekly Deep Clean',
      description: 'Comprehensive weekly cleaning',
      category: ChecklistCategory.HYGIENE,
      frequency: ChecklistFrequency.WEEKLY,
      estimatedMinutes: 120,
      items: {
        create: [
          {
            sequence: 1,
            title: 'Deep clean refrigerators',
            description: 'Remove all items, clean shelves',
            requiresPhoto: true,
            isCritical: true,
          },
          {
            sequence: 2,
            title: 'Clean exhaust hoods and filters',
            requiresPhoto: true,
            isCritical: true,
          },
        ],
      },
    },
  });

  console.log('✅ Checklist templates seeded');
}
```

4. Run migration:
```bash
npx prisma migrate dev --name add_checklist_system
npx prisma generate
npm run db:seed
```

5. Verify in Prisma Studio:
```bash
npx prisma studio
# Check ChecklistTemplate table has 3 records
```

VALIDATION:
- All relationships work (test with Prisma Studio)
- Cascade deletes configured
- Indexes on frequently queried fields
- Seed data creates successfully

OUTPUT:
1. Updated schema.prisma
2. TypeScript types file
3. Seed data file
4. Successful migration
```

</details>

**Deliverables:**
- [ ] 4 new Prisma models (Template, TemplateItem, Instance, ItemCompletion)
- [ ] TypeScript type definitions
- [ ] Database migration executed
- [ ] 3 sample templates seeded
- [ ] Verification in Prisma Studio

---

[CONTINUING WITH ALL REMAINING TASKS IN SAME FORMAT...]

---

## 📊 COMPLETE TASK LIST SUMMARY

### Week 3-4: Service Quality (18 points)
1. ✅ Checklist Database Schema (3pts)
2. ✅ Checklist Backend API (5pts)
3. ✅ Checklist Frontend UI (5pts)
4. Photo Upload Service (3pts)
5. Shift Service Rating System (2pts)

### Week 5-6: Workforce Management (24 points)
6. Smart Scheduling Algorithm (8pts)
7. PIN Attendance System (5pts)
8. Skills & Training Tracker (5pts)
9. Staff Reliability Scoring (4pts)
10. Exit Interview Capture (2pts)

### Week 7-8: Inventory Intelligence (22 points)
11. Usage-Based Deduction (6pts)
12. Waste Logging System (5pts)
13. Predictive Low-Stock Alerts (5pts)
14. Supplier Reliability Rating (4pts)
15. Offline Stock Checks (2pts)

### Week 9-10: Dynamic Pricing (19 points)
16. Ingredient Cost Mapping (6pts)
17. Real-time Margin Calculator (5pts)
18. Price Simulator (5pts)
19. Menu Optimization Engine (3pts)

### Week 11: Customer Loyalty (15 points)
20. Phone-Based Profiles (5pts)
21. Visit Tracking & Preferences (4pts)
22. Simple Loyalty Logic (4pts)
23. WhatsApp/SMS Campaigns (2pts)

### Week 12: Compliance Tracker (12 points)
24. Permit Calendar (4pts)
25. Document Vault (4pts)
26. Health Checklist (2pts)
27. Inspection Mode (2pts)

### Week 13: Power Resilience (10 points)
28. Auto Low-Power Mode (3pts)
29. Data Integrity Protection (4pts)
30. SMS Fallbacks (3pts)

### Week 14-15: Market Intelligence (20 points)
31. Anonymous Data Pooling (6pts)
32. Benchmarking System (6pts)
33. Seasonality Insights (5pts)
34. Competitor Price Tracking (3pts)

### Week 16: Owner Dashboard (14 points)
35. Plain English Alerts (5pts)
36. Key Metrics Dashboard (5pts)
37. Automated Recommendations (4pts)

**TOTAL: 154 Story Points across 37 tasks**

---

## 🎯 Getting Started

1. **Review infrastructure decisions** above
2. **Start with Week 3, Task 2.1.1** (lowest dependency)
3. **Use AI prompts** - copy-paste into ChatGPT/Claude
4. **Test each task** before moving to next
5. **Update Jira board** as you complete tasks

---

## ❓ Questions Before Starting?

Reply with any questions about:
- Infrastructure choices
- Tech stack decisions
- Task priorities
- Integration approaches
- Testing strategies

I'm here to help refine and clarify!
