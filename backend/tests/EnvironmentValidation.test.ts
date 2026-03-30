/**
 * Environment Variable Validation Tests
 *
 * Tests the startup-time Zod validation in backend/src/config/environment.ts.
 * Each scenario spawns an isolated child process (env-check-entrypoint.ts) so
 * that the module-level `process.exit(1)` call can be observed without killing
 * the Jest runner.
 *
 * Covers the full acceptance checklist:
 *   1. JWT_SECRET < 32 chars  → hard exit(1) with clear error
 *   2. DATABASE_URL malformed → hard exit(1) with clear error
 *   3. NODE_ENV=production, no Stripe/Sentry → warnings, server starts (exit 0)
 *   4. All valid vars         → clean startup, no warnings
 *   5. .env.example documents every Zod-validated variable
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../..');
const ENTRYPOINT = path.resolve(__dirname, 'helpers/env-check-entrypoint.ts');
const TSCONFIG = path.join(ROOT, 'tsconfig.json');

// Resolved once at test-load time so the path is always found correctly.
const TS_NODE_REGISTER = require.resolve('ts-node/register');

// 64-character secret: satisfies the ≥ 32-char hard requirement AND the
// ≥ 64-char production recommendation, so it won't trigger any JWT warning.
const LONG_JWT_SECRET = 'env-validation-test-jwt-secret-do-not-use-outside-tests-xxxx12345';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a process.env suitable for one isolated spawn.
 *
 * Starts from the real process.env (provides PATH, USERPROFILE, etc.),
 * strips optional vars that might exist in CI or a developer's local .env
 * to prevent them from masking the scenario under test, applies secure
 * defaults, then overlays test-specific overrides.
 *
 * Pass `undefined` as a value to explicitly DELETE a key.
 */
function buildEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // Strip variables that are optional-but-warned-in-production so each test
  // can control exactly which are present.
  for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SENTRY_DSN', 'SESSION_SECRET']) {
    delete env[key];
  }

  // Secure, valid defaults that satisfy all hard-fail rules.
  Object.assign(env, {
    NODE_ENV: 'development',
    PORT: '3000',
    JWT_SECRET: LONG_JWT_SECRET,
    DATABASE_URL: 'postgresql://user:password@localhost:5432/testdb',
    REDIS_ENABLED: 'false',
    LOG_LEVEL: 'error',
    // Tell ts-node where to find the project config and skip type-checking
    // for faster spawn times.
    TS_NODE_PROJECT: TSCONFIG,
    TS_NODE_TRANSPILE_ONLY: 'true',
  });

  // Apply scenario-specific overrides; undefined means "remove this key".
  for (const [key, val] of Object.entries(overrides)) {
    if (val === undefined) {
      delete env[key];
    } else {
      env[key] = val;
    }
  }

  return env;
}

/** Spawn the env-check entrypoint in an isolated process and return results. */
function runEnvCheck(overrides: Record<string, string | undefined> = {}): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(
    process.execPath,                       // node binary used to run this suite
    ['--require', TS_NODE_REGISTER, ENTRYPOINT],
    {
      env: buildEnv(overrides),
      encoding: 'utf8',
      cwd: ROOT,
      timeout: 30_000,
    },
  );

  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Environment Variable Validation (startup)', () => {
  // ── Checklist item 1 ────────────────────────────────────────────────────
  it('exits 1 with a clear error when JWT_SECRET is shorter than 32 characters', () => {
    const result = runEnvCheck({ JWT_SECRET: 'tooshort' });

    expect(result.status).toBe(1);
    // The error message must name the offending variable and the constraint.
    expect(result.stderr).toMatch(/JWT_SECRET/);
    expect(result.stderr).toMatch(/32 characters/);
  });

  // ── Checklist item 2 ────────────────────────────────────────────────────
  it('exits 1 with a clear error when DATABASE_URL is not a valid URL', () => {
    const result = runEnvCheck({ DATABASE_URL: 'not-a-url' });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/DATABASE_URL/);
  });

  // ── Checklist item 3 ────────────────────────────────────────────────────
  it('starts (exit 0) but logs warnings when NODE_ENV=production and Stripe/Sentry keys are absent', () => {
    // STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SENTRY_DSN are deleted by
    // buildEnv; we only need to flip NODE_ENV to production.
    // JWT_SECRET is 64 chars → the "< 64 chars in prod" warning does NOT fire,
    // keeping the assertion focused on the Stripe/Sentry warnings.
    const result = runEnvCheck({ NODE_ENV: 'production' });

    // Server must still launch — warnings are non-fatal.
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ENV_OK');

    // All three production warnings must appear.
    expect(result.stderr).toMatch(/STRIPE_SECRET_KEY missing/);
    expect(result.stderr).toMatch(/STRIPE_WEBHOOK_SECRET missing/);
    expect(result.stderr).toMatch(/SENTRY_DSN missing/);
  });

  // ── Checklist item 4 ────────────────────────────────────────────────────
  it('starts cleanly with no warnings when all required variables are valid', () => {
    // buildEnv defaults are all valid; no overrides needed.
    const result = runEnvCheck();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ENV_OK');
    // No warnings or errors on stderr.
    expect(result.stderr).toBe('');
  });

  // ── Checklist item 5 ────────────────────────────────────────────────────
  it('documents every Zod-validated variable in .env.example', () => {
    const envExample = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');

    // Every variable in the Zod schema must appear at least once in .env.example.
    const zodValidatedVars = [
      'NODE_ENV',
      'PORT',
      'JWT_SECRET',
      'DATABASE_URL',
      'REDIS_HOST',
      'REDIS_PORT',
      'REDIS_ENABLED',
      'SESSION_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'SENTRY_DSN',
      'CORS_ORIGIN',
      'FRONTEND_URL',
    ];

    for (const varName of zodValidatedVars) {
      expect(envExample).toContain(varName);
    }
  });
});
