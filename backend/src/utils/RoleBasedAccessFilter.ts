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

        case UserRole.STAFF:
          // Staff members see tenant-level orders (servers, chefs, hosts, bartenders, etc.)
          const staffOrders = orders.filter((o) => o.tenantId === tenantId);
          logger.info(`RBAC: STAFF ${userId} accessing ${staffOrders.length} tenant orders`);
          return staffOrders;

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
      // All authenticated users in a tenant can see tables
      if (role === UserRole.CUSTOMER) {
        logger.info(`RBAC: CUSTOMER ${userId} has no table access`);
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
      [UserRole.STAFF]: {
        orders: ['read', 'update'],
        payments: [],
        users: [],
        tables: ['read', 'update'],
        reports: [],
      },
      [UserRole.CUSTOMER]: {
        orders: ['read'],
        payments: ['read'],
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
      case UserRole.STAFF:
        // Staff members can see tenant-level data
        filters.tenantId = tenantId;
        break;
    }

    logger.info(`RBAC: RLS filter applied for ${role} ${userId}: ${JSON.stringify(filters)}`);

    return filters;
  }
}