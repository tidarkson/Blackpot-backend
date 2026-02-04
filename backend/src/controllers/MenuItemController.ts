import { Request, Response } from 'express';
import { MenuItemService } from '../services/MenuItemService';
import {
  menuSectionCreateSchema,
  menuSectionUpdateSchema,
  menuItemCreateSchema,
  menuItemUpdateSchema,
  menuItemSearchSchema,
  menuSectionSearchSchema,
  type MenuSectionCreateInput,
  type MenuSectionUpdateInput,
  type MenuItemCreateInput,
  type MenuItemUpdateInput,
  type MenuItemSearchParams,
  type MenuSectionSearchParams,
} from '../validators/menu.validator';

const menuItemService = new MenuItemService();

// ========================================
// MENU ITEM ENDPOINTS
// ========================================

export class MenuItemController {
  /**
   * Get all menu items with search, filters, and pagination
   * GET /api/menu-items
   */
  static async getAllItems(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;

      // Validate query parameters
      const params = menuItemSearchSchema.parse(req.query);

      const result = await menuItemService.getAllItems(tenantId, {
        page: parseInt(params.page as unknown as string, 10),
        pageSize: parseInt(params.pageSize as unknown as string, 10),
        search: params.search,
        sectionId: params.sectionId,
        isAvailable: params.isAvailable,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        sort: params.sort,
      });

      return res.json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(422).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch menu items',
      });
    }
  }

  /**
   * Get single menu item by ID
   * GET /api/menu-items/:id
   */
  static async getItemById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid item ID format',
        });
      }

      const item = await menuItemService.getItemById(id, tenantId);

      if (!item) {
        return res.status(404).json({
          status: 'error',
          message: 'Menu item not found',
        });
      }

      return res.json({
        status: 'success',
        data: item,
      });
    } catch (error: any) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch menu item',
      });
    }
  }

  /**
   * Create new menu item
   * POST /api/menu-items
   */
  static async createItem(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;

      // Validate request body
      const data: MenuItemCreateInput = menuItemCreateSchema.parse(req.body);

      const item = await menuItemService.createItem(tenantId, {
        sectionId: data.sectionId,
        name: data.name,
        description: data.description,
        price: data.price,
        isAvailable: data.isAvailable,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Menu item created successfully',
        data: item,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(422).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      if (error.message.includes('Section not found')) {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to create menu item',
      });
    }
  }

  /**
   * Update menu item
   * PUT /api/menu-items/:id
   */
  static async updateItem(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid item ID format',
        });
      }

      // Validate request body
      const data: MenuItemUpdateInput = menuItemUpdateSchema.parse(req.body);

      const item = await menuItemService.updateItem(id, tenantId, {
        sectionId: data.sectionId,
        name: data.name,
        description: data.description,
        price: data.price,
        isAvailable: data.isAvailable,
      });

      return res.json({
        status: 'success',
        message: 'Menu item updated successfully',
        data: item,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(422).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      if (error.message === 'Menu item not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      if (error.message.includes('Section not found')) {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to update menu item',
      });
    }
  }

  /**
   * Delete menu item (soft delete)
   * DELETE /api/menu-items/:id
   */
  static async deleteItem(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid item ID format',
        });
      }

      const result = await menuItemService.deleteItem(id, tenantId);

      return res.json({
        status: 'success',
        message: result.message,
      });
    } catch (error: any) {
      if (error.message === 'Menu item not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to delete menu item',
      });
    }
  }
}

// ========================================
// MENU SECTION ENDPOINTS
// ========================================

export class MenuSectionController {
  /**
   * Get all menu sections with pagination
   * GET /api/menu-sections
   */
  static async getAllSections(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;

      // Validate query parameters
      const params = menuSectionSearchSchema.parse(req.query);

      const result = await menuItemService.getAllSections(tenantId, {
        page: parseInt(params.page as unknown as string, 10),
        pageSize: parseInt(params.pageSize as unknown as string, 10),
        menuId: params.menuId,
        search: params.search,
        sort: params.sort,
      });

      return res.json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(422).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch sections',
      });
    }
  }

  /**
   * Get single menu section by ID
   * GET /api/menu-sections/:id
   */
  static async getSectionById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid section ID format',
        });
      }

      const section = await menuItemService.getSectionById(id, tenantId);

      if (!section) {
        return res.status(404).json({
          status: 'error',
          message: 'Section not found',
        });
      }

      return res.json({
        status: 'success',
        data: section,
      });
    } catch (error: any) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch section',
      });
    }
  }

  /**
   * Create new menu section
   * POST /api/menu-sections
   */
  static async createSection(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;

      // Validate request body
      const data: MenuSectionCreateInput = menuSectionCreateSchema.parse(req.body);

      const section = await menuItemService.createSection(tenantId, {
        menuId: data.menuId,
        name: data.name,
        position: data.position,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Section created successfully',
        data: section,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(422).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      if (error.message.includes('Menu not found')) {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to create section',
      });
    }
  }

  /**
   * Update menu section
   * PUT /api/menu-sections/:id
   */
  static async updateSection(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid section ID format',
        });
      }

      // Validate request body
      const data: MenuSectionUpdateInput = menuSectionUpdateSchema.parse(req.body);

      const section = await menuItemService.updateSection(id, tenantId, {
        name: data.name,
        position: data.position,
      });

      return res.json({
        status: 'success',
        message: 'Section updated successfully',
        data: section,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(422).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      if (error.message === 'Section not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to update section',
      });
    }
  }

  /**
   * Delete menu section
   * DELETE /api/menu-sections/:id
   */
  static async deleteSection(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid section ID format',
        });
      }

      const result = await menuItemService.deleteSection(id, tenantId);

      return res.json({
        status: 'success',
        message: result.message,
      });
    } catch (error: any) {
      if (error.message === 'Section not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      if (error.message.includes('Cannot delete section')) {
        return res.status(409).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to delete section',
      });
    }
  }

  /**
   * Get items in a section
   * GET /api/menu-sections/:id/items
   */
  static async getSectionItems(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid section ID format',
        });
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25;

      const result = await menuItemService.getSectionItems(id, tenantId, {
        page,
        pageSize,
        search: req.query.search as string | undefined,
        isAvailable: req.query.isAvailable
          ? (req.query.isAvailable as string) === 'true'
          : undefined,
      });

      return res.json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      if (error.message === 'Section not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch section items',
      });
    }
  }
}
