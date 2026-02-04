import { UserRole } from '@prisma/client';
import logger from '../config/logger';

export interface FilterOptions {
  userId: string;
  role: UserRole;
  tenantId: string;
}

export class RoleBasedAccessFilter {
  /**
   * Filter orders based on user role
   * - OWNER: Can see all orders across all locations
   * - MANAGER: Can see all orders in their tenant
   * - SUPERVISOR: Can see orders in their supervised area
   * - SERVER: Can only see orders for tables they're serving
   * - CHEF: Can see orders assigned to their kitchen station
   * - HOST: Can see all orders (front-of-house)
   * - SOMMELIER: Can see all orders (beverage service)
   * - DISHWASHER: No order access
   * - BARTENDER: Can see all orders (beverage-related)
   */
  async filterOrders(orders: any[], options: FilterOptions): Promise<any[]> {
    const { userId, role, tenantId } = options;

    try {
      switch (role) {
        case UserRole.OWNER:
          // Owners see all orders
          logger.info(`RBAC: OWNER ${userId} accessing all orders`);
          return orders;

        case UserRole.MANAGER:
          // Managers see all orders in their tenant
          const managerOrders = orders.filter((o) => o.tenantId === tenantId);
          logger.info(`RBAC: MANAGER ${userId} accessing ${managerOrders.length} tenant orders`);
          return managerOrders;

        case UserRole.SUPERVISOR:
          // Supervisors see orders in their tenant (can supervise multiple areas)
          const supervisorOrders = orders.filter((o) => o.tenantId === tenantId);
          logger.info(`RBAC: SUPERVISOR ${userId} accessing ${supervisorOrders.length} tenant orders`);
          return supervisorOrders;

        case UserRole.SERVER:
          // Servers see only orders for tables they're serving
          const serverOrders = orders.filter((o) => {
            return o.serverId === userId && o.tenantId === tenantId;
          });
          logger.info(`RBAC: SERVER ${userId} accessing ${serverOrders.length} assigned orders`);
          return serverOrders;

        case UserRole.CHEF:
          // Chefs see orders with items assigned to their kitchen station
          const chefOrders = orders.filter((o) => {
            return (
              o.tenantId === tenantId &&
              o.courses.some(
                (course: any) =>
                  course.kitchenStationId === userId || course.kitchenStationId === null
              )
            );
          });
          logger.info(`RBAC: CHEF ${userId} accessing ${chefOrders.length} kitchen orders`);
          return chefOrders;

        case UserRole.HOST:
          // Hosts see all orders (front desk, seating)
          const hostOrders = orders.filter((o) => o.tenantId === tenantId);
          logger.info(`RBAC: HOST ${userId} accessing ${hostOrders.length} orders`);
          return hostOrders;

        case UserRole.SOMMELIER:
          // Sommeliers see all orders (wine/beverage service)
          const sommelierOrders = orders.filter((o) => o.tenantId === tenantId);
          logger.info(`RBAC: SOMMELIER ${userId} accessing ${sommelierOrders.length} orders`);
          return sommelierOrders;

        case UserRole.BARTENDER:
          // Bartenders see all orders (beverage orders)
          const bartenderOrders = orders.filter((o) => o.tenantId === tenantId);
          logger.info(`RBAC: BARTENDER ${userId} accessing ${bartenderOrders.length} orders`);
          return bartenderOrders;

        case UserRole.DISHWASHER:
          // Dishwashers have no order visibility
          logger.info(`RBAC: DISHWASHER ${userId} has no order access`);
          return [];

        default:
          logger.warn(`RBAC: Unknown role ${role} for user ${userId}`);
          return [];
      }
    } catch (error: any) {
      logger.error('Error filtering orders:', error.message);
      throw error;
    }
  }

  /**
   * Filter users based on user role
   */
  async filterUsers(users: any[], options: FilterOptions): Promise<any[]> {
    const { userId, role, tenantId } = options;

    try {
      switch (role) {
        case UserRole.OWNER:
          // Owners see all users
          return users;

        case UserRole.MANAGER:
        case UserRole.SUPERVISOR:
          // Managers and supervisors see all users in their tenant
          return users.filter((u) => u.tenantId === tenantId);

        default:
          // Other roles can only see themselves
          return users.filter((u) => u.id === userId);
      }
    } catch (error: any) {
      logger.error('Error filtering users:', error.message);
      throw error;
    }
  }

  /**
   * Filter tables based on user role
   */
  async filterTables(tables: any[], options: FilterOptions): Promise<any[]> {
    const { userId, role, tenantId } = options;

    try {
      // All authenticated users in a tenant can see tables (except DISHWASHER)
      if (role === UserRole.DISHWASHER) {
        logger.info(`RBAC: DISHWASHER ${userId} has no table access`);
        return [];
      }

      const filteredTables = tables.filter((t) => t.tenantId === tenantId);
      logger.info(`RBAC: ${role} ${userId} accessing ${filteredTables.length} tables`);
      return filteredTables;
    } catch (error: any) {
      logger.error('Error filtering tables:', error.message);
      throw error;
    }
  }

  /**
   * Filter reports based on user role
   */
  async filterReports(reports: any[], options: FilterOptions): Promise<any[]> {
    const { userId, role, tenantId } = options;

    try {
      switch (role) {
        case UserRole.OWNER:
          // Owners see all reports
          return reports;

        case UserRole.MANAGER:
        case UserRole.SUPERVISOR:
          // Managers and supervisors see tenant reports
          return reports.filter((r) => r.tenantId === tenantId);

        default:
          // Other roles have no access to reports
          logger.warn(`RBAC: ${role} ${userId} denied access to reports`);
          return [];
      }
    } catch (error: any) {
      logger.error('Error filtering reports:', error.message);
      throw error;
    }
  }

  /**
   * Check if user has permission for specific action
   */
  async checkPermission(
    resource: string,
    action: string,
    options: FilterOptions
  ): Promise<boolean> {
    const { userId, role } = options;

    const permissionMatrix: Record<UserRole, Record<string, string[]>> = {
      [UserRole.OWNER]: {
        orders: ['create', 'read', 'update', 'delete'],
        payments: ['create', 'read', 'update', 'delete'],
        users: ['create', 'read', 'update', 'delete'],
        tables: ['create', 'read', 'update', 'delete'],
        reports: ['create', 'read', 'update', 'delete'],
      },
      [UserRole.MANAGER]: {
        orders: ['create', 'read', 'update'],
        payments: ['create', 'read', 'update'],
        users: ['read'],
        tables: ['read', 'update'],
        reports: ['read'],
      },
      [UserRole.SUPERVISOR]: {
        orders: ['read', 'update'],
        payments: ['read'],
        users: ['read'],
        tables: ['read', 'update'],
        reports: ['read'],
      },
      [UserRole.SERVER]: {
        orders: ['read', 'update'],
        payments: ['create', 'read'],
        users: [],
        tables: ['read'],
        reports: [],
      },
      [UserRole.CHEF]: {
        orders: ['read'],
        payments: [],
        users: [],
        tables: [],
        reports: [],
      },
      [UserRole.HOST]: {
        orders: ['create', 'read', 'update'],
        payments: [],
        users: [],
        tables: ['read', 'update'],
        reports: [],
      },
      [UserRole.SOMMELIER]: {
        orders: ['read'],
        payments: [],
        users: [],
        tables: ['read'],
        reports: [],
      },
      [UserRole.BARTENDER]: {
        orders: ['read'],
        payments: [],
        users: [],
        tables: ['read'],
        reports: [],
      },
      [UserRole.DISHWASHER]: {
        orders: [],
        payments: [],
        users: [],
        tables: [],
        reports: [],
      },
    };

    try {
      const allowedActions = permissionMatrix[role]?.[resource] || [];
      const hasPermission = allowedActions.includes(action);

      if (!hasPermission) {
        logger.warn(`RBAC: ${role} ${userId} denied access to ${action} on ${resource}`);
      }

      return hasPermission;
    } catch (error: any) {
      logger.error('Error checking permission:', error.message);
      throw error;
    }
  }

  /**
   * Apply row-level security filters
   */
  applyRLSFilter(options: FilterOptions): Record<string, any> {
    const { userId, role, tenantId } = options;

    const filters: Record<string, any> = {
      tenantId, // All queries must be tenant-scoped
    };

    // Add role-specific filters
    switch (role) {
      case UserRole.SERVER:
        filters.serverId = userId;
        break;
      case UserRole.CHEF:
        // Chefs can see orders with items in their kitchen station
        filters.courses = {
          some: {
            OR: [
              { kitchenStationId: userId },
              { kitchenStationId: null }, // Unassigned items
            ],
          },
        };
        break;
    }

    logger.info(`RBAC: RLS filter applied for ${role} ${userId}: ${JSON.stringify(filters)}`);

    return filters;
  }
}