import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class InventoryService {
  /**
   * Get all inventory items for a tenant with optional filtering
   */
  async getInventoryItems(
    tenantId: string,
    filters?: {
      category?: string;
      supplierId?: string;
      searchTerm?: string;
      onlyLowStock?: boolean;
    }
  ) {
    try {
      const where: Prisma.InventoryItemWhereInput = {
        tenantId,
      };

      if (filters?.category) {
        where.category = filters.category;
      }

      if (filters?.supplierId) {
        where.supplierId = filters.supplierId;
      }

      if (filters?.searchTerm) {
        where.name = {
          contains: filters.searchTerm,
          mode: 'insensitive',
        };
      }

      const items = await prisma.inventoryItem.findMany({
        where,
        include: {
          supplier: true,
          movements: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          wineDetail: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Filter by low stock if requested
      if (filters?.onlyLowStock) {
        return items.filter((item) => item.currentStock.lte(item.minStock));
      }

      return items;
    } catch (error: any) {
      logger.error('Error fetching inventory items:', error.message);
      throw error;
    }
  }

  /**
   * Get a specific inventory item by ID
   */
  async getInventoryItemById(itemId: string, tenantId: string) {
    try {
      const item = await prisma.inventoryItem.findFirst({
        where: {
          id: itemId,
          tenantId,
        },
        include: {
          supplier: true,
          movements: {
            orderBy: { createdAt: 'desc' },
          },
          wineDetail: true,
        },
      });

      if (!item) {
        throw new Error('Inventory item not found');
      }

      return item;
    } catch (error: any) {
      logger.error('Error fetching inventory item:', error.message);
      throw error;
    }
  }

  /**
   * Create a new inventory item
   */
  async createInventoryItem(
    tenantId: string,
    data: {
      name: string;
      category: string;
      unit: string;
      currentStock: number;
      minStock: number;
      unitCost: number;
      supplierId?: string;
      metadata?: Record<string, any>;
    }
  ) {
    try {
      // Validate supplier exists if provided
      if (data.supplierId) {
        const supplier = await prisma.supplier.findFirst({
          where: {
            id: data.supplierId,
            tenantId,
          },
        });

        if (!supplier) {
          throw new Error('Supplier not found');
        }
      }

      const item = await prisma.inventoryItem.create({
        data: {
          tenantId,
          name: data.name,
          category: data.category,
          unit: data.unit,
          currentStock: new Decimal(data.currentStock),
          minStock: new Decimal(data.minStock),
          unitCost: new Decimal(data.unitCost),
          supplierId: data.supplierId,
          metadata: data.metadata,
        },
        include: {
          supplier: true,
          movements: true,
          wineDetail: true,
        },
      });

      logger.info(`✅ Inventory item created: ${item.name} (${item.id})`);
      return item;
    } catch (error: any) {
      logger.error('Error creating inventory item:', error.message);
      throw error;
    }
  }

  /**
   * Update an inventory item
   */
  async updateInventoryItem(
    itemId: string,
    tenantId: string,
    data: {
      name?: string;
      category?: string;
      unit?: string;
      minStock?: number;
      unitCost?: number;
      supplierId?: string | null;
      metadata?: Record<string, any>;
    }
  ) {
    try {
      const item = await this.getInventoryItemById(itemId, tenantId);

      // Validate supplier if changing
      if (data.supplierId && data.supplierId !== item.supplierId) {
        const supplier = await prisma.supplier.findFirst({
          where: {
            id: data.supplierId,
            tenantId,
          },
        });

        if (!supplier) {
          throw new Error('Supplier not found');
        }
      }

      const updatedItem = await prisma.inventoryItem.update({
        where: { id: itemId },
        data: {
          name: data.name || item.name,
          category: data.category || item.category,
          unit: data.unit || item.unit,
          minStock: data.minStock ? new Decimal(data.minStock) : item.minStock,
          unitCost: data.unitCost ? new Decimal(data.unitCost) : item.unitCost,
          supplierId: data.supplierId ?? item.supplierId,
          metadata: (data.metadata ?? item.metadata) as any,
        },
        include: {
          supplier: true,
          movements: true,
          wineDetail: true,
        },
      });

      logger.info(`✅ Inventory item updated: ${updatedItem.name}`);
      return updatedItem;
    } catch (error: any) {
      logger.error('Error updating inventory item:', error.message);
      throw error;
    }
  }

  /**
   * Delete an inventory item
   */
  async deleteInventoryItem(itemId: string, tenantId: string) {
    try {
      const item = await this.getInventoryItemById(itemId, tenantId);

      // Check if item has stock movements - can't delete if it does (audit trail)
      const movementCount = await prisma.stockMovement.count({
        where: {
          inventoryItemId: itemId,
        },
      });

      if (movementCount > 0) {
        throw new Error('Cannot delete inventory item with existing stock movements. Consider archiving instead.');
      }

      await prisma.inventoryItem.delete({
        where: { id: itemId },
      });

      logger.info(`✅ Inventory item deleted: ${item.name}`);
      return { success: true, message: 'Inventory item deleted successfully' };
    } catch (error: any) {
      logger.error('Error deleting inventory item:', error.message);
      throw error;
    }
  }

  /**
   * Adjust stock quantity (add or remove)
   */
  async adjustStock(
    itemId: string,
    tenantId: string,
    adjustment: {
      quantity: number;
      movementType: 'purchase' | 'sale' | 'waste' | 'adjustment';
      reason: string;
      performedBy: string; // userId
    }
  ) {
    try {
      const item = await this.getInventoryItemById(itemId, tenantId);

      // Validate adjustment
      if (adjustment.quantity === 0) {
        throw new Error('Adjustment quantity cannot be zero');
      }

      // Validate movement type
      const validTypes = ['purchase', 'sale', 'waste', 'adjustment'];
      if (!validTypes.includes(adjustment.movementType)) {
        throw new Error(`Invalid movement type. Must be one of: ${validTypes.join(', ')}`);
      }

      // For sale/waste, ensure we don't go negative
      if (['sale', 'waste'].includes(adjustment.movementType)) {
        const newStock = item.currentStock.plus(adjustment.quantity); // quantity is negative for these
        if (newStock.lessThan(0)) {
          throw new Error(
            `Insufficient stock. Current: ${item.currentStock}, Requested: ${Math.abs(adjustment.quantity)}`
          );
        }
      }

      // Update stock in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update item stock
        const updatedItem = await tx.inventoryItem.update({
          where: { id: itemId },
          data: {
            currentStock: item.currentStock.plus(adjustment.quantity),
          },
          include: {
            supplier: true,
            movements: true,
            wineDetail: true,
          },
        });

        // Create movement record for audit trail
        const movement = await tx.stockMovement.create({
          data: {
            tenantId,
            inventoryItemId: itemId,
            type: adjustment.movementType,
            quantity: new Decimal(Math.abs(adjustment.quantity)),
            reason: adjustment.reason,
            performedBy: adjustment.performedBy,
          },
        });

        logger.info(
          `📦 Stock adjusted for ${item.name}: ${adjustment.movementType} of ${adjustment.quantity} (Reason: ${adjustment.reason})`
        );

        return { item: updatedItem, movement };
      });

      return result;
    } catch (error: any) {
      logger.error('Error adjusting stock:', error.message);
      throw error;
    }
  }

  /**
   * Get stock movement history for an item
   */
  async getStockMovementHistory(itemId: string, tenantId: string, limit: number = 50) {
    try {
      // Ensure item belongs to tenant
      await this.getInventoryItemById(itemId, tenantId);

      const movements = await prisma.stockMovement.findMany({
        where: {
          inventoryItemId: itemId,
          tenantId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        include: {
          item: true,
        },
      });

      return movements;
    } catch (error: any) {
      logger.error('Error fetching stock movement history:', error.message);
      throw error;
    }
  }

  /**
   * Get all items below minimum stock threshold
   */
  async getLowStockItems(tenantId: string) {
    try {
      const lowStockItems = await prisma.inventoryItem.findMany({
        where: {
          tenantId,
        },
        include: {
          supplier: true,
          movements: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          wineDetail: true,
        },
        orderBy: {
          currentStock: 'asc',
        },
      });

      // Filter items at or below minimum stock
      return lowStockItems.filter((item) => item.currentStock.lte(item.minStock));
    } catch (error: any) {
      logger.error('Error fetching low stock items:', error.message);
      throw error;
    }
  }

  /**
   * Get all suppliers for a tenant
   */
  async getSuppliers(tenantId: string) {
    try {
      const suppliers = await prisma.supplier.findMany({
        where: {
          tenantId,
        },
        include: {
          inventoryItems: {
            select: {
              id: true,
              name: true,
              currentStock: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return suppliers;
    } catch (error: any) {
      logger.error('Error fetching suppliers:', error.message);
      throw error;
    }
  }

  /**
   * Create a new supplier
   */
  async createSupplier(
    tenantId: string,
    data: {
      name: string;
      contact?: string;
    }
  ) {
    try {
      const supplier = await prisma.supplier.create({
        data: {
          tenantId,
          name: data.name,
          contact: data.contact,
        },
        include: {
          inventoryItems: true,
        },
      });

      logger.info(`✅ Supplier created: ${supplier.name}`);
      return supplier;
    } catch (error: any) {
      logger.error('Error creating supplier:', error.message);
      throw error;
    }
  }

  /**
   * Get all wines (inventory items with wine detail)
   */
  async getWines(tenantId: string) {
    try {
      const wines = await prisma.inventoryItem.findMany({
        where: {
          tenantId,
          wineDetail: {
            isNot: null,
          },
        },
        include: {
          supplier: true,
          wineDetail: true,
          movements: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return wines;
    } catch (error: any) {
      logger.error('Error fetching wines:', error.message);
      throw error;
    }
  }

  /**
   * Add a wine to inventory (creates inventory item + wine detail)
   */
  async addWine(
    tenantId: string,
    data: {
      name: string;
      currentStock: number;
      minStock: number;
      unitCost: number;
      supplierId?: string;
      vintage: string;
      region: string;
      varietal: string;
      binLocation: string;
      tastingNotes?: string;
      pairingNotes?: string;
    }
  ) {
    try {
      // Validate supplier if provided
      if (data.supplierId) {
        const supplier = await prisma.supplier.findFirst({
          where: {
            id: data.supplierId,
            tenantId,
          },
        });

        if (!supplier) {
          throw new Error('Supplier not found');
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        // Create inventory item
        const inventoryItem = await tx.inventoryItem.create({
          data: {
            tenantId,
            name: data.name,
            category: 'wine',
            unit: 'bottle',
            currentStock: new Decimal(data.currentStock),
            minStock: new Decimal(data.minStock),
            unitCost: new Decimal(data.unitCost),
            supplierId: data.supplierId,
          },
        });

        // Create wine detail
        const wineDetail = await tx.wineDetail.create({
          data: {
            inventoryItemId: inventoryItem.id,
            vintage: data.vintage,
            region: data.region,
            varietal: data.varietal,
            binLocation: data.binLocation,
            tastingNotes: data.tastingNotes,
            pairingNotes: data.pairingNotes,
          },
        });

        logger.info(`🍷 Wine added: ${data.name} (${data.vintage}) - Bin ${data.binLocation}`);

        return {
          item: inventoryItem,
          wineDetail,
        };
      });

      return result;
    } catch (error: any) {
      logger.error('Error adding wine:', error.message);
      throw error;
    }
  }

  /**
   * Update wine details
   */
  async updateWine(
    wineItemId: string,
    tenantId: string,
    data: {
      name?: string;
      currentStock?: number;
      minStock?: number;
      unitCost?: number;
      supplierId?: string | null;
      vintage?: string;
      region?: string;
      varietal?: string;
      binLocation?: string;
      tastingNotes?: string;
      pairingNotes?: string;
    }
  ) {
    try {
      const wine = await this.getInventoryItemById(wineItemId, tenantId);

      if (!wine.wineDetail) {
        throw new Error('Item is not a wine');
      }

      const result = await prisma.$transaction(async (tx) => {
        // Update inventory item
        const updatedItem = await tx.inventoryItem.update({
          where: { id: wineItemId },
          data: {
            name: data.name || wine.name,
            minStock: data.minStock ? new Decimal(data.minStock) : wine.minStock,
            unitCost: data.unitCost ? new Decimal(data.unitCost) : wine.unitCost,
            supplierId: data.supplierId ?? wine.supplierId,
          },
        });

        // Update wine detail
        const updatedWineDetail = await tx.wineDetail.update({
          where: { inventoryItemId: wineItemId },
          data: {
            vintage: data.vintage || wine.wineDetail?.vintage,
            region: data.region || wine.wineDetail?.region,
            varietal: data.varietal || wine.wineDetail?.varietal,
            binLocation: data.binLocation || wine.wineDetail?.binLocation,
            tastingNotes: data.tastingNotes || wine.wineDetail?.tastingNotes,
            pairingNotes: data.pairingNotes || wine.wineDetail?.pairingNotes,
          },
        });

        logger.info(`🍷 Wine updated: ${updatedItem.name}`);

        return { item: updatedItem, wineDetail: updatedWineDetail };
      });

      return result;
    } catch (error: any) {
      logger.error('Error updating wine:', error.message);
      throw error;
    }
  }

  /**
   * Get wine pairing suggestions based on main course item
   * This matches wines with dishes based on pairingNotes
   */
  async getWinePairings(tenantId: string, mainCourseCategory?: string) {
    try {
      const wines = await prisma.inventoryItem.findMany({
        where: {
          tenantId,
          wineDetail: {
            isNot: null,
          },
        },
        include: {
          wineDetail: true,
          supplier: true,
        },
      });

      // If no category specified, return all wines with pairing notes
      if (!mainCourseCategory) {
        return wines
          .filter((wine) => wine.wineDetail?.pairingNotes)
          .map((wine) => ({
            wine: wine,
            pairingNotes: wine.wineDetail?.pairingNotes,
            available: wine.currentStock.greaterThan(0),
          }));
      }

      // Return wines that match the category in pairing notes
      const matchedWines = wines
        .filter((wine) => {
          const pairingNotes = wine.wineDetail?.pairingNotes?.toLowerCase() || '';
          return pairingNotes.includes(mainCourseCategory.toLowerCase());
        })
        .map((wine) => ({
          wine: wine,
          pairingNotes: wine.wineDetail?.pairingNotes,
          available: wine.currentStock.greaterThan(0),
        }));

      return matchedWines;
    } catch (error: any) {
      logger.error('Error getting wine pairings:', error.message);
      throw error;
    }
  }

  /**
   * Get inventory categories
   */
  async getCategories(tenantId: string) {
    try {
      const categories = await prisma.inventoryItem.findMany({
        where: {
          tenantId,
        },
        distinct: ['category'],
        select: {
          category: true,
        },
      });

      return categories.map((cat) => cat.category);
    } catch (error: any) {
      logger.error('Error fetching categories:', error.message);
      throw error;
    }
  }

  /**
   * Calculate inventory valuation
   */
  async calculateInventoryValuation(tenantId: string) {
    try {
      const items = await prisma.inventoryItem.findMany({
        where: {
          tenantId,
        },
      });

      let totalValue = new Decimal(0);
      const valuationByCategory: Record<string, Decimal> = {};

      items.forEach((item) => {
        const itemValue = item.currentStock.times(item.unitCost);
        totalValue = totalValue.plus(itemValue);

        if (!valuationByCategory[item.category]) {
          valuationByCategory[item.category] = new Decimal(0);
        }
        valuationByCategory[item.category] = valuationByCategory[item.category].plus(itemValue);
      });

      logger.info(`💰 Inventory valuation calculated: $${totalValue}`);

      return {
        totalValue: totalValue.toDecimalPlaces(2),
        itemCount: items.length,
        valueByCategory: Object.entries(valuationByCategory).reduce(
          (acc, [category, value]) => {
            acc[category] = value.toDecimalPlaces(2);
            return acc;
          },
          {} as Record<string, Decimal>
        ),
      };
    } catch (error: any) {
      logger.error('Error calculating inventory valuation:', error.message);
      throw error;
    }
  }

  /**
   * Check stock availability for menu items (for order validation)
   * Used before completing an order
   */
  async checkStockAvailability(tenantId: string, inventoryItemId: string, requiredQuantity: number) {
    try {
      const item = await this.getInventoryItemById(inventoryItemId, tenantId);

      const available = item.currentStock.greaterThanOrEqualTo(requiredQuantity);

      return {
        available,
        itemId: inventoryItemId,
        itemName: item.name,
        requiredQuantity,
        currentStock: item.currentStock,
        deficit: available ? new Decimal(0) : new Decimal(requiredQuantity).minus(item.currentStock),
      };
    } catch (error: any) {
      logger.error('Error checking stock availability:', error.message);
      throw error;
    }
  }

  /**
   * Deduct inventory when order is completed
   * Called from OrderService when order status changes to COMPLETED
   */
  async deductInventoryForOrder(
    tenantId: string,
    deductions: Array<{
      inventoryItemId: string;
      quantity: number;
      orderItemId: string;
    }>,
    orderId: string,
    userId: string
  ) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const movements: any[] = [];

        for (const deduction of deductions) {
          // Get current item stock
          const item = await tx.inventoryItem.findFirst({
            where: {
              id: deduction.inventoryItemId,
              tenantId,
            },
          });

          if (!item) {
            throw new Error(`Inventory item not found: ${deduction.inventoryItemId}`);
          }

          // Check sufficient stock
          if (item.currentStock.lessThan(deduction.quantity)) {
            throw new Error(
              `Insufficient stock for ${item.name}. Available: ${item.currentStock}, Required: ${deduction.quantity}`
            );
          }

          // Deduct from stock
          const updatedItem = await tx.inventoryItem.update({
            where: { id: deduction.inventoryItemId },
            data: {
              currentStock: item.currentStock.minus(deduction.quantity),
            },
          });

          // Create movement record (audit trail)
          const movement = await tx.stockMovement.create({
            data: {
              tenantId,
              inventoryItemId: deduction.inventoryItemId,
              type: 'sale',
              quantity: new Decimal(deduction.quantity),
              reason: `Order completion (Order ID: ${orderId}, Item: ${deduction.orderItemId})`,
              performedBy: userId,
            },
          });

          movements.push(movement);

          logger.info(
            `📦 Stock deducted: ${item.name} - ${deduction.quantity} ${item.unit} (Order: ${orderId})`
          );
        }

        return movements;
      });

      logger.info(`✅ Inventory deducted for order ${orderId} (${result.length} items)`);
      return result;
    } catch (error: any) {
      logger.error('Error deducting inventory for order:', error.message);
      throw error;
    }
  }

  /**
   * Map a menu item to inventory items (recipe definition)
   */
  async mapMenuItemToInventory(
    tenantId: string,
    menuItemId: string,
    inventoryMappings: Array<{
      inventoryItemId: string;
      quantityNeeded: number;
      unit: string;
    }>
  ) {
    try {
      // Verify menu item exists
      const menuItem = await prisma.menuItem.findFirst({
        where: {
          id: menuItemId,
          tenantId,
        },
      });

      if (!menuItem) {
        throw new Error('Menu item not found');
      }

      const mappings = [];

      for (const mapping of inventoryMappings) {
        // Verify inventory item exists and belongs to tenant
        const inventoryItem = await prisma.inventoryItem.findFirst({
          where: {
            id: mapping.inventoryItemId,
            tenantId,
          },
        });

        if (!inventoryItem) {
          throw new Error(`Inventory item not found: ${mapping.inventoryItemId}`);
        }

        // Create or update mapping
        const created = await prisma.menuItemToInventory.upsert({
          where: {
            menuItemId_inventoryItemId: {
              menuItemId,
              inventoryItemId: mapping.inventoryItemId,
            },
          },
          update: {
            quantityNeeded: new Decimal(mapping.quantityNeeded),
            unit: mapping.unit,
          },
          create: {
            tenantId,
            menuItemId,
            inventoryItemId: mapping.inventoryItemId,
            quantityNeeded: new Decimal(mapping.quantityNeeded),
            unit: mapping.unit,
          },
        });

        mappings.push(created);
      }

      logger.info(`✅ Menu item ${menuItemId} mapped to ${mappings.length} inventory items`);
      return mappings;
    } catch (error: any) {
      logger.error('Error mapping menu item to inventory:', error.message);
      throw error;
    }
  }

  /**
   * Get recipe for a menu item (all mapped inventory items)
   */
  async getMenuItemRecipe(tenantId: string, menuItemId: string) {
    try {
      const mappings = await prisma.menuItemToInventory.findMany({
        where: {
          menuItemId,
          tenantId,
        },
        include: {
          inventoryItem: true,
          menuItem: true,
        },
      });

      return mappings;
    } catch (error: any) {
      logger.error('Error fetching menu item recipe:', error.message);
      throw error;
    }
  }

  /**
   * Check if all required inventory is available for a menu item
   */
  async checkMenuItemAvailability(tenantId: string, menuItemId: string) {
    try {
      const recipe = await this.getMenuItemRecipe(tenantId, menuItemId);

      if (recipe.length === 0) {
        // No recipe mapped, assume available
        return {
          available: true,
          message: 'No recipe defined for this menu item',
          missingIngredients: [],
        };
      }

      const missingIngredients = [];

      for (const mapping of recipe) {
        if (mapping.inventoryItem.currentStock.lessThan(mapping.quantityNeeded)) {
          missingIngredients.push({
            itemId: mapping.inventoryItemId,
            itemName: mapping.inventoryItem.name,
            required: mapping.quantityNeeded,
            available: mapping.inventoryItem.currentStock,
            deficit: mapping.quantityNeeded.minus(mapping.inventoryItem.currentStock),
          });
        }
      }

      return {
        available: missingIngredients.length === 0,
        message: missingIngredients.length === 0 ? 'All ingredients available' : 'Some ingredients are insufficient',
        missingIngredients,
      };
    } catch (error: any) {
      logger.error('Error checking menu item availability:', error.message);
      throw error;
    }
  }

  /**
   * Deduct inventory for a menu item based on its recipe
   */
  async deductMenuItemInventory(
    tenantId: string,
    menuItemId: string,
    quantity: number,
    orderId: string,
    userId: string
  ) {
    try {
      const recipe = await this.getMenuItemRecipe(tenantId, menuItemId);

      if (recipe.length === 0) {
        logger.warn(`No recipe defined for menu item ${menuItemId}`);
        return [];
      }

      const deductions = recipe.map((mapping) => ({
        inventoryItemId: mapping.inventoryItemId,
        quantity: mapping.quantityNeeded.times(quantity).toNumber(),
        orderItemId: menuItemId, // Using menuItemId as identifier
      }));

      return await this.deductInventoryForOrder(tenantId, deductions, orderId, userId);
    } catch (error: any) {
      logger.error('Error deducting menu item inventory:', error.message);
      throw error;
    }
  }
}

export default new InventoryService();
