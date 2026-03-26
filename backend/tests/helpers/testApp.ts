import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import { config } from '../../src/config/environment';
import { errorHandler } from '../../src/middleware/errorHandler';
import { requestLogger } from '../../src/middleware/requestLogger';
import { apiLimiter } from '../../src/middleware/rateLimiter';
import { initializeSessionConfig } from '../../src/config/session.config';
import {
  sessionValidator,
  sessionLogger as sessionLoggerMiddleware,
} from '../../src/middleware/session.middleware';
import {
  sentryContextMiddleware,
  sentryDatabaseMonitoringMiddleware,
  sentryErrorCaptureMiddleware,
  sentryErrorMiddleware,
  sentryRequestMiddleware,
} from '../../src/middleware/sentry.middleware';
import authRoutes from '../../src/routes/auth';
import adminRoutes from '../../src/routes/admin';
import reconciliationRoutes from '../../src/routes/reconciliation';
import cashSessionRoutes from '../../src/routes/cash-sessions';
import shiftRoutes from '../../src/routes/shift';
import reportRoutes from '../../src/routes/reports';
import menuRoutes from '../../src/routes/menu';
import orderRoutes from '../../src/routes/order';
import kitchenRoutes from '../../src/routes/kitchen';
import tableRoutes from '../../src/routes/table';
import splitRoutes from '../../src/routes/split';
import reservationRoutes from '../../src/routes/reservation';
import customerRoutes from '../../src/routes/customer';
import inventoryRoutes from '../../src/routes/inventory';
import staffRoutes from '../../src/routes/staff';
import scheduleRoutes from '../../src/routes/schedules';
import advancedSchedulingRoutes from '../../src/routes/advanced-scheduling';
import dashboardRoutes from '../../src/routes/dashboard';
import jobsRoutes from '../../src/routes/jobs';

const mountRoutes = (app: Express, prefix: string) => {
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/admin`, adminRoutes);
  app.use(`${prefix}/dashboard`, dashboardRoutes);
  app.use(`${prefix}/orders`, orderRoutes);
  app.use(`${prefix}/reports`, reportRoutes);
  app.use(`${prefix}/inventory`, inventoryRoutes);
  app.use(`${prefix}/reconciliation`, reconciliationRoutes);
  app.use(`${prefix}/cash-sessions`, cashSessionRoutes);
  app.use(`${prefix}/shifts`, shiftRoutes);
  app.use(`${prefix}/menus`, menuRoutes);
  app.use(`${prefix}/kitchen`, kitchenRoutes);
  app.use(`${prefix}/tables`, tableRoutes);
  app.use(`${prefix}`, splitRoutes);
  app.use(`${prefix}/reservations`, reservationRoutes);
  app.use(`${prefix}/customers`, customerRoutes);
  app.use(`${prefix}/staff`, staffRoutes);
  app.use(`${prefix}/schedules`, scheduleRoutes);
  app.use(`${prefix}/advanced`, advancedSchedulingRoutes);
  app.use(`${prefix}/jobs`, jobsRoutes);
};

export const createTestApp = (): Express => {
  const app = express();

  app.use(sentryRequestMiddleware);
  app.use('/api/', apiLimiter);
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const sessionConfig = initializeSessionConfig();
  app.use(session(sessionConfig));
  app.use(sessionLoggerMiddleware);
  app.use(sessionValidator);
  app.use(requestLogger);
  app.use(sentryContextMiddleware);
  app.use(sentryDatabaseMonitoringMiddleware);

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString(), redis: 'mocked' });
  });

  // Production path.
  mountRoutes(app, config.API_PREFIX);
  // Compatibility path for legacy tests that call /api/*.
  mountRoutes(app, '/api');

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found', path: req.path, method: req.method });
  });

  app.use(sentryErrorCaptureMiddleware);
  app.use(sentryErrorMiddleware);
  app.use(errorHandler);

  return app;
};

export const testApp = createTestApp();

export default testApp;
