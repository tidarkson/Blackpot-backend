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