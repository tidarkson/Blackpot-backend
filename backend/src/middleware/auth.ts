import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { JWTPayload } from '../types/auth';
// import { TokenBlacklistService } from '../services/TokenBlacklistService';
// const blacklistService = new TokenBlacklistService();

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

const authService = new AuthService();

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      status: 'error',
      code: 401,
      error: 'INVALID_TOKEN',
      message: 'No authentication token provided',
    });
  }

  // Handle both "Bearer token" and "bearer token" (case-insensitive)
  const token = authHeader.startsWith('Bearer ') || authHeader.startsWith('bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      status: 'error',
      code: 401,
      error: 'INVALID_TOKEN',
      message: 'Invalid authorization header format. Expected: Bearer <token>',
    });
  }

  try {
    const payload = authService.verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      code: 401,
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired token',
    });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        code: 401,
        error: 'INVALID_TOKEN',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        code: 403,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `This action requires one of: ${roles.join(', ')}`,
      });
    }

    next();
  };
};
