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
}
