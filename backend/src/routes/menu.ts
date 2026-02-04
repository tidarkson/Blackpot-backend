import express from 'express';
import { MenuController } from '../controllers/MenuController';
import { MenuItemController, MenuSectionController } from '../controllers/MenuItemController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Apply authentication to all menu routes
router.use(authenticate);

// ========================================
// MENU ROUTES
// ========================================

// Get all menus (with pagination, search, filters)
router.get('/', MenuController.getAllMenus);

// Create new menu
router.post('/', MenuController.createMenu);

// Get single menu with sections and items
router.get('/:id', MenuController.getMenuById);

// Update menu
router.put('/:id', MenuController.updateMenu);

// Delete menu
router.delete('/:id', MenuController.deleteMenu);

// Get sections in a menu
router.get('/:id/sections', MenuController.getMenuSections);

// ========================================
// MENU SECTION ROUTES
// ========================================

// Get all sections (with pagination, search, filters)
router.get('/sections/list/all', MenuSectionController.getAllSections);

// Create new section
router.post('/sections/create/new', MenuSectionController.createSection);

// Get single section
router.get('/sections/:id/details', MenuSectionController.getSectionById);

// Update section
router.put('/sections/:id/update', MenuSectionController.updateSection);

// Delete section
router.delete('/sections/:id/delete', MenuSectionController.deleteSection);

// Get items in a section
router.get('/sections/:id/items', MenuSectionController.getSectionItems);

// ========================================
// MENU ITEM ROUTES
// ========================================

// Get all items (with pagination, search, filters, sorting)
router.get('/items/list/all', MenuItemController.getAllItems);

// Create new item
router.post('/items/create/new', MenuItemController.createItem);

// Get single item
router.get('/items/:id/details', MenuItemController.getItemById);

// Update item
router.put('/items/:id/update', MenuItemController.updateItem);

// Delete item (soft delete)
router.delete('/items/:id/delete', MenuItemController.deleteItem);

export default router;
