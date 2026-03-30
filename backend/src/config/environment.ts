import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// ---------------------------------------------------------------------------
// Schema — validated once at startup, before any server initialisation
// ---------------------------------------------------------------------------
const envSchema = z.object({
  // Required — server won't start without these
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL (e.g. postgresql://user:pass@host:5432/db)'),

  // Redis — required when REDIS_ENABLED=true
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_ENABLED: z.string().default('true').transform(v => v !== 'false'),

  // Session
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),

  // Stripe — warn if missing in production
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Sentry — warn if missing in production
  SENTRY_DSN: z.string().url('SENTRY_DSN must be a valid URL').optional(),

  // CORS / Frontend
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables — server cannot start:');
  parsed.error.issues.forEach(issue => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
    console.error(`  [${path}] ${issue.message}`);
  });
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Production-only warnings for optional-but-important variables
// ---------------------------------------------------------------------------
if (parsed.data.NODE_ENV === 'production') {
  if (!parsed.data.STRIPE_SECRET_KEY)
    console.warn('⚠️  STRIPE_SECRET_KEY missing — payments disabled');
  if (!parsed.data.STRIPE_WEBHOOK_SECRET)
    console.warn('⚠️  STRIPE_WEBHOOK_SECRET missing — webhook verification disabled');
  if (!parsed.data.SENTRY_DSN)
    console.warn('⚠️  SENTRY_DSN missing — error tracking disabled');
  if (parsed.data.JWT_SECRET.length < 64)
    console.warn('⚠️  JWT_SECRET should be at least 64 characters in production');
  if (!parsed.data.SESSION_SECRET)
    console.warn('⚠️  SESSION_SECRET not set — falling back to JWT_SECRET');
}

// ---------------------------------------------------------------------------
// Config — consumers import this object; all validated values used directly
// ---------------------------------------------------------------------------
export const config = {
  // Server
  PORT: parsed.data.PORT,
  HOST: process.env.HOST || 'localhost',
  NODE_ENV: parsed.data.NODE_ENV,

  // Database
  DATABASE_URL: parsed.data.DATABASE_URL,

  // JWT Configuration
  // Note: Shorter expiry times are more secure
  // Access tokens: 15 minutes (short-lived)
  // Refresh tokens: 7 days (long-lived, requires refresh endpoint)
  JWT_SECRET: parsed.data.JWT_SECRET,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '15m',
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '7d',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // CORS
  CORS_ORIGIN: parsed.data.CORS_ORIGIN,

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
  FRONTEND_URL: parsed.data.FRONTEND_URL,

  // Redis Configuration
  REDIS_HOST: parsed.data.REDIS_HOST,
  REDIS_PORT: parsed.data.REDIS_PORT,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: parseInt(process.env.REDIS_DB || '0'),
  REDIS_ENABLED: parsed.data.REDIS_ENABLED,

  // Session Configuration
  // Falls back to JWT_SECRET when SESSION_SECRET is not explicitly set
  SESSION_SECRET: parsed.data.SESSION_SECRET ?? parsed.data.JWT_SECRET,
  SESSION_TIMEOUT_MS: parseInt(process.env.SESSION_TIMEOUT_MS || String(24 * 60 * 60 * 1000)), // 24 hours
  REMEMBER_ME_TIMEOUT_MS: parseInt(process.env.REMEMBER_ME_TIMEOUT_MS || String(30 * 24 * 60 * 60 * 1000)), // 30 days
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
  SESSION_ENABLE_FINGERPRINTING: process.env.SESSION_ENABLE_FINGERPRINTING !== 'false',
  SESSION_VALIDATE_IP: process.env.SESSION_VALIDATE_IP === 'true',
  SESSION_MAX_CONCURRENT: parseInt(process.env.SESSION_MAX_CONCURRENT || '3'),

  // Stripe
  STRIPE_SECRET_KEY: parsed.data.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: parsed.data.STRIPE_WEBHOOK_SECRET,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,

  // Sentry Configuration
  SENTRY_DSN: parsed.data.SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  SENTRY_TRACES_SAMPLE_RATE: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.2'),
  SENTRY_PROFILES_SAMPLE_RATE: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
  SENTRY_DEBUG: process.env.SENTRY_DEBUG || 'false',

  // App
  APP_VERSION: process.env.APP_VERSION || '1.0.0',
  APP_URL: process.env.APP_URL,

  // API
  API_VERSION: 'v1',
  API_PREFIX: '/api/v1',
};