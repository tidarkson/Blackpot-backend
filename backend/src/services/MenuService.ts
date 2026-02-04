import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export class MenuService {
  /**
   * Get all menus with pagination and search
   */
  async getAllMenus(
    tenantId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      isActive?: boolean;
      sort?: 'name' | 'createdAt';
    } = {}
  ) {
    const { page = 1, pageSize = 25, search, isActive, sort = 'createdAt' } = options;
    const skip = (page - 1) * pageSize;

    const where: Prisma.MenuWhereInput = {
      tenantId,
      ...(search && {
        name: {
          contains: search,
          mode: 'insensitive',
        },
      }),
      ...(isActive !== undefined && { isActive }),
    };

    const orderBy: Prisma.MenuOrderByWithRelationInput = {};
    if (sort === 'name') {
      orderBy.name = 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [items, total] = await Promise.all([
      prisma.menu.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          tenantId: true,
          name: true,
          version: true,
          isActive: true,
          effectiveAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.menu.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get single menu by ID with sections
   */
  async getMenuById(menuId: string, tenantId: string) {
    const menu = await prisma.menu.findFirst({
      where: {
        id: menuId,
        tenantId,
      },
      include: {
        sections: {
          orderBy: { position: 'asc' },
          include: {
            items: {
              where: { isAvailable: true },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });

    return menu;
  }

  /**
   * Create new menu
   */
  async createMenu(
    tenantId: string,
    data: {
      name: string;
      isActive?: boolean;
    }
  ) {
    const menu = await prisma.menu.create({
      data: {
        tenantId,
        name: data.name,
        isActive: data.isActive ?? true,
        version: 1,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        version: true,
        isActive: true,
        effectiveAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return menu;
  }

  /**
   * Update menu
   */
  async updateMenu(
    menuId: string,
    tenantId: string,
    data: {
      name?: string;
      isActive?: boolean;
    }
  ) {
    // Verify menu exists and belongs to tenant
    const menu = await prisma.menu.findFirst({
      where: { id: menuId, tenantId },
    });

    if (!menu) {
      throw new Error('Menu not found');
    }

    const updated = await prisma.menu.update({
      where: { id: menuId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        version: true,
        isActive: true,
        effectiveAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  /**
   * Delete menu (cascades to sections and items)
   */
  async deleteMenu(menuId: string, tenantId: string) {
    // Verify menu exists
    const menu = await prisma.menu.findFirst({
      where: { id: menuId, tenantId },
      include: { sections: true },
    });

    if (!menu) {
      throw new Error('Menu not found');
    }

    // Check if menu has active sections
    if (menu.sections && menu.sections.length > 0) {
      throw new Error('Cannot delete menu with active sections');
    }

    // Delete menu (cascade will handle sections and items)
    await prisma.menu.delete({
      where: { id: menuId },
    });

    return { message: 'Menu deleted successfully' };
  }

  /**
   * Get sections by menu ID
   */
  async getMenuSections(
    menuId: string,
    tenantId: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      sort?: 'name' | 'position';
    } = {}
  ) {
    const { page = 1, pageSize = 25, search, sort = 'position' } = options;
    const skip = (page - 1) * pageSize;

    // Verify menu exists
    const menu = await prisma.menu.findFirst({
      where: { id: menuId, tenantId },
    });

    if (!menu) {
      throw new Error('Menu not found');
    }

    const where: Prisma.MenuSectionWhereInput = {
      menuId,
      tenantId,
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
   * Check if menu belongs to tenant
   */
  async verifyMenuOwnership(menuId: string, tenantId: string): Promise<boolean> {
    const menu = await prisma.menu.findFirst({
      where: { id: menuId, tenantId },
    });

    return !!menu;
  }
}
