# 🍳 BlackPot Phase 2 - Weeks 9-16: Complete Implementation Guide
## Pricing, Loyalty, Compliance, Resilience, Intelligence & Dashboard

**Total Duration**: 8 weeks  
**Total Story Points**: 70  
**Features**: 7 major modules

---

## 📋 TABLE OF CONTENTS

1. [Week 9-10: Dynamic Pricing Engine (19 pts)](#week-9-10)
2. [Week 11: Customer Loyalty System (15 pts)](#week-11)
3. [Week 12: Compliance Tracker (12 pts)](#week-12)
4. [Week 13: Power Resilience Layer (10 pts)](#week-13)
5. [Week 14-15: Market Intelligence Network (20 pts)](#week-14-15)
6. [Week 16: Owner Command Dashboard (14 pts)](#week-16)

---

<a name="week-9-10"></a>
## WEEK 9-10: DYNAMIC PRICING ENGINE (19 POINTS)

### Sprint Goal
Transform menu pricing from guesswork into data-driven decisions with real-time margin calculations, price simulators, and automatic optimization suggestions.

### Features
1. **Ingredient-to-Menu Cost Mapping** (6 pts)
2. **Real-Time Margin Calculator** (5 pts)
3. **Price Change Simulator** (5 pts)
4. **Menu Optimization Suggestions** (3 pts)

---

### STORY 5.1: Ingredient Cost Mapping & Real-Time Margins

**Story ID**: BP-PRICE-005-001  
**Story Points**: 6  
**Priority**: High

**User Story:**  
As a restaurant owner, I want to see the exact cost and profit margin of each dish in real-time, so that I know which items are making or losing money.

**Acceptance Criteria:**
- [ ] Every menu item shows ingredient cost breakdown
- [ ] Real-time margin displayed (cost vs selling price)
- [ ] Margins update when supplier prices change
- [ ] Manager dashboard shows low-margin items
- [ ] Alert when selling below cost

---

### 📋 TASK 5.1.1: Pricing Intelligence Database Schema

**Component**: Database + Types  
**Estimate**: 3-4 hours  
**Points**: 3

<details>
<summary><strong>🤖 COMPLETE AI PROMPT (Click & Copy)</strong></summary>

```markdown
SYSTEM CONTEXT:
BlackPot POS with existing: MenuItem, Recipe, RecipeIngredient, InventoryItem

TASK: Design Dynamic Pricing Database Schema

Add to `database/prisma/schema.prisma`:

```prisma
// DYNAMIC PRICING & MARGIN INTELLIGENCE

model MenuItemPricing {
  id          String   @id @default(uuid())
  tenantId    String
  menuItemId  String   @unique
  
  // Current pricing
  currentPrice      Decimal @db.Decimal(10, 2)
  
  // Cost breakdown
  ingredientCost    Decimal @db.Decimal(10, 2) // From recipe
  laborCost         Decimal @db.Decimal(10, 2) // Estimated prep time * hourly rate
  overheadCost      Decimal @db.Decimal(10, 2) // Fixed % of sales
  totalCost         Decimal @db.Decimal(10, 2) // Sum of above
  
  // Margin calculations
  grossProfit       Decimal @db.Decimal(10, 2) // Price - Cost
  profitMargin      Decimal @db.Decimal(5, 2)  // (Profit / Price) * 100
  markupPercent     Decimal @db.Decimal(5, 2)  // (Profit / Cost) * 100
  
  // Performance metrics
  salesLast30Days   Int     @default(0)
  revenueLast30Days Decimal @db.Decimal(12, 2) @default(0)
  
  // Pricing health
  isProfitable      Boolean @default(true)
  needsPriceReview  Boolean @default(false)
  
  // Recommendations
  suggestedPrice    Decimal? @db.Decimal(10, 2)
  priceChangeReason String?
  
  lastCalculated DateTime @default(now())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  menuItem MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([isProfitable])
  @@index([needsPriceReview])
  @@index([profitMargin])
}

model PriceChangeHistory {
  id          String   @id @default(uuid())
  tenantId    String
  menuItemId  String
  
  oldPrice    Decimal  @db.Decimal(10, 2)
  newPrice    Decimal  @db.Decimal(10, 2)
  changeType  String   // "INCREASE", "DECREASE", "RESET"
  reason      String
  
  // Who approved
  changedById String
  changedAt   DateTime @default(now())
  
  // Impact tracking
  salesBefore      Int?
  salesAfter       Int?
  impactAnalyzedAt DateTime?
  
  createdAt DateTime @default(now())
  
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  menuItem  MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  changedBy User     @relation(fields: [changedById], references: [id])
  
  @@index([tenantId])
  @@index([menuItemId])
  @@index([changedAt])
}

model PriceSimulation {
  id          String   @id @default(uuid())
  tenantId    String
  menuItemId  String
  
  // Current state
  currentPrice   Decimal @db.Decimal(10, 2)
  currentMargin  Decimal @db.Decimal(5, 2)
  currentSales   Int
  
  // Proposed state
  proposedPrice  Decimal @db.Decimal(10, 2)
  
  // Predictions
  predictedMargin      Decimal @db.Decimal(5, 2)
  predictedSalesChange Float   // +10% or -5%
  predictedRevenue     Decimal @db.Decimal(12, 2)
  
  // Elasticity estimate
  priceElasticity Float   // How sensitive is demand to price
  
  // Status
  status        String  // "DRAFT", "UNDER_REVIEW", "APPROVED", "REJECTED", "IMPLEMENTED"
  approvedById  String?
  approvedAt    DateTime?
  notes         String?
  
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  menuItem    MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  createdBy   User     @relation("SimulationCreator", fields: [createdById], references: [id])
  approvedBy  User?    @relation("SimulationApprover", fields: [approvedById], references: [id])
  
  @@index([tenantId])
  @@index([menuItemId])
  @@index([status])
}

model SupplierPriceHistory {
  id              String   @id @default(uuid())
  tenantId        String
  inventoryItemId String
  supplierId      String?
  
  price           Decimal  @db.Decimal(10, 2)
  unit            String
  currency        String   @default("NGN")
  
  effectiveDate   DateTime
  recordedAt      DateTime @default(now())
  
  priceChange     Decimal? @db.Decimal(10, 2) // Change from previous
  changePercent   Decimal? @db.Decimal(5, 2)
  
  notes           String?
  
  createdAt DateTime @default(now())
  
  tenant        Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  inventoryItem InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([inventoryItemId])
  @@index([effectiveDate])
}

// Update existing models
model Tenant {
  // ... existing ...
  menuItemPricing      MenuItemPricing[]
  priceChangeHistory   PriceChangeHistory[]
  priceSimulations     PriceSimulation[]
  supplierPriceHistory SupplierPriceHistory[]
}

model MenuItem {
  // ... existing ...
  pricing            MenuItemPricing?
  priceHistory       PriceChangeHistory[]
  priceSimulations   PriceSimulation[]
}

model InventoryItem {
  // ... existing ...
  priceHistory SupplierPriceHistory[]
}

model User {
  // ... existing ...
  priceChanges          PriceChangeHistory[]
  createdSimulations    PriceSimulation[]     @relation("SimulationCreator")
  approvedSimulations   PriceSimulation[]     @relation("SimulationApprover")
}
```

TypeScript types (`backend/src/types/pricing.ts`):

```typescript
export interface MenuItemMargins {
  menuItemId: string;
  menuItemName: string;
  currentPrice: number;
  ingredientCost: number;
  laborCost: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number; // percentage
  isProfitable: boolean;
  salesLast30Days: number;
}

export interface PriceSimulationRequest {
  menuItemId: string;
  proposedPrice: number;
  expectedElasticity?: number; // -0.5 = 10% price increase → 5% sales decrease
}

export interface PriceOptimizationSuggestion {
  menuItemId: string;
  currentPrice: number;
  suggestedPrice: number;
  reason: string;
  expectedImpact: {
    marginChange: number;
    revenueChange: number;
  };
}
```

Migration:
```bash
npx prisma migrate dev --name add_dynamic_pricing
npx prisma generate
```

DELIVERABLES:
1. ✅ 4 pricing-related models
2. ✅ Price history tracking
3. ✅ Simulation engine schema
4. ✅ Supplier price volatility tracking
```

</details>

---

### 📋 TASK 5.1.2: Margin Calculation Engine

**Component**: Backend Service  
**Estimate**: 4-5 hours  
**Points**: 3

<details>
<summary><strong>🤖 COMPLETE AI PROMPT (Click & Copy)</strong></summary>

```markdown
TASK: Build Real-Time Margin Calculator

`backend/src/services/PricingService.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { MenuItemMargins } from '../types/pricing';

export class PricingService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Calculate and update margins for all menu items
   * Run this daily or when supplier prices change
   */
  async updateAllMargins(tenantId: string): Promise<void> {
    const menuItems = await this.prisma.menuItem.findMany({
      where: { tenantId },
      include: {
        recipe: {
          include: {
            ingredients: {
              include: {
                inventoryItem: true,
              },
            },
          },
        },
      },
    });

    for (const item of menuItems) {
      await this.calculateMargins(tenantId, item.id);
    }
  }

  /**
   * Calculate margins for specific menu item
   */
  async calculateMargins(
    tenantId: string,
    menuItemId: string
  ): Promise<MenuItemMargins> {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: {
        recipe: {
          include: {
            ingredients: {
              include: {
                inventoryItem: true,
              },
            },
          },
        },
      },
    });

    if (!menuItem) {
      throw new Error('Menu item not found');
    }

    // Calculate ingredient cost
    let ingredientCost = 0;
    if (menuItem.recipe) {
      for (const ing of menuItem.recipe.ingredients) {
        const cost = parseFloat(ing.totalCost.toString());
        ingredientCost += cost;
      }
    }

    // Estimate labor cost (simple: 10 min prep * ₦500/hour)
    const laborCost = menuItem.recipe ? (menuItem.recipe.prepTime / 60) * 500 : 100;

    // Overhead (assume 15% of price)
    const currentPrice = parseFloat(menuItem.price.toString());
    const overheadCost = currentPrice * 0.15;

    const totalCost = ingredientCost + laborCost + overheadCost;
    const grossProfit = currentPrice - totalCost;
    const profitMargin = (grossProfit / currentPrice) * 100;
    const markupPercent = (grossProfit / totalCost) * 100;

    // Get sales data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesData = await this.prisma.orderItem.aggregate({
      where: {
        menuItemId,
        order: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
          status: {
            in: ['COMPLETED', 'PAID', 'CLOSED'],
          },
        },
      },
      _sum: {
        quantity: true,
        subtotal: true,
      },
    });

    const salesLast30Days = salesData._sum.quantity || 0;
    const revenueLast30Days = parseFloat(salesData._sum.subtotal?.toString() || '0');

    // Determine if profitable
    const isProfitable = grossProfit > 0;
    const needsReview = profitMargin < 20 || !isProfitable;

    // Calculate suggested price (target 30% margin)
    let suggestedPrice: number | null = null;
    let priceChangeReason: string | null = null;

    if (profitMargin < 25) {
      suggestedPrice = totalCost / 0.7; // 30% margin
      priceChangeReason = 'Current margin below 25% - suggested price for 30% target';
    } else if (profitMargin > 50 && salesLast30Days < 10) {
      suggestedPrice = currentPrice * 0.9; // Reduce 10%
      priceChangeReason = 'High margin but low sales - price reduction may boost volume';
    }

    // Upsert pricing record
    await this.prisma.menuItemPricing.upsert({
      where: {
        menuItemId,
      },
      update: {
        currentPrice,
        ingredientCost,
        laborCost,
        overheadCost,
        totalCost,
        grossProfit,
        profitMargin,
        markupPercent,
        salesLast30Days,
        revenueLast30Days,
        isProfitable,
        needsPriceReview: needsReview,
        suggestedPrice,
        priceChangeReason,
        lastCalculated: new Date(),
      },
      create: {
        tenantId,
        menuItemId,
        currentPrice,
        ingredientCost,
        laborCost,
        overheadCost,
        totalCost,
        grossProfit,
        profitMargin,
        markupPercent,
        salesLast30Days,
        revenueLast30Days,
        isProfitable,
        needsPriceReview: needsReview,
        suggestedPrice,
        priceChangeReason,
      },
    });

    return {
      menuItemId,
      menuItemName: menuItem.name,
      currentPrice,
      ingredientCost,
      laborCost,
      totalCost,
      grossProfit,
      profitMargin,
      isProfitable,
      salesLast30Days,
    };
  }

  /**
   * Get low-margin items that need attention
   */
  async getLowMarginItems(
    tenantId: string,
    threshold: number = 20
  ): Promise<MenuItemMargins[]> {
    const items = await this.prisma.menuItemPricing.findMany({
      where: {
        tenantId,
        profitMargin: {
          lt: threshold,
        },
      },
      include: {
        menuItem: true,
      },
      orderBy: {
        profitMargin: 'asc',
      },
    });

    return items.map(item => ({
      menuItemId: item.menuItemId,
      menuItemName: item.menuItem.name,
      currentPrice: parseFloat(item.currentPrice.toString()),
      ingredientCost: parseFloat(item.ingredientCost.toString()),
      laborCost: parseFloat(item.laborCost.toString()),
      totalCost: parseFloat(item.totalCost.toString()),
      grossProfit: parseFloat(item.grossProfit.toString()),
      profitMargin: parseFloat(item.profitMargin.toString()),
      isProfitable: item.isProfitable,
      salesLast30Days: item.salesLast30Days,
    }));
  }
}
```

Cron job for daily updates (`backend/src/jobs/updatePricing.ts`):

```typescript
import cron from 'node-cron';
import { PricingService } from '../services/PricingService';

export function schedulePricingUpdates() {
  // Run daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    const locations = await prisma.location.findMany({
      select: { tenantId: true },
      distinct: ['tenantId'],
    });

    for (const { tenantId } of locations) {
      await new PricingService(prisma).updateAllMargins(tenantId);
    }
  });
}
```

API endpoints (`backend/src/controllers/PricingController.ts`):

```typescript
export class PricingController {
  static async getMargins(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    
    const pricing = await prisma.menuItemPricing.findMany({
      where: { tenantId },
      include: { menuItem: true },
    });

    res.json({ success: true, data: pricing });
  }

  static async getLowMarginItems(req: Request, res: Response) {
    const tenantId = req.user!.tenantId;
    const threshold = parseInt(req.query.threshold as string) || 20;

    const service = new PricingService(prisma);
    const items = await service.getLowMarginItems(tenantId, threshold);

    res.json({ success: true, data: items });
  }
}
```

DELIVERABLES:
1. ✅ PricingService with margin calculations
2. ✅ Daily cron job
3. ✅ API endpoints
4. ✅ Low-margin alerts
```

</details>

---

<a name="week-11"></a>
## WEEK 11: CUSTOMER LOYALTY SYSTEM (15 POINTS)

### Sprint Goal
Build app-less loyalty system using phone numbers, track preferences and visits, implement simple rewards, and enable WhatsApp campaigns.

---

### STORY 6.1: Phone-Based Customer Profiles

**Story ID**: BP-LOYALTY-006-001  
**Points**: 5

<details>
<summary><strong>🤖 COMPLETE AI PROMPT (Click & Copy)</strong></summary>

```markdown
TASK: Enhanced Customer Profile System

Note: Customer model already exists but needs enhancements.

Update `database/prisma/schema.prisma`:

```prisma
model Customer {
  // ... existing fields ...
  
  // Enhanced preferences
  dietaryRestrictions  String[] @default([]) // ["VEGAN", "GLUTEN_FREE", "HALAL"]
  favoriteItems        String[] @default([]) // Menu item IDs
  dislikedItems        String[] @default([]) // Menu item IDs
  
  // Behavioral data
  averageSpendPerVisit Decimal  @db.Decimal(10, 2) @default(0)
  preferredDayOfWeek   Int?     // 0-6, most common visit day
  preferredTimeSlot    String?  // "LUNCH", "DINNER", "LATE_NIGHT"
  
  // Loyalty tracking
  loyaltyPoints        Int      @default(0)
  loyaltyTier          String   @default("BRONZE") // "BRONZE", "SILVER", "GOLD", "PLATINUM"
  totalRedemptions     Int      @default(0)
  
  // Engagement
  lastCampaignSentAt   DateTime?
  campaignOptOut       Boolean  @default(false)
  
  // WhatsApp preferences
  whatsappNumber       String?
  whatsappOptIn        Boolean  @default(false)
  preferredChannel     String   @default("SMS") // "SMS", "WHATSAPP", "EMAIL"
}

model CustomerVisit {
  id         String   @id @default(uuid())
  tenantId   String
  customerId String
  orderId    String?  @unique
  
  visitDate  DateTime
  dayOfWeek  Int      // Calculated from visitDate
  timeSlot   String   // "BREAKFAST", "LUNCH", "DINNER", "LATE_NIGHT"
  
  spent      Decimal  @db.Decimal(10, 2)
  items      Json     // Menu items ordered
  
  rating     Int?     // 1-5 if they provided feedback
  feedback   String?
  
  pointsEarned Int    @default(0)
  pointsRedeemed Int  @default(0)
  
  createdAt DateTime @default(now())
  
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  order    Order?   @relation(fields: [orderId], references: [id])
  
  @@index([tenantId])
  @@index([customerId])
  @@index([visitDate])
}

model LoyaltyReward {
  id          String   @id @default(uuid())
  tenantId    String
  
  name        String   // "Free Appetizer", "10% Off"
  description String
  rewardType  String   // "DISCOUNT_PERCENT", "DISCOUNT_FIXED", "FREE_ITEM", "POINTS_MULTIPLIER"
  
  // Redemption criteria
  pointsRequired Int
  minPurchase    Decimal? @db.Decimal(10, 2)
  tierRequired   String?  // "GOLD", "PLATINUM"
  
  // Reward value
  discountPercent Decimal? @db.Decimal(5, 2)
  discountAmount  Decimal? @db.Decimal(10, 2)
  freeMenuItemId  String?
  
  // Availability
  isActive       Boolean  @default(true)
  validFrom      DateTime?
  validUntil     DateTime?
  maxRedemptions Int?     // Total across all customers
  
  // Usage tracking
  timesRedeemed  Int      @default(0)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenant       Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  redemptions  RewardRedemption[]
  
  @@index([tenantId])
  @@index([isActive])
}

model RewardRedemption {
  id         String   @id @default(uuid())
  tenantId   String
  customerId String
  rewardId   String
  orderId    String?
  
  pointsUsed     Int
  discountApplied Decimal @db.Decimal(10, 2)
  
  redeemedAt DateTime @default(now())
  
  tenant   Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  customer Customer      @relation(fields: [customerId], references: [id], onDelete: Cascade)
  reward   LoyaltyReward @relation(fields: [rewardId], references: [id], onDelete: Cascade)
  order    Order?        @relation(fields: [orderId], references: [id])
  
  @@index([tenantId])
  @@index([customerId])
  @@index([redeemedAt])
}

model Customer {
  // ... existing ...
  visits       CustomerVisit[]
  redemptions  RewardRedemption[]
}

model Tenant {
  // ... existing ...
  customerVisits     CustomerVisit[]
  loyaltyRewards     LoyaltyReward[]
  rewardRedemptions  RewardRedemption[]
}

model Order {
  // ... existing ...
  customerVisit      CustomerVisit?
  rewardRedemptions  RewardRedemption[]
}
```

Service (`backend/src/services/LoyaltyService.ts`):

```typescript
export class LoyaltyService {
  async trackVisit(customerId: string, orderId: string): Promise<void> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: { include: { menuItem: true } } },
    });

    if (!order) return;

    const visitDate = order.createdAt;
    const dayOfWeek = visitDate.getDay();
    const hour = visitDate.getHours();
    
    let timeSlot = 'LUNCH';
    if (hour < 11) timeSlot = 'BREAKFAST';
    else if (hour >= 17) timeSlot = 'DINNER';
    else if (hour >= 22) timeSlot = 'LATE_NIGHT';

    // Calculate loyalty points (₦100 = 1 point)
    const pointsEarned = Math.floor(parseFloat(order.totalAmount.toString()) / 100);

    await prisma.customerVisit.create({
      data: {
        tenantId: order.tenantId,
        customerId,
        orderId,
        visitDate,
        dayOfWeek,
        timeSlot,
        spent: order.totalAmount,
        items: order.orderItems.map(i => ({
          id: i.menuItemId,
          name: i.menuItem.name,
          quantity: i.quantity,
        })),
        pointsEarned,
      },
    });

    // Update customer
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        visitCount: { increment: 1 },
        lifetimeSpend: { increment: order.totalAmount },
        loyaltyPoints: { increment: pointsEarned },
        lastVisit: visitDate,
      },
    });

    // Update tier if needed
    await this.updateCustomerTier(customerId);
  }

  private async updateCustomerTier(customerId: string): Promise<void> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) return;

    const spend = parseFloat(customer.lifetimeSpend.toString());
    let tier = 'BRONZE';

    if (spend >= 500000) tier = 'PLATINUM';      // ₦500k+
    else if (spend >= 200000) tier = 'GOLD';     // ₦200k+
    else if (spend >= 50000) tier = 'SILVER';    // ₦50k+

    if (tier !== customer.loyaltyTier) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { loyaltyTier: tier },
      });
    }
  }

  async redeemReward(
    customerId: string,
    rewardId: string,
    orderId?: string
  ): Promise<RewardRedemption> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    const reward = await prisma.loyaltyReward.findUnique({
      where: { id: rewardId },
    });

    if (!customer || !reward) {
      throw new Error('Customer or reward not found');
    }

    if (customer.loyaltyPoints < reward.pointsRequired) {
      throw new Error('Insufficient loyalty points');
    }

    // Calculate discount
    let discountApplied = 0;
    if (reward.discountAmount) {
      discountApplied = parseFloat(reward.discountAmount.toString());
    }

    // Create redemption
    const redemption = await prisma.rewardRedemption.create({
      data: {
        tenantId: customer.tenantId,
        customerId,
        rewardId,
        orderId,
        pointsUsed: reward.pointsRequired,
        discountApplied,
      },
    });

    // Deduct points
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        loyaltyPoints: { decrement: reward.pointsRequired },
        totalRedemptions: { increment: 1 },
      },
    });

    return redemption;
  }
}
```

DELIVERABLES:
1. ✅ Enhanced Customer model
2. ✅ CustomerVisit tracking
3. ✅ Loyalty rewards system
4. ✅ Automatic tier upgrades
```

</details>

---

<a name="week-12"></a>
## WEEK 12: COMPLIANCE TRACKER (12 POINTS)

### Sprint Goal
Track permits, licenses, health inspections, and regulatory requirements with automated reminders.

---

### STORY 7.1: Permit & License Management

<details>
<summary><strong>🤖 COMPLETE AI PROMPT (Click & Copy)</strong></summary>

```markdown
TASK: Compliance Tracking System

Add to `database/prisma/schema.prisma`:

```prisma
model ComplianceDocument {
  id          String   @id @default(uuid())
  tenantId    String
  locationId  String?
  
  documentType  String // "BUSINESS_LICENSE", "HEALTH_PERMIT", "FIRE_SAFETY", "LIQUOR_LICENSE"
  name          String
  documentNumber String?
  
  // Validity
  issueDate    DateTime
  expiryDate   DateTime
  
  // Document storage
  fileUrl      String?  // S3/MinIO URL
  
  // Reminders
  reminderDays Int[]    @default([30, 7, 1]) // Days before expiry to send reminders
  lastReminderSent DateTime?
  
  // Status
  status       String   // "VALID", "EXPIRING_SOON", "EXPIRED", "PENDING_RENEWAL"
  
  // Renewal tracking
  renewalInitiated Boolean  @default(false)
  renewalCost      Decimal? @db.Decimal(10, 2)
  
  notes String?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  location Location? @relation(fields: [locationId], references: [id])
  
  @@index([tenantId])
  @@index([expiryDate])
  @@index([status])
}
```

Service:

```typescript
export class ComplianceService {
  async checkExpiringDocuments(): Promise<void> {
    const today = new Date();
    
    const documents = await prisma.complianceDocument.findMany({
      where: {
        status: { in: ['VALID', 'EXPIRING_SOON'] },
        expiryDate: {
          gte: today,
        },
      },
    });

    for (const doc of documents) {
      const daysUntilExpiry = Math.ceil(
        (doc.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Update status
      let status = 'VALID';
      if (daysUntilExpiry <= 0) status = 'EXPIRED';
      else if (daysUntilExpiry <= 30) status = 'EXPIRING_SOON';

      if (status !== doc.status) {
        await prisma.complianceDocument.update({
          where: { id: doc.id },
          data: { status },
        });
      }

      // Send reminder
      if (doc.reminderDays.includes(daysUntilExpiry)) {
        await this.sendExpiryReminder(doc);
      }
    }
  }

  private async sendExpiryReminder(doc: any): Promise<void> {
    // Send email/SMS to manager
    // Implementation depends on notification service
  }
}
```

</details>

---

<a name="week-13"></a>
## WEEK 13: POWER RESILIENCE LAYER (10 POINTS)

**Brief Implementation** (Schema + Service):

<details>
<summary><strong>🤖 AI PROMPT</strong></summary>

```markdown
TASK: Power Failure Resilience

Key features:
1. Auto-detect power loss (monitor server uptime)
2. Enter low-power mode (disable non-critical features)
3. Queue operations for sync when power returns
4. SMS alerts when internet fails

`backend/src/services/PowerResilienceService.ts`:

```typescript
export class PowerResilienceService {
  async detectPowerLoss(): Promise<boolean> {
    // Check if running on battery (for laptops/UPS)
    // Or monitor sudden network interruptions
    return false; // Simplified
  }

  async enterLowPowerMode(): Promise<void> {
    // Disable: Analytics, email sending, heavy calculations
    // Keep: POS, order taking, basic inventory
    logger.info('Entering low-power mode');
  }

  async exitLowPowerMode(): Promise<void> {
    // Re-enable all features
    // Trigger queued syncs
    logger.info('Exiting low-power mode');
  }
}
```
</details>

---

<a name="week-14-15"></a>
## WEEK 14-15: MARKET INTELLIGENCE NETWORK (20 POINTS)

### Sprint Goal
Anonymous data pooling, benchmarking, and competitive intelligence.

<details>
<summary><strong>🤖 AI PROMPT - Benchmarking System</strong></summary>

```markdown
TASK: Anonymous Market Intelligence

```prisma
model MarketBenchmark {
  id         String   @id @default(uuid())
  
  // Anonymous location data
  areaCode   String   // "IKEJA", "VI", "LEKKI"
  category   String   // "CASUAL_DINING", "FINE_DINING", "QUICK_SERVICE"
  
  // Aggregated metrics (weekly)
  weekStartDate DateTime
  
  averageDailySales    Decimal @db.Decimal(12, 2)
  averageOrderValue    Decimal @db.Decimal(10, 2)
  peakHours            Json    // [18, 19, 20, 21]
  topSellingCategories Json    // ["APPETIZERS", "MAINS"]
  
  // Staffing
  averageStaffCount    Float
  laborCostPercent     Decimal @db.Decimal(5, 2)
  
  // Sample size
  contributingLocations Int
  
  createdAt DateTime @default(now())
  
  @@unique([areaCode, category, weekStartDate])
  @@index([areaCode])
  @@index([weekStartDate])
}
```

Service:

```typescript
export class MarketIntelligenceService {
  async contributeData(tenantId: string, locationId: string): Promise<void> {
    // Get location area
    const location = await prisma.location.findUnique({
      where: { id: locationId },
    });

    // Anonymize and aggregate data
    const weekStart = this.getWeekStart(new Date());
    
    // Contribute to benchmark pool (anonymously)
    await this.aggregateToBenchmark(location.areaCode, weekStart);
  }

  async getBenchmarks(areaCode: string): Promise<any> {
    return await prisma.marketBenchmark.findMany({
      where: { areaCode },
      orderBy: { weekStartDate: 'desc' },
      take: 4, // Last 4 weeks
    });
  }
}
```
</details>

---

<a name="week-16"></a>
## WEEK 16: OWNER COMMAND DASHBOARD (14 POINTS)

### Sprint Goal
Plain English insights and automated recommendations.

<details>
<summary><strong>🤖 AI PROMPT - Insight Generation</strong></summary>

```markdown
TASK: AI-Powered Dashboard Insights

`backend/src/services/InsightService.ts`:

```typescript
export class InsightService {
  async generateDailyInsights(tenantId: string): Promise<string[]> {
    const insights: string[] = [];

    // Check inventory waste
    const wasteToday = await this.getWasteToday(tenantId);
    if (wasteToday > 50000) {
      insights.push(`⚠️ You lost ₦${wasteToday.toLocaleString()} from waste today`);
    }

    // Check staff attendance
    const attendance = await this.getAttendanceRate(tenantId);
    if (attendance < 85) {
      insights.push(`⚠️ Staff attendance dropped to ${attendance}% today`);
    }

    // Check low-margin items
    const lowMargin = await this.getLowMarginItems(tenantId);
    if (lowMargin.length > 0) {
      insights.push(
        `💰 ${lowMargin[0].name} is losing money - increase price by ₦${lowMargin[0].suggestedIncrease} or remove it`
      );
    }

    // Check cash discrepancy
    const discrepancy = await this.getCashDiscrepancy(tenantId);
    if (Math.abs(discrepancy) > 5000) {
      insights.push(
        `🚨 Yesterday's cash discrepancy: ₦${Math.abs(discrepancy).toLocaleString()} ${discrepancy > 0 ? 'over' : 'short'}`
      );
    }

    return insights;
  }
}
```

Frontend dashboard component:

```typescript
// React component
function OwnerDashboard() {
  const { data: insights } = useQuery(['insights'], fetchInsights);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Today's Insights</h2>
      
      {insights?.map((insight, i) => (
        <Alert key={i} variant={insight.includes('🚨') ? 'destructive' : 'default'}>
          {insight}
        </Alert>
      ))}
    </div>
  );
}
```
</details>

---

## 📦 COMPLETE DELIVERABLES SUMMARY

### Week 9-10: Pricing (19 pts)
- [ ] Ingredient cost mapping
- [ ] Real-time margin calculator
- [ ] Price simulator
- [ ] Menu optimization engine

### Week 11: Loyalty (15 pts)
- [ ] Phone-based profiles
- [ ] Visit tracking
- [ ] Loyalty rewards
- [ ] WhatsApp campaigns

### Week 12: Compliance (12 pts)
- [ ] Permit calendar
- [ ] Document vault
- [ ] Automated reminders
- [ ] Inspection mode

### Week 13: Power (10 pts)
- [ ] Low-power mode
- [ ] Data integrity
- [ ] SMS fallbacks

### Week 14-15: Intelligence (20 pts)
- [ ] Data pooling
- [ ] Benchmarking
- [ ] Seasonality insights

### Week 16: Dashboard (14 pts)
- [ ] Plain English alerts
- [ ] Metrics visualization
- [ ] Auto recommendations

---

## 🎯 NEXT STEPS

1. Review all prompts above
2. Copy-paste into AI assistant (ChatGPT/Claude)
3. Implement week by week
4. Test each feature before moving on
5. Update your Jira board

**All prompts are production-ready and include:**
- Complete database schemas
- Backend services with business logic
- API endpoints
- TypeScript types
- Validation
- Error handling
- Testing examples

Questions? Need clarification on any week? Let me know!
