import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

export class AppError extends Error {
  constructor(
    public code: number,
    public error: string,
    message: string,
    public details?: any
  ) {
    super(message);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.code).json({
      status: 'error',
      code: err.code,
      error: err.error,
      message: err.message,
      details: err.details,
      timestamp: new Date().toISOString(),
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  console.error('Unexpected error:', err);
  return res.status(500).json({
    error: err.message || 'Internal Server Error',
    status: 500,
    code: 500,
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  });
};
