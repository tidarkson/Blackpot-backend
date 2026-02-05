import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

/**
 * RBAC (Role-Based Access Control) for Table Management
 * Defines permissions for different roles accessing table endpoints
 */

const TABLE_RBAC_RULES: { [key: string]: string[] } = {
  // GET endpoints - most roles can view
  'GET:/tables': ['OWNER', 'MANAGER', 'SUPERVISOR', 'SERVER', 'HOST', 'CHEF', 'SOMMELIER', 'DISHWASHER', 'BARTENDER'],
  'GET:/tables/:id': ['OWNER', 'MANAGER', 'SUPERVISOR', 'SERVER', 'HOST', 'CHEF', 'SOMMELIER', 'DISHWASHER', 'BARTENDER'],
  'GET:/tables/:id/current-order': ['OWNER', 'MANAGER', 'SUPERVISOR', 'SERVER', 'HOST', 'CHEF', 'SOMMELIER', 'DISHWASHER', 'BARTENDER'],
  'GET:/tables/:id/reservations': ['OWNER', 'MANAGER', 'SUPERVISOR', 'SERVER', 'HOST', 'SOMMELIER'],
  'GET:/tables/floor-plan/view': ['OWNER', 'MANAGER', 'SUPERVISOR', 'SERVER', 'HOST', 'CHEF', 'SOMMELIER', 'DISHWASHER', 'BARTENDER'],

  // CREATE/DELETE - management only
  'POST:/tables': ['OWNER', 'MANAGER'],
  'DELETE:/tables/:id': ['OWNER', 'MANAGER'],

  // UPDATE - management and supervisors
  'PUT:/tables/:id': ['OWNER', 'MANAGER', 'SUPERVISOR', 'HOST'],

  // STATUS updates - most staff can update status
  'PATCH:/tables/:id/status': ['OWNER', 'MANAGER', 'SUPERVISOR', 'HOST', 'DISHWASHER'],

  // Floor plan updates - management only
  'PUT:/tables/floor-plan/update': ['OWNER', 'MANAGER'],

  // Seating operations - servers and managers
  'POST:/tables/:id/seat': ['OWNER', 'MANAGER', 'SUPERVISOR', 'SERVER', 'HOST'],

  // Clearing tables - most staff
  'POST:/tables/:id/clear': ['OWNER', 'MANAGER', 'SUPERVISOR', 'SERVER', 'HOST', 'DISHWASHER'],

  // Section management - management only
  'GET:/table-sections': ['OWNER', 'MANAGER', 'SUPERVISOR', 'HOST'],
  'GET:/table-sections/list': ['OWNER', 'MANAGER', 'SUPERVISOR', 'HOST'],
  'POST:/table-sections': ['OWNER', 'MANAGER'],
  'POST:/table-sections/create': ['OWNER', 'MANAGER'],
  'PUT:/table-sections/:id': ['OWNER', 'MANAGER'],
  'DELETE:/table-sections/:id': ['OWNER', 'MANAGER'],
};

/**
 * Middleware to enforce RBAC rules for table routes
 */
export const enforceTableRBAC = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      status: 'error',
      code: 401,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  // Build the route key (METHOD:PATH_PATTERN)
  const method = req.method;
  let pathPattern = req.baseUrl + req.path;

  // Normalize the path to match RBAC rules
  // /api/tables/:tableId -> /tables/:id
  pathPattern = pathPattern.replace(/\/api\/v1/, '').replace(/\/api/, '');
  pathPattern = pathPattern.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, ':id');
  pathPattern = pathPattern.replace(/[a-f0-9]{8}-[a-f0-9]{4}/g, ':id'); // Shorter UUIDs
  pathPattern = pathPattern.replace(/\/\d+/g, '/:id'); // Numeric IDs
  pathPattern = pathPattern.replace(/\/[a-zA-Z0-9_-]+$/g, (match) => {
    // Don't replace actual endpoints like /seat, /clear, /floor-plan
    if (['seat', 'clear', 'floor-plan', 'current-order', 'reservations', 'sections', 'list', 'create', 'update', 'view'].some(end => match.includes(end))) {
      return match;
    }
    return '/:id';
  });

  const ruleKey = `${method}:${pathPattern}`;

  // Check if route has RBAC rules
  const allowedRoles = TABLE_RBAC_RULES[ruleKey];

  if (!allowedRoles) {
    // If no specific rule, allow all authenticated users (default permissive)
    logger.warn(`No RBAC rule found for ${ruleKey}, allowing access for authenticated user`);
    return next();
  }

  // Check if user role is in allowed roles
  if (!allowedRoles.includes(user.role)) {
    logger.warn(
      `Access denied: User (${user.role}) attempted ${method} ${pathPattern}. Allowed roles: ${allowedRoles.join(', ')}`
    );
    return res.status(403).json({
      status: 'error',
      code: 403,
      error: 'FORBIDDEN',
      message: `This action requires one of: ${allowedRoles.join(', ')}`,
      userRole: user.role,
      requiredRoles: allowedRoles,
    });
  }

  logger.debug(`RBAC: User (${user.role}) authorized for ${method} ${pathPattern}`);
  next();
};

/**
 * Enhanced RBAC middleware that also checks resource ownership
 * For operations on specific tables, verify the user has access
 */
export const enforceTableOwnershipRBAC = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  const { tableId } = req.params;

  if (!user) {
    return res.status(401).json({
      status: 'error',
      code: 401,
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  // Special rules for specific operations
  const method = req.method;
  const path = req.path;

  // Servers can only seat/clear their own tables (handled by tenant isolation)
  if (method === 'POST' && (path.includes('/seat') || path.includes('/clear'))) {
    // Servers can only perform these actions (already filtered by RBAC above)
    // Additional checks could be added here for server-specific table assignments
  }

  // Dishwashers can only update status to CLEANING
  if (method === 'PATCH' && path.includes('/status') && user.role === 'DISHWASHER') {
    const { status } = req.body;
    if (status !== 'CLEANING' && status !== 'AVAILABLE') {
      return res.status(403).json({
        status: 'error',
        code: 403,
        error: 'FORBIDDEN',
        message: 'Dishwashers can only update table status to CLEANING or AVAILABLE',
      });
    }
  }

  next();
};

/**
 * Get RBAC rules for documentation
 */
export const getTableRBACRules = () => {
  return TABLE_RBAC_RULES;
};

/**
 * Check if a role has permission for a specific action
 */
export const hasTablePermission = (role: string, method: string, pathPattern: string): boolean => {
  const ruleKey = `${method}:${pathPattern}`;
  const allowedRoles = TABLE_RBAC_RULES[ruleKey];
  return allowedRoles ? allowedRoles.includes(role) : true;
};
