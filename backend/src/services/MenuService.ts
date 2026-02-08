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

  /**
   * Add section to menu
   */
  async addSection(
    menuId: string,
    tenantId: string,
    data: {
      name: string;
      position?: number;
    }
  ) {
    // Validate menu exists
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Section name is required');
    }

    const menu = await prisma.menu.findFirst({
      where: { id: menuId, tenantId },
    });

    if (!menu) {
      throw new Error('Menu not found');
    }

    // Get max position
    const maxPosition = await prisma.menuSection.aggregate({
      where: { menuId },
      _max: { position: true },
    });

    const position = data.position ?? ((maxPosition._max.position ?? 0) + 1);

    const section = await prisma.menuSection.create({
      data: {
        tenantId,
        menuId,
        name: data.name,
        position,
      },
    });

    return section;
  }

  /**
   * Activate menu (switch active menu, deactivate others)
   */
  async activateMenu(menuId: string, tenantId: string) {
    // Verify menu exists
    const menu = await prisma.menu.findFirst({
      where: { id: menuId, tenantId },
    });

    if (!menu) {
      throw new Error('Menu not found');
    }

    // Deactivate all other menus
    await prisma.menu.updateMany({
      where: { tenantId, isActive: true },
      data: { isActive: false },
    });

    // Activate the target menu
    const activated = await prisma.menu.update({
      where: { id: menuId },
      data: {
        isActive: true,
        effectiveAt: new Date(),
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

    // Log the activity
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'MENU_ACTIVATED',
        entity: 'Menu',
        entityId: menuId,
        metadata: {
          menuName: menu.name,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return activated;
  }

  /**
   * Get the active menu for the tenant
   */
  async getActiveMenu(tenantId: string) {
    const menu = await prisma.menu.findFirst({
      where: {
        tenantId,
        isActive: true,
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
   * Soft delete menu (mark as inactive instead of hard delete)
   */
  async softDeleteMenu(menuId: string, tenantId: string) {
    // Verify menu exists
    const menu = await prisma.menu.findFirst({
      where: { id: menuId, tenantId },
    });

    if (!menu) {
      throw new Error('Menu not found');
    }

    // Prevent deletion if menu is active
    if (menu.isActive) {
      throw new Error('Cannot delete active menu. Deactivate it first.');
    }

    // Mark as inactive (soft delete)
    const deleted = await prisma.menu.update({
      where: { id: menuId },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    // Log the activity
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'MENU_DELETED',
        entity: 'Menu',
        entityId: menuId,
        metadata: {
          menuName: menu.name,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return deleted;
  }

  /**
   * Log menu change
   */
  async logMenuChange(
    tenantId: string,
    menuId: string,
    action: string,
    metadata?: any
  ) {
    return await prisma.activityLog.create({
      data: {
        tenantId,
        action,
        entity: 'Menu',
        entityId: menuId,
        metadata,
      },
    });
  }
}
