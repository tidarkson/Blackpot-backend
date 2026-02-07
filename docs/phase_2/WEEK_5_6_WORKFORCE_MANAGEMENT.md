# 🍳 BlackPot Phase 2 - Week 5-6: Workforce & Staff Retention System
## Complete Implementation Guide with AI Prompts

**Duration**: 2 weeks  
**Story Points**: 24  
**Priority**: High  
**Dependencies**: Weeks 1-4 completed

---

## 📊 Sprint Overview

### Sprint Goal
Build intelligent workforce management system designed for high-turnover hospitality environments, with smart scheduling, attendance tracking, skills management, and staff retention analytics.

### Features Breakdown
1. **Smart Shift Scheduling** - Auto-suggest schedules based on demand (8 pts)
2. **PIN-Based Attendance** - Clock in/out without biometric hardware (5 pts)
3. **Skills & Training Tracker** - Who can do what, certifications (5 pts)
4. **Staff Reliability Score** - Data-driven performance metrics (4 pts)
5. **Exit Interview Capture** - Understand why staff leave (2 pts)

---

## 🎯 STORY 3.1: Smart Shift Scheduling Algorithm

**Story ID**: BP-WFM-003-001  
**Story Points**: 8  
**Priority**: Critical  
**Estimate**: 12-16 hours

### User Story
**As a** restaurant manager  
**I want** AI-suggested shift schedules based on demand patterns  
**So that** I optimize labor costs while ensuring adequate coverage

### Acceptance Criteria
- [ ] System analyzes historical sales data to predict busy periods
- [ ] Auto-suggests staff assignments based on past attendance and skills
- [ ] Considers staff availability and preferences
- [ ] Detects understaffing/overstaffing and suggests adjustments
- [ ] Handles shift swaps and conflict detection
- [ ] Generates weekly schedules with one click
- [ ] Staff can view and accept/decline assigned shifts via web app

---

### 📋 TASK 3.1.1: Demand Forecasting Database Schema

**Component**: Database + Backend Types  
**Estimate**: 3-4 hours  
**Story Points**: 3  
**Priority**: P0 (Must complete first)

<details>
<summary><strong>🤖 COMPLETE AI PROMPT - Database Schema (Click to Expand & Copy)</strong></summary>

```markdown
SYSTEM CONTEXT:
You are building BlackPot, a Nigerian restaurant POS web application.

TECH STACK:
- Frontend: React 18 + TypeScript + TanStack Query + Tailwind CSS
- Backend: Express.js 5.2.1 + TypeScript 5.9.3 + Prisma 5.22.0
- Database: PostgreSQL 15
- Real-time: Socket.io 4.8.3

EXISTING DATABASE MODELS:
- Tenant (multi-tenancy)
- Location (restaurant locations)
- User (staff with roles: OWNER, MANAGER, SERVER, CHEF, BARTENDER, HOST, etc.)
- Shift (staff shifts with start/end times, shiftDate, status)
- Order (orders with timestamps, amounts, staff attribution)

TASK: Design Smart Scheduling Database Schema

Build database models to support:
1. Demand forecasting (predict busy periods from historical data)
2. Staff availability tracking (when staff can/cannot work)
3. Shift templates (recurring shift patterns)
4. Schedule optimization (labor cost tracking)
5. Shift swap requests

REQUIREMENTS:
- Multi-tenant isolation (all queries filtered by tenantId)
- Support for multiple locations per tenant
- Track labor costs vs revenue
- Store demand patterns by hour/day/week
- Handle shift conflicts and overlaps

IMPLEMENTATION:

1. Add to `database/prisma/schema.prisma`:

```prisma
// ===============================
// WORKFORCE MANAGEMENT - SMART SCHEDULING
// ===============================

// Demand forecasting - stores historical patterns
model DemandForecast {
  id         String   @id @default(uuid())
  tenantId   String
  locationId String
  
  // Time period
  dayOfWeek  Int      // 0-6 (Sunday-Saturday)
  hourOfDay  Int      // 0-23
  
  // Metrics
  averageOrders      Float   // Average orders during this hour/day combo
  averageRevenue     Decimal @db.Decimal(12, 2)
  averageCovers      Int     // Average number of customers
  peakFlag           Boolean @default(false) // Is this a peak hour?
  
  // Recommended staffing
  recommendedServers    Int   @default(2)
  recommendedKitchen    Int   @default(2)
  recommendedBartenders Int   @default(1)
  recommendedHosts      Int   @default(1)
  
  // Metadata
  dataPoints   Int      // Number of historical shifts used
  lastUpdated  DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, locationId, dayOfWeek, hourOfDay])
  @@index([tenantId])
  @@index([locationId])
  @@index([dayOfWeek])
  @@index([peakFlag])
}

// Staff availability - when staff can/cannot work
model StaffAvailability {
  id        String   @id @default(uuid())
  tenantId  String
  userId    String
  
  // Weekly recurring availability
  dayOfWeek    Int      // 0-6
  startTime    String   // "09:00"
  endTime      String   // "17:00"
  isAvailable  Boolean  @default(true)
  
  // Preferences
  preferredShift String? // "MORNING", "AFTERNOON", "EVENING", "NIGHT"
  notes          String? // "Prefer not to work Sundays"
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, userId, dayOfWeek])
  @@index([tenantId])
  @@index([userId])
  @@index([dayOfWeek])
}

// One-time availability exceptions (vacations, sick days, etc.)
model AvailabilityException {
  id              String    @id @default(uuid())
  tenantId        String
  userId          String
  
  exceptionDate   DateTime  // Specific date
  isAvailable     Boolean   // true = available despite being blocked, false = unavailable
  startTime       String?   // Optional time range
  endTime         String?
  reason          String?   // "Vacation", "Medical appointment", etc.
  approvedById    String?   // Manager who approved
  approvedAt      DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenant     Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user       User   @relation("StaffExceptions", fields: [userId], references: [id], onDelete: Cascade)
  approvedBy User?  @relation("ApprovedExceptions", fields: [approvedById], references: [id])
  
  @@index([tenantId])
  @@index([userId])
  @@index([exceptionDate])
}

// Shift templates - recurring shift patterns
model ShiftTemplate {
  id           String   @id @default(uuid())
  tenantId     String
  locationId   String
  
  name         String   // "Morning Server", "Closing Chef"
  description  String?
  
  // Shift details
  dayOfWeek    Int      // 0-6
  startTime    String   // "09:00"
  endTime      String   // "17:00"
  roleRequired UserRole // Required staff role
  
  // Staffing
  requiredCount Int     @default(1) // How many people needed
  
  // Status
  isActive     Boolean  @default(true)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([locationId])
  @@index([dayOfWeek])
  @@index([roleRequired])
}

// Shift swap requests
model ShiftSwapRequest {
  id                String            @id @default(uuid())
  tenantId          String
  
  originalShiftId   String            // Shift being offered
  requestedById     String            // Staff requesting swap
  targetStaffId     String?           // Specific staff member (optional)
  
  reason            String?
  status            ShiftSwapStatus   @default(PENDING)
  
  approvedById      String?           // Manager who approved
  approvedAt        DateTime?
  acceptedById      String?           // Staff who accepted
  acceptedAt        DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenant        Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  originalShift Shift  @relation("OriginalShift", fields: [originalShiftId], references: [id], onDelete: Cascade)
  requestedBy   User   @relation("SwapRequester", fields: [requestedById], references: [id])
  targetStaff   User?  @relation("SwapTarget", fields: [targetStaffId], references: [id])
  approvedBy    User?  @relation("SwapApprover", fields: [approvedById], references: [id])
  acceptedBy    User?  @relation("SwapAcceptor", fields: [acceptedById], references: [id])
  
  @@index([tenantId])
  @@index([originalShiftId])
  @@index([status])
  @@index([requestedById])
}

// Labor cost tracking
model LaborCostAnalysis {
  id            String   @id @default(uuid())
  tenantId      String
  locationId    String
  
  analysisDate  DateTime
  
  // Labor costs
  totalLaborCost   Decimal @db.Decimal(12, 2)
  totalHours       Decimal @db.Decimal(10, 2)
  
  // Revenue
  totalRevenue     Decimal @db.Decimal(12, 2)
  totalOrders      Int
  
  // Calculations
  laborCostPercent Decimal @db.Decimal(5, 2) // Labor cost as % of revenue
  revenuePerHour   Decimal @db.Decimal(10, 2)
  
  // Staffing levels
  averageStaffCount Float
  peakStaffCount    Int
  
  // Efficiency flags
  isOverstaffed  Boolean @default(false) // Labor cost > 35%
  isUnderstaffed Boolean @default(false) // Labor cost < 20% but many orders
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, locationId, analysisDate])
  @@index([tenantId])
  @@index([locationId])
  @@index([analysisDate])
  @@index([laborCostPercent])
}

// Schedule generation log
model ScheduleGenerationLog {
  id            String   @id @default(uuid())
  tenantId      String
  locationId    String
  
  weekStartDate DateTime // Start of the week being scheduled
  
  generatedById String   // Manager who generated schedule
  generatedAt   DateTime @default(now())
  
  // Results
  shiftsGenerated  Int
  conflictsFound   Int
  staffAssigned    Int
  
  // Algorithm settings used
  optimizationGoal String  // "MINIMIZE_COST", "MAXIMIZE_COVERAGE", "BALANCED"
  settings         Json?   // Algorithm parameters
  
  // Status
  status    String   // "DRAFT", "PUBLISHED", "ARCHIVED"
  publishedAt DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  location    Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  generatedBy User     @relation(fields: [generatedById], references: [id])
  
  @@index([tenantId])
  @@index([locationId])
  @@index([weekStartDate])
  @@index([status])
}

// ===============================
// ENUMS
// ===============================

enum ShiftSwapStatus {
  PENDING       // Awaiting manager approval
  APPROVED      // Manager approved, awaiting acceptance
  ACCEPTED      // Another staff accepted the swap
  DECLINED      // Manager declined
  CANCELLED     // Requester cancelled
  EXPIRED       // Time passed without acceptance
}

// ===============================
// UPDATE EXISTING MODELS
// ===============================

model Tenant {
  // ... existing fields ...
  demandForecasts          DemandForecast[]
  staffAvailabilities      StaffAvailability[]
  availabilityExceptions   AvailabilityException[]
  shiftTemplates           ShiftTemplate[]
  shiftSwapRequests        ShiftSwapRequest[]
  laborCostAnalyses        LaborCostAnalysis[]
  scheduleGenerationLogs   ScheduleGenerationLog[]
}

model User {
  // ... existing fields ...
  availability             StaffAvailability[]
  availabilityExceptions   AvailabilityException[] @relation("StaffExceptions")
  approvedExceptions       AvailabilityException[] @relation("ApprovedExceptions")
  swapRequestsMade         ShiftSwapRequest[]      @relation("SwapRequester")
  swapRequestsTargeted     ShiftSwapRequest[]      @relation("SwapTarget")
  swapRequestsApproved     ShiftSwapRequest[]      @relation("SwapApprover")
  swapRequestsAccepted     ShiftSwapRequest[]      @relation("SwapAcceptor")
  schedulesGenerated       ScheduleGenerationLog[]
}

model Location {
  // ... existing fields ...
  demandForecasts        DemandForecast[]
  shiftTemplates         ShiftTemplate[]
  laborCostAnalyses      LaborCostAnalysis[]
  scheduleGenerationLogs ScheduleGenerationLog[]
}

model Shift {
  // ... existing fields ...
  swapRequests ShiftSwapRequest[] @relation("OriginalShift")
}
```

2. Create TypeScript types in `backend/src/types/scheduling.ts`:

```typescript
import { UserRole, ShiftSwapStatus } from '@prisma/client';

export interface DemandPattern {
  dayOfWeek: number;
  hourOfDay: number;
  averageOrders: number;
  averageRevenue: number;
  peakFlag: boolean;
  recommendedStaffing: {
    servers: number;
    kitchen: number;
    bartenders: number;
    hosts: number;
  };
}

export interface StaffAvailabilityInput {
  userId: string;
  weeklyAvailability: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    preferredShift?: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';
  }>;
}

export interface AvailabilityExceptionInput {
  userId: string;
  exceptionDate: Date;
  isAvailable: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

export interface ShiftTemplateInput {
  name: string;
  locationId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roleRequired: UserRole;
  requiredCount: number;
}

export interface ScheduleGenerationRequest {
  tenantId: string;
  locationId: string;
  weekStartDate: Date;
  optimizationGoal: 'MINIMIZE_COST' | 'MAXIMIZE_COVERAGE' | 'BALANCED';
  constraints?: {
    maxHoursPerStaff?: number; // Default 40
    minRestHoursBetweenShifts?: number; // Default 8
    respectAvailability?: boolean; // Default true
  };
}

export interface GeneratedSchedule {
  weekStartDate: Date;
  shifts: Array<{
    templateId: string;
    date: Date;
    startTime: string;
    endTime: string;
    assignedStaffId: string;
    roleRequired: UserRole;
  }>;
  conflicts: Array<{
    type: 'OVERLAP' | 'UNAVAILABLE' | 'OVERTIME' | 'REST_PERIOD';
    staffId: string;
    description: string;
    shiftIds: string[];
  }>;
  metrics: {
    totalShifts: number;
    totalStaff: number;
    estimatedLaborCost: number;
    coverageScore: number; // 0-100
  };
}

export interface ShiftSwapRequestInput {
  originalShiftId: string;
  targetStaffId?: string;
  reason?: string;
}

export interface LaborCostMetrics {
  date: Date;
  totalLaborCost: number;
  totalRevenue: number;
  laborCostPercent: number;
  totalHours: number;
  revenuePerHour: number;
  isOverstaffed: boolean;
  isUnderstaffed: boolean;
}
```

3. Create seed data in `database/seeds/scheduling-seeds.ts`:

```typescript
import { PrismaClient, UserRole } from '@prisma/client';

export async function seedSchedulingData(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string
) {
  // Seed demand forecasts (sample patterns)
  const demandPatterns = [];
  
  // Weekend peak hours
  for (let day of [5, 6]) { // Friday, Saturday
    for (let hour of [18, 19, 20, 21]) { // Dinner rush
      demandPatterns.push({
        tenantId,
        locationId,
        dayOfWeek: day,
        hourOfDay: hour,
        averageOrders: 25,
        averageRevenue: 750000, // ₦750,000
        averageCovers: 60,
        peakFlag: true,
        recommendedServers: 5,
        recommendedKitchen: 4,
        recommendedBartenders: 2,
        recommendedHosts: 2,
        dataPoints: 12, // 12 weeks of data
      });
    }
  }
  
  // Weekday lunch
  for (let day of [1, 2, 3, 4, 5]) { // Monday-Friday
    for (let hour of [12, 13]) {
      demandPatterns.push({
        tenantId,
        locationId,
        dayOfWeek: day,
        hourOfDay: hour,
        averageOrders: 15,
        averageRevenue: 300000,
        averageCovers: 35,
        peakFlag: false,
        recommendedServers: 3,
        recommendedKitchen: 2,
        recommendedBartenders: 1,
        recommendedHosts: 1,
        dataPoints: 12,
      });
    }
  }
  
  await prisma.demandForecast.createMany({ data: demandPatterns });
  
  // Seed shift templates
  const templates = [
    {
      tenantId,
      locationId,
      name: 'Morning Server Shift',
      dayOfWeek: 1, // Monday
      startTime: '08:00',
      endTime: '16:00',
      roleRequired: UserRole.SERVER,
      requiredCount: 2,
    },
    {
      tenantId,
      locationId,
      name: 'Evening Kitchen Shift',
      dayOfWeek: 5, // Friday
      startTime: '16:00',
      endTime: '00:00',
      roleRequired: UserRole.CHEF,
      requiredCount: 3,
    },
    {
      tenantId,
      locationId,
      name: 'Weekend Bartender',
      dayOfWeek: 6, // Saturday
      startTime: '18:00',
      endTime: '02:00',
      roleRequired: UserRole.BARTENDER,
      requiredCount: 2,
    },
  ];
  
  await prisma.shiftTemplate.createMany({ data: templates });
  
  console.log('✅ Scheduling data seeded successfully');
  console.log(`   - ${demandPatterns.length} demand forecast entries`);
  console.log(`   - ${templates.length} shift templates`);
}
```

4. Update main seed file `database/seeds/seed.ts`:

```typescript
import { seedSchedulingData } from './scheduling-seeds';

async function main() {
  // ... existing seed code for tenant, location, users ...
  
  // Seed scheduling data
  await seedSchedulingData(prisma, tenant.id, location.id);
}
```

5. Run migration and seed:

```bash
# Generate migration
npx prisma migrate dev --name add_smart_scheduling_models

# Generate Prisma Client
npx prisma generate

# Run seeds
npm run db:seed

# Verify in Prisma Studio
npx prisma studio
```

DELIVERABLES:
1. ✅ 7 new Prisma models (DemandForecast, StaffAvailability, etc.)
2. ✅ 1 new enum (ShiftSwapStatus)
3. ✅ TypeScript type definitions
4. ✅ Seed data with realistic demand patterns
5. ✅ Database migration executed successfully
6. ✅ Verification in Prisma Studio

VALIDATION CHECKLIST:
- [ ] All relationships work (test in Prisma Studio)
- [ ] Cascade deletes configured properly
- [ ] Indexes on all frequently queried fields
- [ ] Unique constraints prevent duplicate entries
- [ ] Seed data creates successfully without errors
- [ ] Multi-tenancy enforced (tenantId on all models)

CONSTRAINTS:
- DemandForecast must have unique combination of (tenantId, locationId, dayOfWeek, hourOfDay)
- StaffAvailability must have unique combination of (tenantId, userId, dayOfWeek)
- Labor cost percentage > 35% flags as overstaffed
- Labor cost percentage < 20% with high orders flags as understaffed
- All time fields stored as strings in "HH:MM" format for simplicity

OUTPUT:
Provide:
1. Complete updated schema.prisma file
2. TypeScript types file (scheduling.ts)
3. Seed data file (scheduling-seeds.ts)
4. Successful migration confirmation
5. Screenshot/confirmation from Prisma Studio showing seeded data
```

</details>

**Deliverables:**
- [ ] 7 new database models created
- [ ] TypeScript types defined
- [ ] Migration executed successfully
- [ ] Seed data with demand patterns
- [ ] Prisma Studio verification complete

---

### 📋 TASK 3.1.2: Demand Forecasting Algorithm

**Component**: Backend Service  
**Estimate**: 4-5 hours  
**Story Points**: 5  
**Dependencies**: Task 3.1.1

<details>
<summary><strong>🤖 COMPLETE AI PROMPT - Demand Forecasting Service (Click to Expand & Copy)</strong></summary>

```markdown
CONTEXT:
You've completed Task 3.1.1 and have database models for demand forecasting.

TECH STACK:
- Backend: Express.js 5.2.1 + TypeScript 5.9.3
- Database: Prisma 5.22.0 + PostgreSQL
- Existing models: Order (with timestamps, amounts), User, Shift, Location

TASK: Build Demand Forecasting Algorithm

Create a service that:
1. Analyzes historical order data
2. Calculates demand patterns by day/hour
3. Predicts staffing needs
4. Updates DemandForecast table
5. Runs as scheduled job (cron)

REQUIREMENTS:
- Analyze last 12 weeks of order data
- Group by day of week + hour of day
- Calculate average orders, revenue, covers
- Determine peak hours (>50% above average)
- Recommend staffing levels based on orders/revenue
- Handle missing data gracefully

IMPLEMENTATION:

1. Create `backend/src/services/DemandForecastService.ts`:

```typescript
import { PrismaClient, Prisma } from '@prisma/client';
import logger from '../config/logger';
import { DemandPattern } from '../types/scheduling';

export class DemandForecastService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Analyze historical data and update demand forecasts
   * Run this weekly as a cron job
   */
  async updateForecasts(tenantId: string, locationId: string): Promise<void> {
    logger.info(`Updating demand forecasts for tenant ${tenantId}, location ${locationId}`);

    const weeksToAnalyze = 12;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (weeksToAnalyze * 7));

    // Get all orders for analysis period
    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        locationId,
        createdAt: {
          gte: startDate,
        },
        status: {
          in: ['COMPLETED', 'PAID', 'CLOSED'],
        },
      },
      include: {
        orderItems: true,
      },
    });

    if (orders.length === 0) {
      logger.warn('No historical data found for forecasting');
      return;
    }

    // Group orders by day of week and hour
    const patterns = this.analyzePatterns(orders);

    // Calculate staffing recommendations
    const forecastsWithStaffing = patterns.map(pattern => 
      this.calculateStaffing(pattern)
    );

    // Update or create forecasts in database
    for (const forecast of forecastsWithStaffing) {
      await this.prisma.demandForecast.upsert({
        where: {
          tenantId_locationId_dayOfWeek_hourOfDay: {
            tenantId,
            locationId,
            dayOfWeek: forecast.dayOfWeek,
            hourOfDay: forecast.hourOfDay,
          },
        },
        update: {
          averageOrders: forecast.averageOrders,
          averageRevenue: forecast.averageRevenue,
          averageCovers: forecast.averageCovers,
          peakFlag: forecast.peakFlag,
          recommendedServers: forecast.recommendedStaffing.servers,
          recommendedKitchen: forecast.recommendedStaffing.kitchen,
          recommendedBartenders: forecast.recommendedStaffing.bartenders,
          recommendedHosts: forecast.recommendedStaffing.hosts,
          dataPoints: forecast.dataPoints,
          lastUpdated: new Date(),
        },
        create: {
          tenantId,
          locationId,
          dayOfWeek: forecast.dayOfWeek,
          hourOfDay: forecast.hourOfDay,
          averageOrders: forecast.averageOrders,
          averageRevenue: forecast.averageRevenue,
          averageCovers: forecast.averageCovers,
          peakFlag: forecast.peakFlag,
          recommendedServers: forecast.recommendedStaffing.servers,
          recommendedKitchen: forecast.recommendedStaffing.kitchen,
          recommendedBartenders: forecast.recommendedStaffing.bartenders,
          recommendedHosts: forecast.recommendedStaffing.hosts,
          dataPoints: forecast.dataPoints,
        },
      });
    }

    logger.info(`Updated ${forecastsWithStaffing.length} demand forecast entries`);
  }

  /**
   * Analyze order patterns
   */
  private analyzePatterns(orders: any[]): DemandPattern[] {
    const patternMap = new Map<string, {
      orders: number[];
      revenue: number[];
      covers: number[];
    }>();

    // Group orders by day/hour
    for (const order of orders) {
      const date = new Date(order.createdAt);
      const dayOfWeek = date.getDay(); // 0-6
      const hourOfDay = date.getHours(); // 0-23
      const key = `${dayOfWeek}-${hourOfDay}`;

      if (!patternMap.has(key)) {
        patternMap.set(key, { orders: [], revenue: [], covers: [] });
      }

      const pattern = patternMap.get(key)!;
      pattern.orders.push(1); // Count this order
      pattern.revenue.push(parseFloat(order.totalAmount.toString()));
      pattern.covers.push(order.guestCount || 2); // Default 2 if not set
    }

    // Calculate averages
    const patterns: DemandPattern[] = [];
    const allAverages: number[] = [];

    // First pass: calculate averages
    for (const [key, data] of patternMap.entries()) {
      const [dayOfWeek, hourOfDay] = key.split('-').map(Number);
      const avgOrders = this.average(data.orders);
      allAverages.push(avgOrders);

      patterns.push({
        dayOfWeek,
        hourOfDay,
        averageOrders: avgOrders,
        averageRevenue: this.average(data.revenue),
        averageCovers: Math.round(this.average(data.covers)),
        peakFlag: false, // Will calculate in next pass
        dataPoints: data.orders.length,
        recommendedStaffing: {
          servers: 2,
          kitchen: 2,
          bartenders: 1,
          hosts: 1,
        },
      });
    }

    // Second pass: mark peak hours
    const overallAverage = this.average(allAverages);
    const peakThreshold = overallAverage * 1.5; // 50% above average

    for (const pattern of patterns) {
      pattern.peakFlag = pattern.averageOrders >= peakThreshold;
    }

    return patterns;
  }

  /**
   * Calculate recommended staffing levels
   */
  private calculateStaffing(pattern: DemandPattern): DemandPattern {
    const orders = pattern.averageOrders;
    const revenue = pattern.averageRevenue;

    // Baseline staffing
    let servers = 2;
    let kitchen = 2;
    let bartenders = 1;
    let hosts = 1;

    // Scale based on order volume
    if (orders >= 30) {
      servers = 6;
      kitchen = 4;
      bartenders = 2;
      hosts = 2;
    } else if (orders >= 20) {
      servers = 4;
      kitchen = 3;
      bartenders = 2;
      hosts = 1;
    } else if (orders >= 10) {
      servers = 3;
      kitchen = 2;
      bartenders = 1;
      hosts = 1;
    }

    // Adjust for peak hours
    if (pattern.peakFlag) {
      servers += 1;
      kitchen += 1;
    }

    pattern.recommendedStaffing = {
      servers,
      kitchen,
      bartenders,
      hosts,
    };

    return pattern;
  }

  /**
   * Get demand forecast for specific time
   */
  async getForecast(
    tenantId: string,
    locationId: string,
    date: Date
  ): Promise<DemandPattern | null> {
    const dayOfWeek = date.getDay();
    const hourOfDay = date.getHours();

    const forecast = await this.prisma.demandForecast.findUnique({
      where: {
        tenantId_locationId_dayOfWeek_hourOfDay: {
          tenantId,
          locationId,
          dayOfWeek,
          hourOfDay,
        },
      },
    });

    if (!forecast) return null;

    return {
      dayOfWeek: forecast.dayOfWeek,
      hourOfDay: forecast.hourOfDay,
      averageOrders: forecast.averageOrders,
      averageRevenue: parseFloat(forecast.averageRevenue.toString()),
      averageCovers: forecast.averageCovers,
      peakFlag: forecast.peakFlag,
      dataPoints: forecast.dataPoints,
      recommendedStaffing: {
        servers: forecast.recommendedServers,
        kitchen: forecast.recommendedKitchen,
        bartenders: forecast.recommendedBartenders,
        hosts: forecast.recommendedHosts,
      },
    };
  }

  /**
   * Get all forecasts for a location
   */
  async getAllForecasts(
    tenantId: string,
    locationId: string
  ): Promise<DemandPattern[]> {
    const forecasts = await this.prisma.demandForecast.findMany({
      where: {
        tenantId,
        locationId,
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { hourOfDay: 'asc' },
      ],
    });

    return forecasts.map(f => ({
      dayOfWeek: f.dayOfWeek,
      hourOfDay: f.hourOfDay,
      averageOrders: f.averageOrders,
      averageRevenue: parseFloat(f.averageRevenue.toString()),
      averageCovers: f.averageCovers,
      peakFlag: f.peakFlag,
      dataPoints: f.dataPoints,
      recommendedStaffing: {
        servers: f.recommendedServers,
        kitchen: f.recommendedKitchen,
        bartenders: f.recommendedBartenders,
        hosts: f.recommendedHosts,
      },
    }));
  }

  /**
   * Helper: Calculate average
   */
  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }
}
```

2. Create cron job in `backend/src/jobs/updateForecasts.ts`:

```typescript
import cron from 'node-cron';
import { prisma } from '../config/database';
import { DemandForecastService } from '../services/DemandForecastService';
import logger from '../config/logger';

const forecastService = new DemandForecastService(prisma);

/**
 * Update demand forecasts weekly (every Sunday at 2 AM)
 */
export function scheduleForcastUpdates() {
  cron.schedule('0 2 * * 0', async () => {
    logger.info('Starting weekly demand forecast update');

    try {
      // Get all active tenants and locations
      const locations = await prisma.location.findMany({
        where: {
          isActive: true,
        },
        select: {
          id: true,
          tenantId: true,
        },
      });

      for (const location of locations) {
        await forecastService.updateForecasts(location.tenantId, location.id);
      }

      logger.info('Completed weekly demand forecast update');
    } catch (error) {
      logger.error('Error updating demand forecasts:', error);
    }
  });

  logger.info('Scheduled demand forecast updates (Sundays at 2 AM)');
}
```

3. Create API endpoints in `backend/src/controllers/SchedulingController.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { DemandForecastService } from '../services/DemandForecastService';
import { prisma } from '../config/database';
import logger from '../config/logger';

const forecastService = new DemandForecastService(prisma);

export class SchedulingController {
  /**
   * GET /api/scheduling/forecasts
   * Get all demand forecasts for location
   */
  static async getForecasts(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId;
      const locationId = req.user!.locationId || req.query.locationId as string;

      const forecasts = await forecastService.getAllForecasts(tenantId, locationId);

      res.json({
        success: true,
        data: forecasts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/scheduling/forecasts/update
   * Manually trigger forecast update (Manager/Owner only)
   */
  static async triggerUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId;
      const locationId = req.user!.locationId || req.body.locationId;

      await forecastService.updateForecasts(tenantId, locationId);

      res.json({
        success: true,
        message: 'Demand forecasts updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/scheduling/forecasts/peek-hours
   * Get peak hours for the location
   */
  static async getPeakHours(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId;
      const locationId = req.user!.locationId || req.query.locationId as string;

      const forecasts = await forecastService.getAllForecasts(tenantId, locationId);
      const peakHours = forecasts.filter(f => f.peakFlag);

      res.json({
        success: true,
        data: peakHours,
      });
    } catch (error) {
      next(error);
    }
  }
}
```

4. Create routes in `backend/src/routes/scheduling.ts`:

```typescript
import { Router } from 'express';
import { SchedulingController } from '../controllers/SchedulingController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = Router();

router.use(authenticate);

router.get('/forecasts', SchedulingController.getForecasts);
router.get('/forecasts/peak-hours', SchedulingController.getPeakHours);
router.post(
  '/forecasts/update',
  requireRole(['MANAGER', 'OWNER']),
  SchedulingController.triggerUpdate
);

export default router;
```

5. Register routes and cron in `backend/src/index.ts`:

```typescript
import schedulingRoutes from './routes/scheduling';
import { scheduleForcastUpdates } from './jobs/updateForecasts';

// Routes
app.use(`${config.API_PREFIX}/scheduling`, schedulingRoutes);

// Cron jobs
scheduleForcastUpdates();
```

6. Install dependencies:

```bash
npm install node-cron
npm install --save-dev @types/node-cron
```

7. Create tests in `backend/tests/DemandForecastService.test.ts`:

```typescript
import { DemandForecastService } from '../src/services/DemandForecastService';
import { prismaMock } from './mocks/prisma';

describe('DemandForecastService', () => {
  let service: DemandForecastService;

  beforeEach(() => {
    service = new DemandForecastService(prismaMock as any);
  });

  describe('updateForecasts', () => {
    it('should analyze orders and create forecasts', async () => {
      // Mock order data
      const mockOrders = [
        {
          id: '1',
          createdAt: new Date('2024-01-15T19:00:00'), // Monday 7 PM
          totalAmount: 25000,
          guestCount: 4,
          status: 'COMPLETED',
          orderItems: [],
        },
        {
          id: '2',
          createdAt: new Date('2024-01-22T19:00:00'), // Monday 7 PM (next week)
          totalAmount: 30000,
          guestCount: 5,
          status: 'COMPLETED',
          orderItems: [],
        },
      ];

      prismaMock.order.findMany.mockResolvedValue(mockOrders as any);
      prismaMock.demandForecast.upsert.mockResolvedValue({} as any);

      await service.updateForecasts('tenant-1', 'location-1');

      expect(prismaMock.demandForecast.upsert).toHaveBeenCalled();
    });
  });

  describe('getForecast', () => {
    it('should return forecast for specific date/time', async () => {
      const mockForecast = {
        dayOfWeek: 1,
        hourOfDay: 19,
        averageOrders: 15,
        averageRevenue: 450000,
        averageCovers: 35,
        peakFlag: true,
        recommendedServers: 4,
        recommendedKitchen: 3,
        recommendedBartenders: 2,
        recommendedHosts: 1,
        dataPoints: 8,
      };

      prismaMock.demandForecast.findUnique.mockResolvedValue(mockForecast as any);

      const date = new Date('2024-02-05T19:00:00'); // Monday 7 PM
      const result = await service.getForecast('tenant-1', 'location-1', date);

      expect(result).toBeDefined();
      expect(result?.peakFlag).toBe(true);
      expect(result?.recommendedStaffing.servers).toBe(4);
    });
  });
});
```

DELIVERABLES:
1. ✅ DemandForecastService with analysis algorithm
2. ✅ Cron job for weekly updates
3. ✅ API endpoints for forecasts
4. ✅ Unit tests
5. ✅ Integration with existing Order model

ALGORITHM LOGIC:
- Analyzes last 12 weeks of completed orders
- Groups by day of week (0-6) and hour (0-23)
- Calculates averages for orders, revenue, covers
- Marks peak if > 50% above overall average
- Recommends staffing based on volume:
  * <10 orders: 2 servers, 2 kitchen, 1 bartender, 1 host
  * 10-20 orders: 3 servers, 2 kitchen, 1 bartender, 1 host
  * 20-30 orders: 4 servers, 3 kitchen, 2 bartenders, 1 host
  * 30+ orders: 6 servers, 4 kitchen, 2 bartenders, 2 hosts
- Adds +1 to servers and kitchen during peak hours

CONSTRAINTS:
- Requires at least 4 weeks of order data for accurate forecasts
- Updates run weekly (Sundays at 2 AM)
- Only analyzes completed/paid orders
- Handles locations with no data gracefully (no crash)
- All monetary calculations use Decimal type

OUTPUT:
Provide working code for:
1. DemandForecastService.ts
2. Cron job setup
3. API controller and routes
4. Unit tests
5. Example API response showing peak hours
```

</details>

**Deliverables:**
- [ ] Demand forecast algorithm implemented
- [ ] Weekly cron job scheduled
- [ ] REST API endpoints created
- [ ] Unit tests written and passing
- [ ] Manual trigger for managers

---

[CONTINUING WITH REMAINING TASKS...]

Due to the extensive length needed, I'll continue this pattern for ALL remaining weeks. Let me create the complete files now.

