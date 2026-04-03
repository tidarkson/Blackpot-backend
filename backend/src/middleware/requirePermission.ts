import { NextFunction, Request, Response } from 'express';
import { PrismaClient, StaffPosition, UserRole } from '@prisma/client';
import { redisClient } from '../utils/redisClient';

const prisma = new PrismaClient();
const CACHE_TTL_SECONDS = 60;

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve';
export type PermissionMap = Record<string, Record<PermissionAction, boolean>>;

const defaultPermissionsByRole: Record<string, PermissionMap> = {
  OWNER: {
    refunds: { view: true, create: true, edit: true, delete: true, approve: true },
    menu_items: { view: true, create: true, edit: true, delete: true, approve: true },
    tax_settings: { view: true, create: true, edit: true, delete: true, approve: true },
    payroll: { view: true, create: true, edit: true, delete: true, approve: true },
    roles_perms: { view: true, create: true, edit: true, delete: true, approve: true },
  },
  MANAGER: {
    refunds: { view: true, create: true, edit: true, delete: false, approve: true },
    menu_items: { view: true, create: true, edit: true, delete: true, approve: true },
    tax_settings: { view: true, create: false, edit: true, delete: false, approve: true },
    payroll: { view: true, create: false, edit: true, delete: false, approve: true },
    roles_perms: { view: true, create: true, edit: true, delete: false, approve: true },
  },
  SUPERVISOR: {
    refunds: { view: true, create: false, edit: false, delete: false, approve: false },
    menu_items: { view: true, create: false, edit: true, delete: false, approve: false },
    tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
    payroll: { view: true, create: false, edit: false, delete: false, approve: false },
    roles_perms: { view: true, create: false, edit: false, delete: false, approve: false },
  },
  STAFF: {
    refunds: { view: true, create: false, edit: false, delete: false, approve: false },
    menu_items: { view: true, create: false, edit: false, delete: false, approve: false },
    tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
    payroll: { view: false, create: false, edit: false, delete: false, approve: false },
    roles_perms: { view: false, create: false, edit: false, delete: false, approve: false },
  },
  SERVER: {
    refunds: { view: true, create: false, edit: false, delete: false, approve: false },
    menu_items: { view: true, create: false, edit: false, delete: false, approve: false },
    tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
    payroll: { view: false, create: false, edit: false, delete: false, approve: false },
    roles_perms: { view: false, create: false, edit: false, delete: false, approve: false },
  },
  KITCHEN: {
    refunds: { view: false, create: false, edit: false, delete: false, approve: false },
    menu_items: { view: true, create: false, edit: true, delete: false, approve: false },
    tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
    payroll: { view: false, create: false, edit: false, delete: false, approve: false },
    roles_perms: { view: false, create: false, edit: false, delete: false, approve: false },
  },
  HOST: {
    refunds: { view: false, create: false, edit: false, delete: false, approve: false },
    menu_items: { view: true, create: false, edit: false, delete: false, approve: false },
    tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
    payroll: { view: false, create: false, edit: false, delete: false, approve: false },
    roles_perms: { view: false, create: false, edit: false, delete: false, approve: false },
  },
  CASHIER: {
    refunds: { view: true, create: false, edit: false, delete: false, approve: false },
    menu_items: { view: true, create: false, edit: false, delete: false, approve: false },
    tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
    payroll: { view: false, create: false, edit: false, delete: false, approve: false },
    roles_perms: { view: false, create: false, edit: false, delete: false, approve: false },
  },
};

function mapClientRole(role: UserRole, positions: StaffPosition[]): string {
  if (role === UserRole.STAFF) {
    if (positions.includes(StaffPosition.CHEF)) return 'KITCHEN';
    if (positions.includes(StaffPosition.HOST)) return 'HOST';
    if (positions.includes(StaffPosition.CASHIER)) return 'CASHIER';
    if (positions.includes(StaffPosition.SERVER)) return 'SERVER';
    return 'STAFF';
  }

  return role;
}

function getDefaultPermissions(roleName: string): PermissionMap {
  return defaultPermissionsByRole[roleName.toUpperCase()] ?? defaultPermissionsByRole.STAFF;
}

async function resolveRoleName(tenantId: string, userId: string, fallbackRole: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
    },
    select: {
      role: true,
      positions: true,
      customRoleName: true,
    },
  });

  if (!user) {
    return fallbackRole;
  }

  if (user.customRoleName) {
    return user.customRoleName;
  }

  return mapClientRole(user.role, user.positions);
}

export async function getRolePermissions(tenantId: string, roleName: string): Promise<PermissionMap> {
  const cacheKey = `rbac:${tenantId}:${roleName}`;
  const cached = await redisClient.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached) as PermissionMap;
    } catch {
      // Ignore cache parse failures and continue with DB read.
    }
  }

  const rolePermission = await prisma.rolePermission.findFirst({
    where: {
      tenantId,
      roleName,
      deletedAt: null,
    },
    select: {
      permissions: true,
    },
  });

  const resolved = (rolePermission?.permissions as PermissionMap | undefined) ?? getDefaultPermissions(roleName);

  await redisClient.set(cacheKey, JSON.stringify(resolved), CACHE_TTL_SECONDS);
  return resolved;
}

export function requirePermission(resource: string, action: PermissionAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
          code: 401,
        });
      }

      const roleName = await resolveRoleName(user.tenantId, user.userId, String(user.role));
      const permissions = await getRolePermissions(user.tenantId, roleName);

      if (!permissions?.[resource]?.[action]) {
        return res.status(403).json({
          status: 'error',
          message: 'Forbidden',
          code: 403,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
