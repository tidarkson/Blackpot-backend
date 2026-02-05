import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/environment';
import logger from './config/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth';
import reconciliationRoutes from './routes/reconciliation';
import shiftRoutes from './routes/shift';
import reportRoutes from './routes/reports';
import menuRoutes from './routes/menu';
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
import { apiLimiter } from './middleware/rateLimiter';

const app = express();

app.use('/api/', apiLimiter); // Apply to all API routes

// Security middleware
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API routes
app.use(`${config.API_PREFIX}/auth`, authRoutes);
app.use(`${config.API_PREFIX}/reconciliation`, reconciliationRoutes);
app.use(`${config.API_PREFIX}/shifts`, shiftRoutes);
app.use(`${config.API_PREFIX}/reports`, reportRoutes);
app.use(`${config.API_PREFIX}/menus`, menuRoutes);
app.use(`${config.API_PREFIX}/orders`, orderRoutes);
app.use(`${config.API_PREFIX}/kitchen`, kitchenRoutes);
app.use(`${config.API_PREFIX}/tables`, tableRoutes);
app.use(`${config.API_PREFIX}`, splitRoutes);
app.use(`${config.API_PREFIX}/reservations`, reservationRoutes);
app.use(`${config.API_PREFIX}/customers`, customerRoutes);
app.use(`${config.API_PREFIX}/inventory`, inventoryRoutes);
app.use(`${config.API_PREFIX}/staff`, staffRoutes);
app.use(`${config.API_PREFIX}/schedules`, scheduleRoutes);
app.use(`${config.API_PREFIX}/advanced`, advancedSchedulingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(config.PORT, config.HOST, () => {
  logger.info(`🚀 Server running at http://${config.HOST}:${config.PORT}`);
  logger.info(`📝 API available at http://${config.HOST}:${config.PORT}${config.API_PREFIX}`);
});