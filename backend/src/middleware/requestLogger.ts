import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const originalSend = res.send;

  res.send = function(data: any) {
    const duration = Date.now() - start;
    console.log({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      user: (req as any).user?.userId || 'anonymous',
    });
    return originalSend.call(this, data);
  };

  next();
};