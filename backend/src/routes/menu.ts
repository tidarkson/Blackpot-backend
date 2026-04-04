import express from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { MenuController } from '../controllers/MenuController';
import { MenuItemController, MenuSectionController } from '../controllers/MenuItemController';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';

const router = express.Router();
const prisma = new PrismaClient();

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

// Get items in a menu (frontend contract endpoint)
router.get('/:menuId/items', async (req, res, next) => {
	try {
		const menuId = String(req.params.menuId);
		const { category, available, sectionId, search } = req.query;

		const where: Prisma.MenuItemWhereInput = {
			tenantId: req.user!.tenantId,
			section: {
				menuId,
			},
		};

		if (category) {
			where.category = String(category);
		}

		if (available !== undefined) {
			where.isAvailable = String(available) === 'true';
		}

		if (sectionId) {
			where.sectionId = String(sectionId);
		}

		if (search) {
			where.name = {
				contains: String(search),
				mode: 'insensitive',
			};
		}

		const items = await prisma.menuItem.findMany({
			where,
			include: {
				section: {
					select: {
						id: true,
						name: true,
						position: true,
					},
				},
			},
			orderBy: [
				{
					section: {
						position: 'asc',
					},
				},
				{
					position: 'asc',
				},
			],
		});

		return res.json({
			status: 'success',
			data: {
				items,
				total: items.length,
			},
		});
	} catch (error) {
		return next(error);
	}
});

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
router.put('/items/:id/update', requirePermission('menu_items', 'edit'), MenuItemController.updateItem);

// Compatibility endpoint for permission-aware item updates.
router.patch('/:id/items', requirePermission('menu_items', 'edit'), MenuItemController.updateItem);

// Create menu item under a specific menu
router.post('/:menuId/items', requirePermission('menu_items', 'create'), async (req, res, next) => {
	try {
		const menuId = String(req.params.menuId);
		const { sectionId, name, description, price, category, dietary, allergens, imageUrl, isAvailable, preparationTime, availabilityWindows, cost, modifiers, kdsStation } = req.body;

		if (!sectionId || !name || price === undefined || price === null) {
			return res.status(400).json({
				status: 'error',
				code: 400,
				message: 'sectionId, name, and price are required',
			});
		}

		const section = await prisma.menuSection.findFirst({
			where: {
				id: String(sectionId),
				tenantId: req.user!.tenantId,
				menuId,
			},
			select: { id: true },
		});

		if (!section) {
			return res.status(404).json({
				status: 'error',
				code: 404,
				message: 'Section not found for this menu',
			});
		}

		const lastItem = await prisma.menuItem.findFirst({
			where: {
				tenantId: req.user!.tenantId,
				sectionId: String(sectionId),
			},
			orderBy: { position: 'desc' },
			select: { position: true },
		});

		const item = await prisma.menuItem.create({
			data: {
				tenantId: req.user!.tenantId,
				sectionId: String(sectionId),
				name: String(name),
				description: description ? String(description) : null,
				price: new Prisma.Decimal(price),
				category: category ? String(category) : null,
				dietary: Array.isArray(dietary) ? dietary : [],
				allergens: Array.isArray(allergens) ? allergens : [],
				imageUrl: imageUrl ? String(imageUrl) : null,
				isAvailable: typeof isAvailable === 'boolean' ? isAvailable : true,
				preparationTime: preparationTime !== undefined && preparationTime !== null ? Number(preparationTime) : null,
				position: (lastItem?.position ?? -1) + 1,
				availabilityWindows: availabilityWindows ?? null,
				cost: cost !== undefined && cost !== null ? new Prisma.Decimal(cost) : null,
				modifiers: modifiers ?? null,
				kdsStation: kdsStation ? String(kdsStation) : null,
			},
			include: {
				section: {
					select: {
						id: true,
						name: true,
					},
				},
			},
		});

		return res.status(201).json({
			status: 'success',
			data: item,
		});
	} catch (error) {
		return next(error);
	}
});

// Update menu item
router.patch('/:menuId/items/:itemId', requirePermission('menu_items', 'edit'), async (req, res, next) => {
	try {
		const menuId = String(req.params.menuId);
		const itemId = String(req.params.itemId);
		const payload = req.body as Record<string, unknown>;

		const existing = await prisma.menuItem.findFirst({
			where: {
				id: itemId,
				tenantId: req.user!.tenantId,
				section: {
					menuId,
				},
			},
			include: {
				section: {
					select: {
						id: true,
						menuId: true,
					},
				},
			},
		});

		if (!existing) {
			return res.status(404).json({
				status: 'error',
				code: 404,
				message: 'Menu item not found',
			});
		}

		const updateData: Prisma.MenuItemUpdateInput = {};

		if (payload.sectionId) {
			const section = await prisma.menuSection.findFirst({
				where: {
					id: String(payload.sectionId),
					tenantId: req.user!.tenantId,
					menuId,
				},
			});

			if (!section) {
				return res.status(404).json({
					status: 'error',
					code: 404,
					message: 'Target section not found for this menu',
				});
			}

			updateData.section = {
				connect: {
					id: section.id,
				},
			};
		}

		if (payload.name !== undefined) updateData.name = String(payload.name);
		if (payload.description !== undefined) updateData.description = payload.description ? String(payload.description) : null;
		if (payload.price !== undefined && payload.price !== null) updateData.price = new Prisma.Decimal(payload.price as string | number);
		if (payload.category !== undefined) updateData.category = payload.category ? String(payload.category) : null;
		if (payload.dietary !== undefined) updateData.dietary = Array.isArray(payload.dietary) ? payload.dietary : [];
		if (payload.allergens !== undefined) updateData.allergens = Array.isArray(payload.allergens) ? payload.allergens : [];
		if (payload.imageUrl !== undefined) updateData.imageUrl = payload.imageUrl ? String(payload.imageUrl) : null;
		if (payload.isAvailable !== undefined) updateData.isAvailable = Boolean(payload.isAvailable);
		if (payload.preparationTime !== undefined) updateData.preparationTime = payload.preparationTime !== null ? Number(payload.preparationTime) : null;
		if (payload.position !== undefined) updateData.position = payload.position !== null ? Number(payload.position) : null;
		if (payload.availabilityWindows !== undefined) {
			updateData.availabilityWindows = payload.availabilityWindows === null
				? Prisma.JsonNull
				: payload.availabilityWindows as Prisma.InputJsonValue;
		}
		if (payload.cost !== undefined) updateData.cost = payload.cost !== null ? new Prisma.Decimal(payload.cost as string | number) : null;
		if (payload.modifiers !== undefined) {
			updateData.modifiers = payload.modifiers === null
				? Prisma.JsonNull
				: payload.modifiers as Prisma.InputJsonValue;
		}
		if (payload.kdsStation !== undefined) updateData.kdsStation = payload.kdsStation ? String(payload.kdsStation) : null;

		const item = await prisma.menuItem.update({
			where: { id: itemId },
			data: updateData,
			include: {
				section: {
					select: {
						id: true,
						name: true,
					},
				},
			},
		});

		return res.json({
			status: 'success',
			data: item,
		});
	} catch (error) {
		return next(error);
	}
});

// Soft-delete menu item (archive)
router.delete('/:menuId/items/:itemId', requirePermission('menu_items', 'delete'), async (req, res, next) => {
	try {
		const menuId = String(req.params.menuId);
		const itemId = String(req.params.itemId);

		const existing = await prisma.menuItem.findFirst({
			where: {
				id: itemId,
				tenantId: req.user!.tenantId,
				section: {
					menuId,
				},
			},
			select: { id: true },
		});

		if (!existing) {
			return res.status(404).json({
				status: 'error',
				code: 404,
				message: 'Menu item not found',
			});
		}

		await prisma.menuItem.update({
			where: { id: itemId },
			data: {
				isAvailable: false,
				archivedAt: new Date(),
			},
		});

		return res.json({
			status: 'success',
			data: null,
		});
	} catch (error) {
		return next(error);
	}
});

// Update menu item price (requires pricing approval)
router.patch(
	'/:menuId/items/:itemId/price',
	requirePermission('menu_items', 'edit'),
	requirePermission('pricing', 'approve'),
	async (req, res, next) => {
		try {
			const menuId = String(req.params.menuId);
			const itemId = String(req.params.itemId);
			const { price } = req.body;

			if (price === undefined || price === null) {
				return res.status(400).json({
					status: 'error',
					code: 400,
					message: 'price is required',
				});
			}

			const existing = await prisma.menuItem.findFirst({
				where: {
					id: itemId,
					tenantId: req.user!.tenantId,
					section: {
						menuId,
					},
				},
				select: { id: true },
			});

			if (!existing) {
				return res.status(404).json({
					status: 'error',
					code: 404,
					message: 'Menu item not found',
				});
			}

			const item = await prisma.menuItem.update({
				where: { id: itemId },
				data: {
					price: new Prisma.Decimal(price),
				},
				include: {
					section: {
						select: {
							id: true,
							name: true,
						},
					},
				},
			});

			return res.json({
				status: 'success',
				data: item,
			});
		} catch (error) {
			return next(error);
		}
	},
);

// 86 toggle for instant availability switch
router.patch('/:menuId/items/:itemId/toggle-availability', requirePermission('menu_items', 'edit'), async (req, res, next) => {
	try {
		const menuId = String(req.params.menuId);
		const itemId = String(req.params.itemId);

		const existing = await prisma.menuItem.findFirst({
			where: {
				id: itemId,
				tenantId: req.user!.tenantId,
				section: {
					menuId,
				},
			},
			select: {
				id: true,
				isAvailable: true,
			},
		});

		if (!existing) {
			return res.status(404).json({
				status: 'error',
				code: 404,
				message: 'Menu item not found',
			});
		}

		const nextAvailability = !existing.isAvailable;
		const item = await prisma.menuItem.update({
			where: { id: itemId },
			data: {
				isAvailable: nextAvailability,
				archivedAt: nextAvailability ? null : new Date(),
			},
			include: {
				section: {
					select: {
						id: true,
						name: true,
					},
				},
			},
		});

		return res.json({
			status: 'success',
			data: item,
		});
	} catch (error) {
		return next(error);
	}
});

// Delete item (soft delete)
router.delete('/items/:id/delete', MenuItemController.deleteItem);

export default router;
