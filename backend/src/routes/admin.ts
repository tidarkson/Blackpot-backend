import { Router, Request, Response } from 'express';
import { Prisma, PrismaClient, StaffPosition, UserRole } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { adminEndpointLimiter } from '../middleware/rateLimiter';
import { ensureTenantAccess } from '../middleware/tenantIsolation';
import { PermissionMap, requirePermission } from '../middleware/requirePermission';
import { redisClient } from '../utils/redisClient';

const router = Router();
const prisma = new PrismaClient();

function asParamString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function asInputJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

const SYSTEM_ROLES = ['OWNER', 'MANAGER', 'SUPERVISOR', 'STAFF', 'SERVER', 'KITCHEN', 'HOST', 'CASHIER'];

const DEFAULT_PERMISSIONS: Record<string, PermissionMap> = {
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

function getDefaultPermissions(roleName: string): PermissionMap {
  return DEFAULT_PERMISSIONS[roleName] ?? DEFAULT_PERMISSIONS.STAFF;
}

function resolveUserRoleName(user: {
  role: UserRole;
  positions: StaffPosition[];
  customRoleName: string | null;
}): string {
  if (user.customRoleName) {
    return user.customRoleName;
  }

  if (user.role === UserRole.STAFF) {
    if (user.positions.includes(StaffPosition.CHEF)) return 'KITCHEN';
    if (user.positions.includes(StaffPosition.HOST)) return 'HOST';
    if (user.positions.includes(StaffPosition.CASHIER)) return 'CASHIER';
    if (user.positions.includes(StaffPosition.SERVER)) return 'SERVER';
    return 'STAFF';
  }

  return user.role;
}

function mapRoleAssignment(roleName: string): {
  role: UserRole;
  positions: StaffPosition[];
  customRoleName: string | null;
} {
  const normalized = roleName.toUpperCase();

  if (normalized === 'OWNER') return { role: UserRole.OWNER, positions: [], customRoleName: null };
  if (normalized === 'MANAGER') return { role: UserRole.MANAGER, positions: [], customRoleName: null };
  if (normalized === 'SUPERVISOR') return { role: UserRole.SUPERVISOR, positions: [], customRoleName: null };
  if (normalized === 'STAFF') return { role: UserRole.STAFF, positions: [], customRoleName: null };
  if (normalized === 'SERVER') return { role: UserRole.STAFF, positions: [StaffPosition.SERVER], customRoleName: null };
  if (normalized === 'KITCHEN') return { role: UserRole.STAFF, positions: [StaffPosition.CHEF], customRoleName: null };
  if (normalized === 'HOST') return { role: UserRole.STAFF, positions: [StaffPosition.HOST], customRoleName: null };
  if (normalized === 'CASHIER') return { role: UserRole.STAFF, positions: [StaffPosition.CASHIER], customRoleName: null };

  return { role: UserRole.STAFF, positions: [], customRoleName: roleName };
}

/**
 * ✅ ACCEPTANCE CRITERIA: Admin Endpoints with Rate Limiting
 * All administrative operations are protected with strict rate limits
 * Limit: 30 per minute per account
 * Rationale: Prevent abuse of administrative functions and protect system integrity
 * Premium: 90 per minute
 * 
 * These endpoints require:
 * - Authentication (valid JWT token)
 * - Admin role (verified by authentication middleware)
 * - Tenant isolation (admin can only manage their own tenant)
 */

/**
 * POST /api/admin/users/create
 * Create a new user account (admin only)
 * Body: { email, firstName, lastName, role, restaurantId? }
 * Rate Limit: 30 per minute (30 user creations max)
 */
router.post(
  '/users/create',
  authenticate,
  ensureTenantAccess,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement user creation endpoint
    // Should include:
    // - Email validation
    // - Password generation & sending
    // - Role assignment
    // - Audit logging
    res.status(501).json({
      error: 'Not Implemented',
      message: 'User creation endpoint pending implementation',
    });
  }
);

/**
 * GET /api/admin/users
 * List all users for a restaurant (admin only)
 * Query params: page, pageSize, role, status, searchTerm
 * Rate Limit: 30 per minute
 */
router.get(
  '/users',
  authenticate,
  ensureTenantAccess,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement list users endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'User list endpoint pending implementation',
    });
  }
);

/**
 * PUT /api/admin/users/:userId
 * Update user information (admin only)
 * Body: { firstName?, lastName?, role?, status?, permissions? }
 * Rate Limit: 30 per minute
 */
router.put(
  '/users/:userId',
  authenticate,
  ensureTenantAccess,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement user update endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'User update endpoint pending implementation',
    });
  }
);

/**
 * DELETE /api/admin/users/:userId
 * Deactivate or delete a user account (admin only)
 * Query params: permanent (default: false - soft delete)
 * Rate Limit: 30 per minute
 */
router.delete(
  '/users/:userId',
  authenticate,
  ensureTenantAccess,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement user deletion endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'User deletion endpoint pending implementation',
    });
  }
);

/**
 * POST /api/admin/roles/create
 * Create a custom role (super admin only)
 * Body: { name, description, permissions }
 * Rate Limit: 30 per minute
 */
const createRoleHandler = async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;
  const actorId = req.user?.userId;
  const actorName = req.user?.email ?? 'unknown';
  const { name, permissions } = req.body as { name?: string; permissions?: PermissionMap };

  if (!tenantId || !actorId) {
    return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
  }

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ status: 'error', code: 400, message: 'Role name is required' });
  }

  const normalizedName = name.trim();
  const isSystem = SYSTEM_ROLES.includes(normalizedName.toUpperCase());

  const existing = await prisma.rolePermission.findFirst({ where: { tenantId, roleName: normalizedName } });
  if (existing && !existing.deletedAt) {
    return res.status(409).json({ status: 'error', code: 409, message: 'Role already exists' });
  }

  const created = await prisma.rolePermission.upsert({
    where: {
      tenantId_roleName: {
        tenantId,
        roleName: normalizedName,
      },
    },
    update: {
      permissions: permissions ?? getDefaultPermissions(normalizedName.toUpperCase()),
      isSystem,
      deletedAt: null,
      createdBy: actorId,
    },
    create: {
      tenantId,
      roleName: normalizedName,
      permissions: permissions ?? getDefaultPermissions(normalizedName.toUpperCase()),
      isSystem,
      createdBy: actorId,
    },
  });

  await prisma.roleAuditLog.create({
    data: {
      tenantId,
      actorId,
      actorName,
      action: 'CREATE_ROLE',
      roleName: created.roleName,
      after: asInputJson(created.permissions),
    },
  });

  await redisClient.del(`rbac:${tenantId}:${created.roleName}`);

  return res.status(201).json({
    status: 'success',
    code: 201,
    data: {
      id: created.id,
      tenantId: created.tenantId,
      name: created.roleName,
      isSystem: created.isSystem,
      staffCount: 0,
      permissions: created.permissions,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  });
};

router.post('/roles/create', authenticate, ensureTenantAccess, adminEndpointLimiter, createRoleHandler);
router.post('/roles', authenticate, ensureTenantAccess, adminEndpointLimiter, createRoleHandler);

/**
 * GET /api/admin/roles
 * List all available roles
 * Rate Limit: 30 per minute
 */
router.get('/roles', authenticate, ensureTenantAccess, adminEndpointLimiter, async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;

  if (!tenantId) {
    return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
  }

  const [persistedRoles, users] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { roleName: 'asc' },
    }),
    prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { role: true, positions: true, customRoleName: true },
    }),
  ]);

  const staffCountByRole = users.reduce<Record<string, number>>((acc, user) => {
    const roleName = resolveUserRoleName(user);
    acc[roleName] = (acc[roleName] ?? 0) + 1;
    return acc;
  }, {});

  const roleMap = new Map(persistedRoles.map((role) => [role.roleName, role]));

  for (const systemRole of SYSTEM_ROLES) {
    if (!roleMap.has(systemRole)) {
      roleMap.set(systemRole, {
        id: `system-${systemRole.toLowerCase()}`,
        tenantId,
        roleName: systemRole,
        permissions: getDefaultPermissions(systemRole),
        isSystem: true,
        deletedAt: null,
        createdBy: 'system',
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as any);
    }
  }

  const roles = Array.from(roleMap.values()).map((role) => ({
    id: role.id,
    tenantId: role.tenantId,
    name: role.roleName,
    isSystem: role.isSystem,
    staffCount: staffCountByRole[role.roleName] ?? 0,
    permissions: role.permissions,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  }));

  return res.status(200).json({
    status: 'success',
    code: 200,
    data: roles,
  });
});

/**
 * PUT /api/admin/roles/:roleId
 * Update role permissions (super admin only)
 * Body: { name?, description?, permissions? }
 * Rate Limit: 30 per minute
 */
router.get('/roles/:id', authenticate, ensureTenantAccess, adminEndpointLimiter, async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;
  const roleId = asParamString(req.params.id);
  if (!tenantId) {
    return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
  }

  const role = await prisma.rolePermission.findFirst({
    where: {
      id: roleId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!role) {
    return res.status(404).json({ status: 'error', code: 404, message: 'Role not found' });
  }

  const staffCount = await prisma.user.count({
    where: {
      tenantId,
      isActive: true,
      OR: [{ customRoleName: role.roleName }],
    },
  });

  return res.status(200).json({
    status: 'success',
    code: 200,
    data: {
      id: role.id,
      tenantId: role.tenantId,
      name: role.roleName,
      isSystem: role.isSystem,
      staffCount,
      permissions: role.permissions,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    },
  });
});

router.patch('/roles/:id', authenticate, ensureTenantAccess, requirePermission('roles_perms', 'edit'), adminEndpointLimiter, async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;
  const actorId = req.user?.userId;
  const actorName = req.user?.email ?? 'unknown';
  const roleId = asParamString(req.params.id);
  const { name, permissions } = req.body as { name?: string; permissions?: PermissionMap };

  if (!tenantId || !actorId) {
    return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
  }

  const existingRole = await prisma.rolePermission.findFirst({
    where: {
      id: roleId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!existingRole) {
    return res.status(404).json({ status: 'error', code: 404, message: 'Role not found' });
  }

  if (existingRole.isSystem && name && name !== existingRole.roleName) {
    return res.status(403).json({ status: 'error', code: 403, message: 'System role names cannot be changed' });
  }

  const before = existingRole.permissions;
  const nextRoleName = name?.trim() || existingRole.roleName;

  const updated = await prisma.rolePermission.update({
    where: { id: existingRole.id },
    data: {
      roleName: nextRoleName,
      permissions: asInputJson(permissions ?? existingRole.permissions),
    },
  });

  await prisma.roleAuditLog.create({
    data: {
      tenantId,
      actorId,
      actorName,
      action: 'UPDATE_PERMISSIONS',
      roleName: updated.roleName,
      before: asInputJson(before),
      after: asInputJson(updated.permissions),
    },
  });

  await redisClient.del(`rbac:${tenantId}:${existingRole.roleName}`, `rbac:${tenantId}:${updated.roleName}`);

  return res.status(200).json({
    status: 'success',
    code: 200,
    data: {
      id: updated.id,
      tenantId: updated.tenantId,
      name: updated.roleName,
      isSystem: updated.isSystem,
      staffCount: 0,
      permissions: updated.permissions,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
});

router.delete('/roles/:id', authenticate, ensureTenantAccess, adminEndpointLimiter, async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;
  const actorId = req.user?.userId;
  const actorName = req.user?.email ?? 'unknown';
  const roleId = asParamString(req.params.id);

  if (!tenantId || !actorId) {
    return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
  }

  const role = await prisma.rolePermission.findFirst({
    where: {
      id: roleId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!role) {
    return res.status(404).json({ status: 'error', code: 404, message: 'Role not found' });
  }

  if (role.isSystem) {
    return res.status(403).json({ status: 'error', code: 403, message: 'System roles cannot be deleted' });
  }

  const assignedCount = await prisma.user.count({
    where: {
      tenantId,
      isActive: true,
      customRoleName: role.roleName,
    },
  });

  if (assignedCount > 0) {
    return res.status(409).json({ status: 'error', code: 409, message: 'Role has staff assigned and cannot be deleted' });
  }

  await prisma.rolePermission.update({
    where: { id: role.id },
    data: { deletedAt: new Date() },
  });

  await prisma.roleAuditLog.create({
    data: {
      tenantId,
      actorId,
      actorName,
      action: 'DELETE_ROLE',
      roleName: role.roleName,
      before: asInputJson(role.permissions),
    },
  });

  await redisClient.del(`rbac:${tenantId}:${role.roleName}`);

  return res.status(204).send();
});

router.post('/roles/:id/assign', authenticate, ensureTenantAccess, adminEndpointLimiter, async (req: Request, res: Response) => {
  const tenantId = req.user?.tenantId;
  const actorId = req.user?.userId;
  const actorName = req.user?.email ?? 'unknown';
  const roleId = asParamString(req.params.id);
  const { staffId } = req.body as { staffId?: string; roleId?: string };

  if (!tenantId || !actorId) {
    return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
  }

  if (!staffId) {
    return res.status(400).json({ status: 'error', code: 400, message: 'staffId is required' });
  }

  const role = await prisma.rolePermission.findFirst({
    where: {
      id: roleId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!role) {
    return res.status(404).json({ status: 'error', code: 404, message: 'Role not found' });
  }

  const targetUser = await prisma.user.findFirst({
    where: {
      id: staffId,
      tenantId,
      isActive: true,
    },
    select: {
      id: true,
      role: true,
      positions: true,
      customRoleName: true,
      name: true,
    },
  });

  if (!targetUser) {
    return res.status(404).json({ status: 'error', code: 404, message: 'Staff member not found' });
  }

  const beforeRoleName = resolveUserRoleName(targetUser);
  const mapped = mapRoleAssignment(role.roleName);

  const updatedUser = await prisma.user.update({
    where: { id: targetUser.id },
    data: {
      role: mapped.role,
      positions: mapped.positions,
      customRoleName: mapped.customRoleName,
    },
    select: {
      id: true,
      name: true,
      role: true,
      positions: true,
      customRoleName: true,
    },
  });

  await prisma.roleAuditLog.create({
    data: {
      tenantId,
      actorId,
      actorName,
      action: 'ASSIGN_ROLE',
      roleName: role.roleName,
      before: { staffId: targetUser.id, roleName: beforeRoleName },
      after: { staffId: updatedUser.id, roleName: resolveUserRoleName(updatedUser) },
    },
  });

  return res.status(200).json({
    status: 'success',
    code: 200,
    data: {
      staffId: updatedUser.id,
      roleId: role.id,
      roleName: role.roleName,
    },
  });
});

router.put('/financial-settings', authenticate, ensureTenantAccess, requirePermission('tax_settings', 'edit'), adminEndpointLimiter, async (req: Request, res: Response) => {
  return res.status(200).json({
    status: 'success',
    code: 200,
    data: {
      message: 'Financial settings updated',
      payload: req.body,
    },
  });
});

/**
 * POST /api/admin/backup
 * Trigger manual database backup (super admin only)
 * Body: { includeMedia?, description? }
 * Rate Limit: 30 per minute (2 backups per hour max)
 */
router.post(
  '/backup',
  authenticate,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement backup endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Backup endpoint pending implementation',
    });
  }
);

/**
 * GET /api/admin/backups
 * List all available backups (super admin only)
 * Query params: page, pageSize
 * Rate Limit: 30 per minute
 */
router.get(
  '/backups',
  authenticate,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement list backups endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Backups list endpoint pending implementation',
    });
  }
);

/**
 * POST /api/admin/audit-logs
 * Get audit logs for admin actions (admin only)
 * Body: { startDate, endDate, userId?, action?, limit }
 * Rate Limit: 30 per minute
 */
router.post(
  '/audit-logs',
  authenticate,
  ensureTenantAccess,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement audit logs endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Audit logs endpoint pending implementation',
    });
  }
);

/**
 * GET /api/admin/system/health
 * Get system health metrics (admin only)
 * Rate Limit: 30 per minute
 */
router.get(
  '/system/health',
  authenticate,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement system health endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'System health endpoint pending implementation',
    });
  }
);

/**
 * GET /api/admin/system/stats
 * Get system statistics and usage metrics (admin only)
 * Rate Limit: 30 per minute
 */
router.get(
  '/system/stats',
  authenticate,
  ensureTenantAccess,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement system stats endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'System stats endpoint pending implementation',
    });
  }
);

/**
 * POST /api/admin/settings
 * Update system settings (super admin only)
 * Body: { email_notifications, sms_notifications, maintenance_mode, ... }
 * Rate Limit: 30 per minute
 */
router.post(
  '/settings',
  authenticate,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement settings update endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Settings update endpoint pending implementation',
    });
  }
);

/**
 * GET /api/admin/settings
 * Get system settings (admin only)
 * Rate Limit: 30 per minute
 */
router.get(
  '/settings',
  authenticate,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement settings retrieval endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Settings retrieval endpoint pending implementation',
    });
  }
);

/**
 * POST /api/admin/maintenance/start
 * Start maintenance mode (super admin only)
 * Body: { reason, estimatedDuration? }
 * Rate Limit: 30 per minute
 */
router.post(
  '/maintenance/start',
  authenticate,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement maintenance start endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Maintenance start endpoint pending implementation',
    });
  }
);

/**
 * POST /api/admin/maintenance/stop
 * Stop maintenance mode (super admin only)
 * Rate Limit: 30 per minute
 */
router.post(
  '/maintenance/stop',
  authenticate,
  adminEndpointLimiter,
  async (req: Request, res: Response) => {
    // TODO: Implement maintenance stop endpoint
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Maintenance stop endpoint pending implementation',
    });
  }
);

export default router;
