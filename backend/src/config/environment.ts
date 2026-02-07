import * as dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredVars = ['JWT_SECRET', 'DATABASE_URL'];
const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const config = {
  // Server
  PORT: parseInt(process.env.PORT || '3000'),
  HOST: process.env.HOST || 'localhost',
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL as string,
  
  // JWT Configuration
  // Note: Shorter expiry times are more secure
  // Access tokens: 15 minutes (short-lived)
  // Refresh tokens: 7 days (long-lived, requires refresh endpoint)
  JWT_SECRET: process.env.JWT_SECRET as string,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '15m',
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  
  // Email Configuration
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'TEST',
  GMAIL_USER: process.env.GMAIL_USER,
  GMAIL_PASSWORD: process.env.GMAIL_PASSWORD,
  ETHEREAL_USER: process.env.ETHEREAL_USER,
  ETHEREAL_PASSWORD: process.env.ETHEREAL_PASSWORD,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@blackpot.com',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // API
  API_VERSION: 'v1',
  API_PREFIX: '/api/v1',
};