import express, { Request, Response } from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import * as Sentry from '@sentry/node';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config/environment';
import logger from './config/logger';
import { initializeSocketIO } from './config/socket';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { 
  apiLimiter,
} from './middleware/rateLimiter';
import { initializeRedis, closeRedis, checkRedisHealth } from './config/redis';
import { initSentry, captureMessage } from './config/sentry';
import { initializeSessionConfig } from './config/session.config';
import {
  sessionValidator,
  sessionLogger as sessionLoggerMiddleware,
} from './middleware/session.middleware';
import {
  sentryRequestMiddleware,
  sentryErrorMiddleware,
  sentryContextMiddleware,
  sentryErrorCaptureMiddleware,
  sentryDatabaseMonitoringMiddleware,
} from './middleware/sentry.middleware';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import reconciliationRoutes from './routes/reconciliation';
import cashSessionRoutes from './routes/cash-sessions';
import shiftRoutes from './routes/shift';
import reportRoutes from './routes/reports';
import menuRoutes from './routes/menu';
import paymentRoutes from './routes/payment';
import orderRoutes from './routes/order';
import kitchenRoutes from './routes/kitchen';
import tableRoutes from './routes/table';
import splitRoutes from './routes/split';
import reservationRoutes from './routes/reservation';
import customerRoutes from './routes/customer';
import inventoryRoutes from './routes/inventory';
import staffRoutes from './routes/staff';
import scheduleRoutes from './routes/schedules';
import advancedSchedulingRoutes from './routes/advanced-scheduling';
import dashboardRoutes from './routes/dashboard';
import jobsRoutes from './routes/jobs';
import financialSettingsRoutes from './routes/financial-settings';
import { emailQueue } from './queues/definitions/email.queue';
import { scheduledQueue } from './queues/definitions/scheduled.queue';

const app = express();
const httpServer = createServer(app);
const corsOptions: cors.CorsOptions = {
  origin: config.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.CORS_ORIGIN,
    credentials: true,
  },
});

// ✅ Initialize Sentry FIRST before any middleware
initSentry();

// Initialize Redis on startup
async function startServer() {
  try {
    initializeSocketIO(io);

    // Initialize Redis for distributed rate limiting
    if (config.REDIS_ENABLED) {
      await initializeRedis();
    }

    // ✅ Sentry request handler - MUST be early in middleware chain
    app.use(sentryRequestMiddleware);

    // Global rate limiting middleware
    app.use('/api/', apiLimiter);

    // Security middleware
    app.use(helmet());
    app.use(cors(corsOptions));

    // Body parsing
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // ✅ Initialize Express Session with Redis store
    // MUST be after body parsing and before route handlers
    const sessionConfig = initializeSessionConfig();
    app.use(session(sessionConfig));
    app.use(sessionLoggerMiddleware);
    app.use(sessionValidator);

    // Request logging
    app.use(requestLogger);

    // ✅ Sentry context middleware - Captures user/tenant/action context
    app.use(sentryContextMiddleware);

    // ✅ Sentry database monitoring middleware
    app.use(sentryDatabaseMonitoringMiddleware);

    // Health check endpoint
    app.get('/health', async (req: Request, res: Response) => {
      const redisHealthy = config.REDIS_ENABLED ? await checkRedisHealth() : true;
      const emailPaused = await emailQueue.getQueue().isPaused();
      const scheduledPaused = await scheduledQueue.getQueue().isPaused();
      
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        redis: config.REDIS_ENABLED ? (redisHealthy ? 'connected' : 'disconnected') : 'disabled',
        workers: {
          email: emailPaused ? 'paused' : 'running',
          scheduled: scheduledPaused ? 'paused' : 'running',
        },
      });
    });

    /**
     * ✅ RATE LIMITING APPLICATION
     * Rate limiters are applied directly in route files for specific endpoints
     * This provides:
     * - Authentication Routes: Login (5/15min), Signup (3/hour), Password Reset (3/hour)
     * - Order Routes: Create (100/min), Read (200/min), Update (50/min)
     * - Report Routes: Generate (10/hour), View (50/min)
     * - Inventory Routes: Create (100/min), Read (200/min), Update (100/min)
     * - Admin Routes: 30 operations per minute (premium: 90/min)
     */

    // API Routes with Rate Limiting
    app.use(`${config.API_PREFIX}/auth`, authRoutes);
    app.use(`${config.API_PREFIX}/admin`, adminRoutes);
    app.use(`${config.API_PREFIX}/dashboard`, dashboardRoutes);
    app.use(`${config.API_PREFIX}/orders`, orderRoutes);
    app.use(`${config.API_PREFIX}/payments`, paymentRoutes);
    app.use(`${config.API_PREFIX}/reports`, reportRoutes);
    app.use(`${config.API_PREFIX}/inventory`, inventoryRoutes);

    // Other API routes
    app.use(`${config.API_PREFIX}/reconciliation`, reconciliationRoutes);
    app.use(`${config.API_PREFIX}/cash-sessions`, cashSessionRoutes);
    app.use(`${config.API_PREFIX}/shifts`, shiftRoutes);
    app.use(`${config.API_PREFIX}/menus`, menuRoutes);
    app.use(`${config.API_PREFIX}/kitchen`, kitchenRoutes);
    app.use(`${config.API_PREFIX}/tables`, tableRoutes);
    app.use(`${config.API_PREFIX}`, splitRoutes);
    app.use(`${config.API_PREFIX}/reservations`, reservationRoutes);
    app.use(`${config.API_PREFIX}/customers`, customerRoutes);
    app.use(`${config.API_PREFIX}/staff`, staffRoutes);
    app.use(`${config.API_PREFIX}/schedules`, scheduleRoutes);
    app.use(`${config.API_PREFIX}/advanced`, advancedSchedulingRoutes);
    app.use(`${config.API_PREFIX}/jobs`, jobsRoutes);
    app.use(`${config.API_PREFIX}/financial-settings`, financialSettingsRoutes);

    // 404 handler
    app.use((req: Request, res: Response) => {
      res.status(404).json({ 
        error: 'Route not found',
        path: req.path,
        method: req.method,
      });
    });

    // ✅ Sentry error handler - MUST be before error handler
    app.use(sentryErrorCaptureMiddleware);

    // ✅ Sentry exception handler - Captures uncaught exceptions
    app.use(sentryErrorMiddleware);

    // Error handler
    app.use(errorHandler);

    // Start server
    httpServer.listen(config.PORT, config.HOST, () => {
      logger.info(`🚀 Server running at http://${config.HOST}:${config.PORT}`);
      logger.info(`📝 API available at http://${config.HOST}:${config.PORT}${config.API_PREFIX}`);
      if (config.REDIS_ENABLED) {
        logger.info('📡 Distributed rate limiting enabled (Redis)');
      } else {
        logger.warn('⚠️ Distributed rate limiting disabled (using in-memory store)');
      }
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('🛑 Shutting down server gracefully...');
      
      httpServer.close(async () => {
        logger.info('✅ Server closed');
        
        // Close Redis connection
        if (config.REDIS_ENABLED) {
          await closeRedis();
        }
        
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('❌ Server did not shut down gracefully, forcing shutdown');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // ✅ Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });

      // Send to Sentry
      Sentry.captureException(error);
    });

    // ✅ Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled Rejection:', {
        reason,
        promise: promise.toString(),
      });

      // Send to Sentry
      if (reason instanceof Error) {
        Sentry.captureException(reason);
      } else {
        captureMessage(`Unhandled Rejection: ${reason}`);
      }
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
export { io, httpServer };
