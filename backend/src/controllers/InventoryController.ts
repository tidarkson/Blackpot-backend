import { Request, Response } from 'express';
import InventoryService from '../services/InventoryService';
import logger from '../config/logger';
import { z } from 'zod';
import {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  adjustStockSchema,
  createSupplierSchema,
  createWineDetailSchema,
  updateWineDetailSchema,
  inventoryFiltersSchema,
  movementHistoryQuerySchema,
  winePairingQuerySchema,
} from '../validators/inventory.validator';

export class InventoryController {
  /**
   * GET /api/inventory/items
   * Get all inventory items with optional filters
   */
  async getInventoryItems(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;

      // Validate query parameters
      const validatedFilters = inventoryFiltersSchema.parse(req.query);

      const items = await InventoryService.getInventoryItems(tenantId, validatedFilters);

      res.status(200).json({
        success: true,
        data: items,
        count: items.length,
      });
    } catch (error: any) {
      logger.error('Error in getInventoryItems:', error.message);
      res.status(error.message.includes('Invalid') ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to fetch inventory items',
      });
    }
  }

  /**
   * GET /api/inventory/items/:id
   * Get specific inventory item details
   */
  async getInventoryItemById(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;
      const { id } = req.params as any;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Item ID is required',
        });
        return;
      }

      const item = await InventoryService.getInventoryItemById(id as string, tenantId);

      res.status(200).json({
        success: true,
        data: item,
      });
    } catch (error: any) {
      logger.error('Error in getInventoryItemById:', error.message);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to fetch inventory item',
      });
    }
  }

  /**
   * POST /api/inventory/items
   * Create new inventory item
   */
  async createInventoryItem(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;

      // Validate request body
      const validatedData = createInventoryItemSchema.parse(req.body);

      const item = await InventoryService.createInventoryItem(tenantId, validatedData);

      res.status(201).json({
        success: true,
        message: 'Inventory item created successfully',
        data: item,
      });
    } catch (error: any) {
      logger.error('Error in createInventoryItem:', error.message);
      res.status(error.errors ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to create inventory item',
        errors: error.errors,
      });
    }
  }

  /**
   * PUT /api/inventory/items/:id
   * Update inventory item
   */
  async updateInventoryItem(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;
      const { id } = req.params as any;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Item ID is required',
        });
        return;
      }

      // Validate request body
      const validatedData = updateInventoryItemSchema.parse(req.body);

      const item = await InventoryService.updateInventoryItem(id as string, tenantId, validatedData);

      res.status(200).json({
        success: true,
        message: 'Inventory item updated successfully',
        data: item,
      });
    } catch (error: any) {
      logger.error('Error in updateInventoryItem:', error.message);
      const statusCode = error.message.includes('not found') ? 404 : error.errors ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to update inventory item',
        errors: error.errors,
      });
    }
  }

  /**
   * DELETE /api/inventory/items/:id
   * Delete inventory item
   */
  async deleteInventoryItem(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;
      const { id } = req.params as any;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Item ID is required',
        });
        return;
      }

      const result = await InventoryService.deleteInventoryItem(id as string, tenantId);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error: any) {
      logger.error('Error in deleteInventoryItem:', error.message);
      const statusCode = error.message.includes('not found')
        ? 404
        : error.message.includes('Cannot delete')
          ? 409
          : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to delete inventory item',
      });
    }
  }

  /**
   * POST /api/inventory/items/:id/adjust
   * Adjust stock quantity (add/remove)
   */
  async adjustStock(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;
      const userId = req.user?.userId as string;
      const { id } = req.params as any;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Item ID is required',
        });
        return;
      }

      // Validate request body
      const validatedData = adjustStockSchema.parse(req.body);

      const result = await InventoryService.adjustStock(id as string, tenantId, {
        ...validatedData,
        performedBy: userId,
      });

      res.status(200).json({
        success: true,
        message: 'Stock adjusted successfully',
        data: {
          item: result.item,
          movement: result.movement,
        },
      });
    } catch (error: any) {
      logger.error('Error in adjustStock:', error.message);
      const statusCode = error.message.includes('not found')
        ? 404
        : error.message.includes('Insufficient')
          ? 409
          : error.errors
            ? 400
            : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to adjust stock',
        errors: error.errors,
      });
    }
  }

  /**
   * GET /api/inventory/items/:id/history
   * Get stock movement history for an item
   */
  async getStockMovementHistory(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;
      const { id } = req.params as any;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Item ID is required',
        });
        return;
      }

      // Validate query parameters
      const validatedQuery = movementHistoryQuerySchema.parse(req.query);

      const movements = await InventoryService.getStockMovementHistory(id as string, tenantId, validatedQuery.limit);

      res.status(200).json({
        success: true,
        data: movements,
        count: movements.length,
      });
    } catch (error: any) {
      logger.error('Error in getStockMovementHistory:', error.message);
      const statusCode = error.message.includes('not found') ? 404 : error.errors ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to fetch stock movement history',
        errors: error.errors,
      });
    }
  }

  /**
   * GET /api/inventory/low-stock
   * Get all items below minimum stock threshold
   */
  async getLowStockItems(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;

      const lowStockItems = await InventoryService.getLowStockItems(tenantId);

      res.status(200).json({
        success: true,
        data: lowStockItems,
        count: lowStockItems.length,
        message: `${lowStockItems.length} items are below minimum stock threshold`,
      });
    } catch (error: any) {
      logger.error('Error in getLowStockItems:', error.message);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch low stock items',
      });
    }
  }

  /**
   * GET /api/inventory/suppliers
   * Get all suppliers for the tenant
   */
  async getSuppliers(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;

      const suppliers = await InventoryService.getSuppliers(tenantId);

      res.status(200).json({
        success: true,
        data: suppliers,
        count: suppliers.length,
      });
    } catch (error: any) {
      logger.error('Error in getSuppliers:', error.message);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch suppliers',
      });
    }
  }

  /**
   * POST /api/inventory/suppliers
   * Create new supplier
   */
  async createSupplier(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;

      // Validate request body
      const validatedData = createSupplierSchema.parse(req.body);

      const supplier = await InventoryService.createSupplier(tenantId, validatedData);

      res.status(201).json({
        success: true,
        message: 'Supplier created successfully',
        data: supplier,
      });
    } catch (error: any) {
      logger.error('Error in createSupplier:', error.message);
      res.status(error.errors ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to create supplier',
        errors: error.errors,
      });
    }
  }

  /**
   * GET /api/inventory/categories
   * Get all inventory categories
   */
  async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;

      const categories = await InventoryService.getCategories(tenantId);

      res.status(200).json({
        success: true,
        data: categories,
        count: categories.length,
      });
    } catch (error: any) {
      logger.error('Error in getCategories:', error.message);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch categories',
      });
    }
  }

  /**
   * GET /api/inventory/wine-cellar
   * Get all wines
   */
  async getWines(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;

      const wines = await InventoryService.getWines(tenantId);

      res.status(200).json({
        success: true,
        data: wines,
        count: wines.length,
      });
    } catch (error: any) {
      logger.error('Error in getWines:', error.message);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch wines',
      });
    }
  }

  /**
   * POST /api/inventory/wine-cellar
   * Add new wine to inventory
   */
  async addWine(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;

      // Validate request body
      const validatedData = createWineDetailSchema.parse(req.body);

      const result = await InventoryService.addWine(tenantId, validatedData);

      res.status(201).json({
        success: true,
        message: 'Wine added successfully',
        data: {
          item: result.item,
          wineDetail: result.wineDetail,
        },
      });
    } catch (error: any) {
      logger.error('Error in addWine:', error.message);
      res.status(error.errors ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to add wine',
        errors: error.errors,
      });
    }
  }

  /**
   * PUT /api/inventory/wine-cellar/:id
   * Update wine details
   */
  async updateWine(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;
      const { id } = req.params as any;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Wine ID is required',
        });
        return;
      }

      // Validate request body
      const validatedData = updateWineDetailSchema.parse(req.body);

      const result = await InventoryService.updateWine(id as string, tenantId, validatedData);

      res.status(200).json({
        success: true,
        message: 'Wine updated successfully',
        data: {
          item: result.item,
          wineDetail: result.wineDetail,
        },
      });
    } catch (error: any) {
      logger.error('Error in updateWine:', error.message);
      const statusCode = error.message.includes('not found')
        ? 404
        : error.message.includes('not a wine')
          ? 400
          : error.errors
            ? 400
            : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to update wine',
        errors: error.errors,
      });
    }
  }

  /**
   * GET /api/inventory/wine-cellar/pairings
   * Get wine pairing suggestions
   */
  async getWinePairings(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;

      // Validate query parameters
      const validatedQuery = winePairingQuerySchema.parse(req.query);

      const pairings = await InventoryService.getWinePairings(
        tenantId,
        validatedQuery.mainCourseCategory
      );

      res.status(200).json({
        success: true,
        data: pairings,
        count: pairings.length,
      });
    } catch (error: any) {
      logger.error('Error in getWinePairings:', error.message);
      res.status(error.errors ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to fetch wine pairings',
        errors: error.errors,
      });
    }
  }

  /**
   * GET /api/inventory/valuation
   * Calculate inventory valuation and value by category
   */
  async calculateInventoryValuation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;

      const valuation = await InventoryService.calculateInventoryValuation(tenantId);

      res.status(200).json({
        success: true,
        data: valuation,
      });
    } catch (error: any) {
      logger.error('Error in calculateInventoryValuation:', error.message);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to calculate inventory valuation',
      });
    }
  }

  /**
   * POST /api/inventory/menu-items/:menuItemId/recipe
   * Map a menu item to inventory items (define recipe)
   */
  async mapMenuItemToInventory(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;
      const { menuItemId } = req.params as any;

      if (!menuItemId) {
        res.status(400).json({
          success: false,
          message: 'Menu item ID is required',
        });
        return;
      }

      const { inventoryMappings } = req.body;

      if (!Array.isArray(inventoryMappings) || inventoryMappings.length === 0) {
        res.status(400).json({
          success: false,
          message: 'inventoryMappings must be a non-empty array',
        });
        return;
      }

      const mappings = await InventoryService.mapMenuItemToInventory(
        tenantId,
        menuItemId,
        inventoryMappings
      );

      res.status(201).json({
        success: true,
        message: 'Menu item recipe created successfully',
        data: mappings,
      });
    } catch (error: any) {
      logger.error('Error in mapMenuItemToInventory:', error.message);
      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to map menu item to inventory',
      });
    }
  }

  /**
   * GET /api/inventory/menu-items/:menuItemId/recipe
   * Get recipe for a menu item
   */
  async getMenuItemRecipe(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;
      const { menuItemId } = req.params as any;

      if (!menuItemId) {
        res.status(400).json({
          success: false,
          message: 'Menu item ID is required',
        });
        return;
      }

      const recipe = await InventoryService.getMenuItemRecipe(tenantId, menuItemId as string);

      res.status(200).json({
        success: true,
        data: recipe,
        count: recipe.length,
      });
    } catch (error: any) {
      logger.error('Error in getMenuItemRecipe:', error.message);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch menu item recipe',
      });
    }
  }

  /**
   * GET /api/inventory/menu-items/:menuItemId/availability
   * Check if a menu item can be prepared (all ingredients in stock)
   */
  async checkMenuItemAvailability(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId as string;
      const { menuItemId } = req.params as any;

      if (!menuItemId) {
        res.status(400).json({
          success: false,
          message: 'Menu item ID is required',
        });
        return;
      }

      const availability = await InventoryService.checkMenuItemAvailability(tenantId, menuItemId as string);

      res.status(200).json({
        success: true,
        data: availability,
      });
    } catch (error: any) {
      logger.error('Error in checkMenuItemAvailability:', error.message);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to check menu item availability',
      });
    }
  }
}

export const inventoryController = new InventoryController();
