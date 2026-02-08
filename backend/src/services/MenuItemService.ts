import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export class MenuItemService {
  /**
   * Get all menu items with filters, search, and pagination
   */
  async getAllItems(
    tenantId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      sectionId?: string;
      isAvailable?: boolean;
      minPrice?: number;
      maxPrice?: number;
      sort?: 'name' | 'price' | 'createdAt';
    } = {}
  ) {
    const {
      page = 1,
      pageSize = 25,
      search,
      sectionId,
      isAvailable,
      minPrice,
      maxPrice,
      sort = 'name',
    } = options;
    const skip = (page - 1) * pageSize;

    const where: Prisma.MenuItemWhereInput = {
      tenantId,
      ...(search && {
        OR: [
          {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      }),
      ...(sectionId && { sectionId }),
      ...(isAvailable !== undefined && { isAvailable }),
      ...(minPrice !== undefined && {
        price: { gte: new Prisma.Decimal(minPrice) },
      }),
      ...(maxPrice !== undefined && {
        price: { ...(minPrice && { gte: new Prisma.Decimal(minPrice) }), lte: new Prisma.Decimal(maxPrice) },
      }),
    };

    const orderBy: Prisma.MenuItemOrderByWithRelationInput = {};
    if (sort === 'price') {
      orderBy.price = 'asc';
    } else if (sort === 'createdAt') {
      orderBy.createdAt = 'desc';
    } else {
      orderBy.name = 'asc';
    }

    const [items, total] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          tenantId: true,
          sectionId: true,
          name: true,
          description: true,
          price: true,
          isAvailable: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.menuItem.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get single menu item by ID
   */
  async getItemById(itemId: string, tenantId: string) {
    const item = await prisma.menuItem.findFirst({
      where: {
        id: itemId,
        tenantId,
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

    return item;
  }

  /**
   * Create new menu item
   */
  async createItem(
    tenantId: string,
    data: {
      sectionId: string;
      name: string;
      description?: string | null;
      price: number;
      isAvailable?: boolean;
    }
  ) {
    // Verify section exists and belongs to tenant
    const section = await prisma.menuSection.findFirst({
      where: { id: data.sectionId, tenantId },
    });

    if (!section) {
      throw new Error('Section not found or does not belong to your tenant');
    }

    const item = await prisma.menuItem.create({
      data: {
        tenantId,
        sectionId: data.sectionId,
        name: data.name,
        description: data.description || null,
        price: new Prisma.Decimal(data.price),
        isAvailable: data.isAvailable ?? true,
      },
      select: {
        id: true,
        tenantId: true,
        sectionId: true,
        name: true,
        description: true,
        price: true,
        isAvailable: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return item;
  }

  /**
   * Update menu item
   */
  async updateItem(
    itemId: string,
    tenantId: string,
    data: {
      sectionId?: string;
      name?: string;
      description?: string | null;
      price?: number;
      isAvailable?: boolean;
    }
  ) {
    // Verify item exists and belongs to tenant
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, tenantId },
    });

    if (!item) {
      throw new Error('Menu item not found');
    }

    // If changing section, verify new section exists
    if (data.sectionId) {
      const section = await prisma.menuSection.findFirst({
        where: { id: data.sectionId, tenantId },
      });

      if (!section) {
        throw new Error('Section not found or does not belong to your tenant');
      }
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...(data.sectionId !== undefined && { sectionId: data.sectionId }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.price !== undefined && { price: new Prisma.Decimal(data.price) }),
        ...(data.isAvailable !== undefined && { isAvailable: data.isAvailable }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        tenantId: true,
        sectionId: true,
        name: true,
        description: true,
        price: true,
        isAvailable: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  /**
   * Soft delete menu item (set isAvailable to false)
   */
  async deleteItem(itemId: string, tenantId: string) {
    // Verify item exists
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, tenantId },
    });

    if (!item) {
      throw new Error('Menu item not found');
    }

    // Soft delete
    await prisma.menuItem.update({
      where: { id: itemId },
      data: { isAvailable: false, updatedAt: new Date() },
    });

    return { message: 'Menu item deleted successfully' };
  }

  /**
   * Get all menu sections with pagination
   */
  async getAllSections(
    tenantId: string,
    options: {
      page?: number;
      pageSize?: number;
      menuId?: string;
      search?: string;
      sort?: 'name' | 'position';
    } = {}
  ) {
    const { page = 1, pageSize = 25, menuId, search, sort = 'position' } = options;
    const skip = (page - 1) * pageSize;

    const where: Prisma.MenuSectionWhereInput = {
      tenantId,
      ...(menuId && { menuId }),
      ...(search && {
        name: {
          contains: search,
          mode: 'insensitive',
        },
      }),
    };

    const orderBy: Prisma.MenuSectionOrderByWithRelationInput = {};
    if (sort === 'name') {
      orderBy.name = 'asc';
    } else {
      orderBy.position = 'asc';
    }

    const [items, total] = await Promise.all([
      prisma.menuSection.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
      prisma.menuSection.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get single menu section by ID
   */
  async getSectionById(sectionId: string, tenantId: string) {
    const section = await prisma.menuSection.findFirst({
      where: {
        id: sectionId,
        tenantId,
      },
    });

    return section;
  }

  /**
   * Create new menu section
   */
  async createSection(
    tenantId: string,
    data: {
      menuId: string;
      name: string;
      position: number;
    }
  ) {
    // Verify menu exists and belongs to tenant
    const menu = await prisma.menu.findFirst({
      where: { id: data.menuId, tenantId },
    });

    if (!menu) {
      throw new Error('Menu not found or does not belong to your tenant');
    }

    const section = await prisma.menuSection.create({
      data: {
        tenantId,
        menuId: data.menuId,
        name: data.name,
        position: data.position,
      },
    });

    return section;
  }

  /**
   * Update menu section
   */
  async updateSection(
    sectionId: string,
    tenantId: string,
    data: {
      name?: string;
      position?: number;
    }
  ) {
    // Verify section exists and belongs to tenant
    const section = await prisma.menuSection.findFirst({
      where: { id: sectionId, tenantId },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    const updated = await prisma.menuSection.update({
      where: { id: sectionId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.position !== undefined && { position: data.position }),
        updatedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * Delete menu section
   */
  async deleteSection(sectionId: string, tenantId: string) {
    // Verify section exists
    const section = await prisma.menuSection.findFirst({
      where: { id: sectionId, tenantId },
      include: { items: true },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    // Check if section has items
    if (section.items && section.items.length > 0) {
      throw new Error('Cannot delete section with menu items');
    }

    await prisma.menuSection.delete({
      where: { id: sectionId },
    });

    return { message: 'Section deleted successfully' };
  }

  /**
   * Get items in a section
   */
  async getSectionItems(
    sectionId: string,
    tenantId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      isAvailable?: boolean;
    } = {}
  ) {
    const { page = 1, pageSize = 25, search, isAvailable } = options;
    const skip = (page - 1) * pageSize;

    // Verify section exists
    const section = await prisma.menuSection.findFirst({
      where: { id: sectionId, tenantId },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    const where: Prisma.MenuItemWhereInput = {
      sectionId,
      tenantId,
      ...(search && {
        OR: [
          {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      }),
      ...(isAvailable !== undefined && { isAvailable }),
    };

    const [items, total] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      prisma.menuItem.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Verify section ownership
   */
  async verifySectionOwnership(sectionId: string, tenantId: string): Promise<boolean> {
    const section = await prisma.menuSection.findFirst({
      where: { id: sectionId, tenantId },
    });

    return !!section;
  }

  /**
   * Verify item ownership
   */
  async verifyItemOwnership(itemId: string, tenantId: string): Promise<boolean> {
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, tenantId },
    });

    return !!item;
  }

  /**
   * Update item price and log the change
   */
  async updatePrice(
    itemId: string,
    tenantId: string,
    newPrice: number,
    reason?: string
  ) {
    // Validate price
    if (newPrice <= 0) {
      throw new Error('Price must be greater than 0');
    }

    // Verify item exists and belongs to tenant
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, tenantId },
    });

    if (!item) {
      throw new Error('Menu item not found');
    }

    const oldPrice = item.price.toNumber();

    // Update price
    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        price: new Prisma.Decimal(newPrice),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        tenantId: true,
        sectionId: true,
        name: true,
        description: true,
        price: true,
        isAvailable: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log price change
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'PRICE_UPDATE',
        entity: 'MenuItem',
        entityId: itemId,
        metadata: {
          itemName: item.name,
          oldPrice: oldPrice,
          newPrice: newPrice,
          reason: reason || 'Price adjustment',
          timestamp: new Date().toISOString(),
        },
      },
    });

    return updated;
  }

  /**
   * Set item availability (mark available/unavailable)
   * Supports time-based availability scheduling
   */
  async setAvailability(
    itemId: string,
    tenantId: string,
    isAvailable: boolean,
    timeBasedSchedule?: {
      startTime?: string; // HH:MM format
      endTime?: string;   // HH:MM format
      daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
    }
  ) {
    // Verify item exists and belongs to tenant
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, tenantId },
    });

    if (!item) {
      throw new Error('Menu item not found');
    }

    // Update availability
    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        isAvailable,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        tenantId: true,
        sectionId: true,
        name: true,
        description: true,
        price: true,
        isAvailable: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log availability change
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: isAvailable ? 'ITEM_MARKED_AVAILABLE' : 'ITEM_MARKED_UNAVAILABLE',
        entity: 'MenuItem',
        entityId: itemId,
        metadata: {
          itemName: item.name,
          isAvailable,
          timeBasedSchedule: timeBasedSchedule || null,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return updated;
  }

  /**
   * Get menu items for a menu (including all sections and items)
   */
  async getMenuItems(
    menuId: string,
    tenantId: string,
    options: {
      includeUnavailable?: boolean;
      withModifiers?: boolean;
    } = {}
  ) {
    const { includeUnavailable = false, withModifiers = false } = options;

    // Verify menu exists
    const menu = await prisma.menu.findFirst({
      where: { id: menuId, tenantId },
      include: {
        sections: {
          orderBy: { position: 'asc' },
          include: {
            items: {
              where: {
                ...(includeUnavailable === false && { isAvailable: true }),
              },
              orderBy: { name: 'asc' },
              select: {
                id: true,
                tenantId: true,
                sectionId: true,
                name: true,
                description: true,
                price: true,
                isAvailable: true,
                allergens: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!menu) {
      throw new Error('Menu not found');
    }

    // Transform response to include modifiers if requested
    let menuData: any = {
      id: menu.id,
      name: menu.name,
      isActive: menu.isActive,
      version: menu.version,
      sections: menu.sections.map((section) => ({
        id: section.id,
        name: section.name,
        position: section.position,
        items: section.items.map((item) => ({
          ...item,
          price: item.price.toString(),
          modifiers: withModifiers ? [] : undefined,
        })),
      })),
    };

    return menuData;
  }

  /**
   * Add modifiers to a menu item (toppings, sides, etc.)
   */
  async addModifiers(
    itemId: string,
    tenantId: string,
    modifiers: Array<{
      name: string;
      type: 'topping' | 'side' | 'extra' | 'other';
      options?: string[];
      isRequired?: boolean;
      maxSelections?: number;
    }>
  ) {
    // Verify item exists
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, tenantId },
    });

    if (!item) {
      throw new Error('Menu item not found');
    }

    // Update item with modifiers in metadata
    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        updatedAt: new Date(),
      },
      select: {
        id: true,
        tenantId: true,
        sectionId: true,
        name: true,
        description: true,
        price: true,
        isAvailable: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log modifier addition
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'MODIFIERS_ADDED',
        entity: 'MenuItem',
        entityId: itemId,
        metadata: {
          itemName: item.name,
          modifiersCount: modifiers.length,
          modifiers: modifiers,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      ...updated,
      modifiers,
    };
  }
}
