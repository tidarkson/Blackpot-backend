import { Request, Response } from 'express';
import { MenuService } from '../services/MenuService';
import { MenuItemService } from '../services/MenuItemService';
import {
  menuCreateSchema,
  menuUpdateSchema,
  menuSearchSchema,
  type MenuCreateInput,
  type MenuUpdateInput,
  type MenuSearchParams,
} from '../validators/menu.validator';

const menuService = new MenuService();
const menuItemService = new MenuItemService();

export class MenuController {
  /**
   * Get all menus with pagination and search
   * GET /api/menus
   */
  static async getAllMenus(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;

      // Validate query parameters
      const params = menuSearchSchema.parse(req.query);

      const result = await menuService.getAllMenus(tenantId, {
        page: parseInt(params.page as unknown as string, 10),
        pageSize: parseInt(params.pageSize as unknown as string, 10),
        search: params.search,
        isActive: params.isActive,
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
        message: error.message || 'Failed to fetch menus',
      });
    }
  }

  /**
   * Get single menu by ID with sections and items
   * GET /api/menus/:id
   */
  static async getMenuById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid menu ID format',
        });
      }

      const menu = await menuService.getMenuById(id, tenantId);

      if (!menu) {
        return res.status(404).json({
          status: 'error',
          message: 'Menu not found',
        });
      }

      return res.json({
        status: 'success',
        data: menu,
      });
    } catch (error: any) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch menu',
      });
    }
  }

  /**
   * Create new menu
   * POST /api/menus
   */
  static async createMenu(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;

      // Validate request body
      const data: MenuCreateInput = menuCreateSchema.parse(req.body);

      const menu = await menuService.createMenu(tenantId, {
        name: data.name,
        isActive: data.isActive,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Menu created successfully',
        data: menu,
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
        message: error.message || 'Failed to create menu',
      });
    }
  }

  /**
   * Update menu
   * PUT /api/menus/:id
   */
  static async updateMenu(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid menu ID format',
        });
      }

      // Validate request body
      const data: MenuUpdateInput = menuUpdateSchema.parse(req.body);

      const menu = await menuService.updateMenu(id, tenantId, {
        name: data.name,
        isActive: data.isActive,
      });

      return res.json({
        status: 'success',
        message: 'Menu updated successfully',
        data: menu,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(422).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      if (error.message === 'Menu not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to update menu',
      });
    }
  }

  /**
   * Delete menu
   * DELETE /api/menus/:id
   */
  static async deleteMenu(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid menu ID format',
        });
      }

      const result = await menuService.deleteMenu(id, tenantId);

      return res.json({
        status: 'success',
        message: result.message,
      });
    } catch (error: any) {
      if (error.message === 'Menu not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      if (error.message.includes('Cannot delete menu')) {
        return res.status(409).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to delete menu',
      });
    }
  }

  /**
   * Get menu sections
   * GET /api/menus/:id/sections
   */
  static async getMenuSections(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tenantId = req.user!.tenantId;

      // Validate UUID
      if (typeof id !== 'string' || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid menu ID format',
        });
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 25;

      const result = await menuService.getMenuSections(id, tenantId, {
        page,
        pageSize,
        search: req.query.search as string | undefined,
        sort: (req.query.sort as 'name' | 'position') || 'position',
      });

      return res.json({
        status: 'success',
        data: result,
      });
    } catch (error: any) {
      if (error.message === 'Menu not found') {
        return res.status(404).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch menu sections',
      });
    }
  }
}
