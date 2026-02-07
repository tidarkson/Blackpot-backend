# 🍳 BlackPot Phase 2 - Week 7-8: Inventory & Waste Intelligence
## Complete Implementation Guide with AI Prompts

**Duration**: 2 weeks  
**Story Points**: 22  
**Priority**: High  
**Dependencies**: Weeks 1-6 completed

---

## 📊 Sprint Overview

### Sprint Goal
Build intelligent inventory system that automatically deducts ingredients when dishes are sold, tracks waste with reasons, predicts stockouts before they happen, and rates supplier reliability.

### Features Breakdown
1. **Usage-Based Inventory Deduction** - Auto-deduct when menu items sold (6 pts)
2. **Spoilage & Waste Logging** - Track waste with categorized reasons (5 pts)
3. **Predictive Low-Stock Alerts** - Smart alerts based on sales velocity (5 pts)
4. **Supplier Reliability Rating** - Track late deliveries, price changes (4 pts)
5. **Offline Stock Checks** - Update inventory without internet (2 pts)

---

## 🎯 STORY 4.1: Usage-Based Inventory Deduction

**Story ID**: BP-INV-004-001  
**Story Points**: 6  
**Priority**: Critical  
**Estimate**: 8-10 hours

### User Story
**As a** restaurant owner  
**I want** automatic ingredient deduction when dishes are sold  
**So that** I have accurate inventory without manual counting

### Acceptance Criteria
- [ ] Each menu item has recipe with ingredient quantities
- [ ] When order completed, ingredients auto-deducted
- [ ] System handles partial stock (can't oversell)
- [ ] Batch operations for multiple orders
- [ ] Audit trail of all inventory movements
- [ ] Manager can view deduction history per dish

---

### 📋 TASK 4.1.1: Recipe Mapping Database Schema

**Component**: Database  
**Estimate**: 2-3 hours  
**Story Points**: 2

<details>
<summary><strong>🤖 COMPLETE AI PROMPT (Click to Expand & Copy)</strong></summary>

```markdown
SYSTEM CONTEXT:
BlackPot restaurant POS with existing models: MenuItem, InventoryItem, Order, OrderItem

TASK: Design Recipe-to-Inventory Mapping Schema

Create database models for:
1. Recipes (which ingredients make which dishes)
2. Recipe ingredients (quantities needed)
3. Inventory movements (audit trail)
4. Stock alerts

IMPLEMENTATION:

Add to `database/prisma/schema.prisma`:

```prisma
// RECIPE & INVENTORY MAPPING

model Recipe {
  id          String   @id @default(uuid())
  tenantId    String
  menuItemId  String   @unique // One recipe per menu item
  
  name        String
  description String?
  
  // Yield information
  servings    Int      @default(1) // How many portions this recipe makes
  prepTime    Int?     // Minutes
  cookTime    Int?     // Minutes
  
  // Cost calculation
  totalCost       Decimal @db.Decimal(10, 2) // Sum of all ingredients
  costPerServing  Decimal @db.Decimal(10, 2) // Total cost / servings
  
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  tenant      Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  menuItem    MenuItem         @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  ingredients RecipeIngredient[]
  
  @@index([tenantId])
  @@index([menuItemId])
}

model RecipeIngredient {
  id              String   @id @default(uuid())
  recipeId        String
  inventoryItemId String
  
  // Quantity needed for recipe
  quantity        Decimal  @db.Decimal(10, 3) // Can be fractional (0.5 kg)
  unit            String   // "kg", "g", "L", "ml", "pcs"
  
  // Cost tracking
  costPerUnit     Decimal  @db.Decimal(10, 2)
  totalCost       Decimal  @db.Decimal(10, 2) // quantity * costPerUnit
  
  // Alternatives
  isOptional      Boolean  @default(false)
  alternativeFor  String?  // ID of ingredient this can replace
  
  notes           String?  // "Can substitute with chicken stock"
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  recipe        Recipe        @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  inventoryItem InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
  
  @@unique([recipeId, inventoryItemId])
  @@index([recipeId])
  @@index([inventoryItemId])
}

model InventoryMovement {
  id              String          @id @default(uuid())
  tenantId        String
  inventoryItemId String
  
  // Movement details
  movementType    MovementType
  quantity        Decimal         @db.Decimal(10, 3)
  unit            String
  
  // Reference
  referenceType   String?         // "ORDER", "ADJUSTMENT", "WASTE", "DELIVERY"
  referenceId     String?         // Order ID, Adjustment ID, etc.
  
  // Before/After
  quantityBefore  Decimal         @db.Decimal(10, 3)
  quantityAfter   Decimal         @db.Decimal(10, 3)
  
  // Cost impact
  costImpact      Decimal         @db.Decimal(10, 2)
  
  // Who/When
  performedById   String
  performedAt     DateTime        @default(now())
  
  notes           String?
  
  createdAt   DateTime @default(now())
  
  tenant        Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  inventoryItem InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
  performedBy   User          @relation(fields: [performedById], references: [id])
  
  @@index([tenantId])
  @@index([inventoryItemId])
  @@index([movementType])
  @@index([performedAt])
  @@index([referenceType, referenceId])
}

model StockAlert {
  id              String      @id @default(uuid())
  tenantId        String
  inventoryItemId String
  
  alertType       AlertType
  severity        AlertSeverity @default(WARNING)
  
  message         String      // "Tomatoes running low - 2kg left"
  
  // Thresholds
  currentStock    Decimal     @db.Decimal(10, 3)
  threshold       Decimal     @db.Decimal(10, 3)
  
  // Predictions
  estimatedRunout DateTime?   // When we'll run out at current rate
  daysUntilRunout Int?
  
  // Status
  isActive        Boolean     @default(true)
  acknowledgedBy  String?
  acknowledgedAt  DateTime?
  resolvedAt      DateTime?
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  tenant          Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  inventoryItem   InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
  acknowledgedByUser User?      @relation(fields: [acknowledgedBy], references: [id])
  
  @@index([tenantId])
  @@index([inventoryItemId])
  @@index([alertType])
  @@index([isActive])
  @@index([severity])
}

enum MovementType {
  DEDUCTION     // Used in recipe
  ADDITION      // Received from supplier
  ADJUSTMENT    // Manual correction
  WASTE         // Spoilage/damage
  TRANSFER      // Moved to another location
}

enum AlertType {
  LOW_STOCK
  OUT_OF_STOCK
  NEAR_EXPIRY
  EXPIRED
  OVERSTOCK
}

enum AlertSeverity {
  INFO
  WARNING
  CRITICAL
}

// Update existing models
model Tenant {
  // ... existing ...
  recipes            Recipe[]
  inventoryMovements InventoryMovement[]
  stockAlerts        StockAlert[]
}

model MenuItem {
  // ... existing ...
  recipe Recipe?
}

model InventoryItem {
  // ... existing ...
  recipeIngredients  RecipeIngredient[]
  movements          InventoryMovement[]
  alerts             StockAlert[]
}

model User {
  // ... existing ...
  inventoryMovements InventoryMovement[]
  acknowledgedAlerts StockAlert[]
}
```

TypeScript types (`backend/src/types/inventory.ts`):

```typescript
import { MovementType, AlertType, AlertSeverity } from '@prisma/client';

export interface RecipeInput {
  menuItemId: string;
  name: string;
  servings: number;
  prepTime?: number;
  cookTime?: number;
  ingredients: RecipeIngredientInput[];
}

export interface RecipeIngredientInput {
  inventoryItemId: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  isOptional?: boolean;
}

export interface InventoryDeductionRequest {
  orderId: string;
  orderItems: Array<{
    menuItemId: string;
    quantity: number;
  }>;
}

export interface InventoryMovementInput {
  inventoryItemId: string;
  movementType: MovementType;
  quantity: number;
  unit: string;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
}

export interface StockAlertConfig {
  lowStockThreshold: number;      // e.g., 10kg
  criticalStockThreshold: number; // e.g., 2kg
  daysBeforeExpiry: number;       // e.g., 3 days
}
```

Seed data (`database/seeds/inventory-seeds.ts`):

```typescript
import { PrismaClient } from '@prisma/client';

export async function seedInventoryRecipes(
  prisma: PrismaClient,
  tenantId: string
) {
  // Assume we have menu items and inventory items already
  
  // Example: Jollof Rice recipe
  const jollofMenuItem = await prisma.menuItem.findFirst({
    where: { name: { contains: 'Jollof Rice' } },
  });
  
  if (!jollofMenuItem) return;
  
  const rice = await prisma.inventoryItem.findFirst({
    where: { name: { contains: 'Rice' } },
  });
  
  const tomatoes = await prisma.inventoryItem.findFirst({
    where: { name: { contains: 'Tomatoes' } },
  });
  
  if (!rice || !tomatoes) return;
  
  await prisma.recipe.create({
    data: {
      tenantId,
      menuItemId: jollofMenuItem.id,
      name: 'Classic Jollof Rice',
      servings: 1,
      prepTime: 15,
      cookTime: 45,
      totalCost: 800, // ₦800
      costPerServing: 800,
      ingredients: {
        create: [
          {
            inventoryItemId: rice.id,
            quantity: 0.2, // 200g
            unit: 'kg',
            costPerUnit: 1500, // ₦1500/kg
            totalCost: 300, // 0.2 * 1500
          },
          {
            inventoryItemId: tomatoes.id,
            quantity: 0.15, // 150g
            unit: 'kg',
            costPerUnit: 2000,
            totalCost: 300,
          },
        ],
      },
    },
  });
  
  console.log('✅ Inventory recipes seeded');
}
```

Run migration:
```bash
npx prisma migrate dev --name add_recipe_inventory_mapping
npx prisma generate
npm run db:seed
```

DELIVERABLES:
1. ✅ Recipe and RecipeIngredient models
2. ✅ InventoryMovement audit trail model
3. ✅ StockAlert model with severity levels
4. ✅ TypeScript types
5. ✅ Seed data with sample recipe

VALIDATION:
- Recipe can have multiple ingredients
- Each ingredient references existing InventoryItem
- Movement audit trail tracks before/after quantities
- Alerts have severity levels

</details>

---

### 📋 TASK 4.1.2: Auto-Deduction Service

**Component**: Backend Service  
**Estimate**: 4-5 hours  
**Story Points**: 4

<details>
<summary><strong>🤖 COMPLETE AI PROMPT (Click to Expand & Copy)</strong></summary>

CONTEXT:
Database schema from Task 4.1.1 is complete.

TASK: Build Automatic Inventory Deduction Service

Create service that:
1. Deducts ingredients when order completed
2. Handles insufficient stock scenarios
3. Creates audit trail
4. Triggers alerts when low
5. Calculates actual food cost per order

IMPLEMENTATION:

`backend/src/services/InventoryDeductionService.ts`:

```typescript
import { PrismaClient, Prisma } from '@prisma/client';
import logger from '../config/logger';
import { InventoryDeductionRequest } from '../types/inventory';

export class InventoryDeductionService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Deduct ingredients for completed order
   * Called when order status changes to COMPLETED/PAID
   */
  async deductForOrder(
    tenantId: string,
    orderId: string,
    performedById: string
  ): Promise<{
    success: boolean;
    deductions: any[];
    warnings: string[];
  }> {
    logger.info(`Processing inventory deduction for order ${orderId}`);

    const warnings: string[] = [];

    // Get order with items
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            menuItem: {
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
            },
          },
        },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if already deducted
    const existingDeduction = await this.prisma.inventoryMovement.findFirst({
      where: {
        referenceType: 'ORDER',
        referenceId: orderId,
        movementType: 'DEDUCTION',
      },
    });

    if (existingDeduction) {
      logger.warn(`Order ${orderId} already has inventory deduction`);
      return {
        success: false,
        deductions: [],
        warnings: ['Inventory already deducted for this order'],
      };
    }

    const deductions: any[] = [];

    // Process each order item
    for (const orderItem of order.orderItems) {
      const recipe = orderItem.menuItem.recipe;

      if (!recipe) {
        warnings.push(
          `Menu item "${orderItem.menuItem.name}" has no recipe - skipping deduction`
        );
        continue;
      }

      // Deduct each ingredient
      for (const recipeIngredient of recipe.ingredients) {
        const requiredQuantity =
          parseFloat(recipeIngredient.quantity.toString()) * orderItem.quantity;

        // Check current stock
        const inventoryItem = recipeIngredient.inventoryItem;
        const currentStock = parseFloat(inventoryItem.currentQuantity.toString());

        if (currentStock < requiredQuantity) {
          warnings.push(
            `Insufficient stock for ${inventoryItem.name}: need ${requiredQuantity}${recipeIngredient.unit}, have ${currentStock}${recipeIngredient.unit}`
          );
          // Still deduct what we have
        }

        const deductQuantity = Math.min(currentStock, requiredQuantity);

        // Create movement record
        const movement = await this.prisma.inventoryMovement.create({
          data: {
            tenantId,
            inventoryItemId: inventoryItem.id,
            movementType: 'DEDUCTION',
            quantity: deductQuantity,
            unit: recipeIngredient.unit,
            referenceType: 'ORDER',
            referenceId: orderId,
            quantityBefore: currentStock,
            quantityAfter: currentStock - deductQuantity,
            costImpact: parseFloat(recipeIngredient.totalCost.toString()) * orderItem.quantity,
            performedById,
            notes: `Auto-deduction for order #${order.orderNumber}`,
          },
        });

        // Update inventory item stock
        await this.prisma.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: {
            currentQuantity: currentStock - deductQuantity,
            lastUpdated: new Date(),
          },
        });

        deductions.push(movement);

        // Check if we should trigger low stock alert
        await this.checkStockLevels(tenantId, inventoryItem.id);
      }
    }

    logger.info(`Deducted ${deductions.length} ingredients for order ${orderId}`);

    return {
      success: true,
      deductions,
      warnings,
    };
  }

  /**
   * Check stock levels and create alerts if needed
   */
  private async checkStockLevels(
    tenantId: string,
    inventoryItemId: string
  ): Promise<void> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
    });

    if (!item) return;

    const currentStock = parseFloat(item.currentQuantity.toString());
    const minStock = parseFloat(item.minQuantity?.toString() || '0');
    const reorderPoint = parseFloat(item.reorderPoint?.toString() || '0');

    // Check if out of stock
    if (currentStock <= 0) {
      await this.createAlert(
        tenantId,
        inventoryItemId,
        'OUT_OF_STOCK',
        'CRITICAL',
        `${item.name} is out of stock`,
        currentStock,
        0
      );
      return;
    }

    // Check if low stock
    if (currentStock <= reorderPoint) {
      await this.createAlert(
        tenantId,
        inventoryItemId,
        'LOW_STOCK',
        currentStock <= minStock ? 'CRITICAL' : 'WARNING',
        `${item.name} is running low - ${currentStock}${item.unit} remaining`,
        currentStock,
        reorderPoint
      );
    }
  }

  /**
   * Create stock alert
   */
  private async createAlert(
    tenantId: string,
    inventoryItemId: string,
    alertType: any,
    severity: any,
    message: string,
    currentStock: number,
    threshold: number
  ): Promise<void> {
    // Check if similar alert already exists and is active
    const existingAlert = await this.prisma.stockAlert.findFirst({
      where: {
        tenantId,
        inventoryItemId,
        alertType,
        isActive: true,
      },
    });

    if (existingAlert) {
      // Update existing alert
      await this.prisma.stockAlert.update({
        where: { id: existingAlert.id },
        data: {
          message,
          currentStock,
          severity,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new alert
      await this.prisma.stockAlert.create({
        data: {
          tenantId,
          inventoryItemId,
          alertType,
          severity,
          message,
          currentStock,
          threshold,
        },
      });
    }
  }

  /**
   * Calculate actual food cost for order
   */
  async calculateOrderFoodCost(orderId: string): Promise<number> {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        referenceType: 'ORDER',
        referenceId: orderId,
        movementType: 'DEDUCTION',
      },
    });

    return movements.reduce(
      (total, movement) => total + parseFloat(movement.costImpact.toString()),
      0
    );
  }

  /**
   * Get deduction history for menu item
   */
  async getDeductionHistory(
    tenantId: string,
    menuItemId: string,
    days: number = 30
  ): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        tenantId,
        movementType: 'DEDUCTION',
        performedAt: {
          gte: startDate,
        },
      },
      include: {
        inventoryItem: true,
        performedBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        performedAt: 'desc',
      },
    });

    return movements;
  }
}
```

Integrate with order completion (`backend/src/services/OrderService.ts`):

```typescript
// Add to existing OrderService

import { InventoryDeductionService } from './InventoryDeductionService';

export class OrderService {
  private deductionService: InventoryDeductionService;

  constructor(private prisma: PrismaClient) {
    this.deductionService = new InventoryDeductionService(prisma);
  }

  /**
   * Complete order (existing method - add deduction)
   */
  async completeOrder(
    orderId: string,
    staffId: string
  ): Promise<Order> {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // AUTO-DEDUCT INVENTORY
    try {
      const result = await this.deductionService.deductForOrder(
        order.tenantId,
        orderId,
        staffId
      );

      if (result.warnings.length > 0) {
        logger.warn('Inventory deduction warnings:', result.warnings);
        // Could send notification to manager
      }
    } catch (error) {
      logger.error('Error deducting inventory:', error);
      // Don't fail order completion if inventory fails
    }

    return order;
  }
}
```

API endpoints (`backend/src/controllers/InventoryController.ts`):

```typescript
export class InventoryController {
  /**
   * POST /api/inventory/deduct
   * Manually trigger deduction (for fixing mistakes)
   */
  static async manualDeduct(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user!.tenantId;
      const { orderId } = req.body;
      const staffId = req.user!.id;

      const service = new InventoryDeductionService(prisma);
      const result = await service.deductForOrder(tenantId, orderId, staffId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventory/food-cost/:orderId
   * Get actual food cost for order
   */
  static async getOrderFoodCost(req: Request, res: Response, next: NextFunction) {
    try {
      const { orderId } = req.params;

      const service = new InventoryDeductionService(prisma);
      const foodCost = await service.calculateOrderFoodCost(orderId);

      res.json({
        success: true,
        data: { orderId, foodCost },
      });
    } catch (error) {
      next(error);
    }
  }
}
```

DELIVERABLES:
1. ✅ InventoryDeductionService
2. ✅ Integration with OrderService
3. ✅ Alert creation on low stock
4. ✅ Food cost calculation
5. ✅ API endpoints

LOGIC:
- Triggered automatically when order completed
- Deducts each ingredient from recipe
- Handles partial stock (deducts what's available)
- Creates audit trail in InventoryMovement
- Triggers alerts at reorder point
- Calculates actual food cost

CONSTRAINTS:
- Prevents double deduction (checks for existing)
- Handles orders without recipes gracefully
- Logs warnings for insufficient stock
- Don't fail order if deduction fails
```

</details>

---

[CONTINUING WITH REMAINING INVENTORY TASKS...]

Due to length constraints, I'm creating modular files. Let me continue with the complete set of all weeks.
