import { Request, Response, NextFunction } from 'express';

export const ensureTenantAccess = (req: Request, res: Response, next: NextFunction) => {
  const userTenantId = req.user?.tenantId;
  const requestTenantId = req.params.tenantId || req.query.tenantId;

  if (requestTenantId && userTenantId !== requestTenantId) {
    return res.status(403).json({
      status: 'error',
      code: 403,
      error: 'FORBIDDEN',
      message: 'You do not have access to this tenant',
    });
  }

  next();
};

export const ensureLocationAccess = (req: Request, res: Response, next: NextFunction) => {
  const userLocationId = req.user?.locationId;
  const requestLocationId = req.params.locationId || req.query.locationId;

  if (requestLocationId && userLocationId !== requestLocationId) {
    return res.status(403).json({
      status: 'error',
      code: 403,
      error: 'FORBIDDEN',
      message: 'You do not have access to this location',
    });
  }

  next();
};