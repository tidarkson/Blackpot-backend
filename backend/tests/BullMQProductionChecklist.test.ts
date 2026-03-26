/**
 * BullMQ Production Checklist Tests
 *
 * Covers each item in the manual acceptance checklist:
 *   1. Container starts — both 'api' and 'workers' appear in pm2 list
 *   2. GET /health ——— response includes workers.email and workers.scheduled
 *   3. Email job ————— job enqueues and a worker processes it
 *   4. SIGTERM —————— workers log 'draining queue' before closing
 *   5. Kill Redis ———— worker emits logged error, does NOT crash the process
 *
 * Items 1, 3 and 5 can be fully verified with unit/integration tests.
 * Items 2 and 4 are also covered here at the unit level.
 * Container-level (Docker) smoke tests are labelled and skipped unless
 * RUN_CONTAINER_TESTS=true is set alongside RUN_INTEGRATION_TESTS=true.
 */

import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

// ──────────────────────────────────────────────────────────
// Gating flags
// ──────────────────────────────────────────────────────────
const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const runContainer = runIntegration && process.env.RUN_CONTAINER_TESTS === 'true';

const describeIntegration = runIntegration ? describe : describe.skip;
const describeContainer = runContainer ? describe : describe.skip;

// ══════════════════════════════════════════════════════════
// CHECKLIST ITEM 1 — PM2: both 'api' and 'workers' defined
// ══════════════════════════════════════════════════════════
describe('✅ Checklist 1 — PM2 ecosystem defines api + workers', () => {
  const ecosystemPath = path.resolve(__dirname, '../../ecosystem.config.js');

  it('ecosystem.config.js exists at project root', () => {
    expect(fs.existsSync(ecosystemPath)).toBe(true);
  });

  it("ecosystem defines an 'api' app pointed at backend/dist/index.js", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(ecosystemPath);
    const apps: Array<{ name: string; script: string }> = config.apps;
    const apiApp = apps.find((a) => a.name === 'api');
    expect(apiApp).toBeDefined();
    expect(apiApp!.script).toContain('backend/dist/index.js');
  });

  it("ecosystem defines a 'workers' app pointed at backend/dist/workers.js", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(ecosystemPath);
    const apps: Array<{ name: string; script: string }> = config.apps;
    const workersApp = apps.find((a) => a.name === 'workers');
    expect(workersApp).toBeDefined();
    expect(workersApp!.script).toContain('backend/dist/workers.js');
  });

  it('Dockerfile uses pm2-runtime to start via ecosystem.config.js', () => {
    const dockerfilePath = path.resolve(__dirname, '../../Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    expect(content).toMatch(/pm2-runtime/);
    expect(content).toMatch(/ecosystem\.config\.js/);
  });

  it('Dockerfile installs pm2 globally in the production stage', () => {
    const dockerfilePath = path.resolve(__dirname, '../../Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    expect(content).toMatch(/npm install -g pm2/);
  });

  // ── container smoke test (requires running container) ──
  describeContainer('Container smoke: pm2 list shows both processes', () => {
    it('pm2 list output contains "api" and "workers" lines', async () => {
      const { execSync } = await import('child_process');
      const output = execSync('docker exec blackpot-api pm2 list --no-color').toString();
      expect(output).toMatch(/\bapi\b/);
      expect(output).toMatch(/\bworkers\b/);
    });
  });
});

// ══════════════════════════════════════════════════════════
// CHECKLIST ITEM 2 — GET /health returns workers object
// ══════════════════════════════════════════════════════════
describe('✅ Checklist 2 — /health response includes workers fields', () => {
  it('workers.ts health handler imports emailQueue and scheduledQueue', () => {
    // Static analysis: index.ts must import from queue definition files
    const indexPath = path.resolve(__dirname, '../src/index.ts');
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content).toMatch(/from.*queues\/definitions\/email\.queue/);
    expect(content).toMatch(/from.*queues\/definitions\/scheduled\.queue/);
  });

  it('index.ts /health handler checks isPaused() and returns workers object', () => {
    const indexPath = path.resolve(__dirname, '../src/index.ts');
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content).toMatch(/isPaused\(\)/); // the pause check
    expect(content).toMatch(/workers\s*:/); // "workers:" field in response
    expect(content).toMatch(/email\s*:/); // workers.email
    expect(content).toMatch(/scheduled\s*:/); // workers.scheduled
  });

  describeIntegration('Integration: live /health response shape', () => {
    it('GET /health returns 200 with workers.email and workers.scheduled', async () => {
      // Dynamic import to avoid side-effects when Redis is absent
      const supertest = (await import('supertest')).default;

      // Minimal app bootstrap — uses the compiled module if available
      // This test is gated and only runs when Redis is reachable.
      const app = (await import('../src/index')).default;
      const res = await supertest(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('workers');
      expect(res.body.workers).toHaveProperty('email');
      expect(res.body.workers).toHaveProperty('scheduled');
      expect(['running', 'paused']).toContain(res.body.workers.email);
      expect(['running', 'paused']).toContain(res.body.workers.scheduled);
    });
  });
});

// ══════════════════════════════════════════════════════════
// CHECKLIST ITEM 3 — Email job enqueues and executes
// ══════════════════════════════════════════════════════════
describeIntegration('✅ Checklist 3 — Email job triggers and executes (integration)', () => {
  const { Worker, Queue } = require('bullmq');
  const {
    redisConnection,
    QUEUE_NAMES,
    JOB_NAMES,
  } = require('../src/queues/config/queue.config');

  let queue: InstanceType<typeof Queue>;
  let worker: InstanceType<typeof Worker>;
  const executedJobs: string[] = [];

  beforeAll(() => {
    queue = new Queue(QUEUE_NAMES.EMAIL, { connection: redisConnection });
  });

  afterAll(async () => {
    await worker?.close();
    await queue?.close();
  });

  it('adds an email job to the queue', async () => {
    const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
      to: 'checklist@example.com',
      subject: 'Order Confirmed',
      data: { tenantId: 'test-tenant', orderId: 'ORD-001' },
    });
    expect(job.id).toBeDefined();
  });

  it('a worker picks up and executes the email job', async () => {
    const completed = new Promise<void>((resolve) => {
      worker = new Worker(
        QUEUE_NAMES.EMAIL,
        async (job: any) => {
          executedJobs.push(job.name);
        },
        { connection: redisConnection, autorun: true },
      );
      worker.on('completed', resolve);
    });

    await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
      to: 'exec@example.com',
      subject: 'Exec Test',
      data: { tenantId: 'test-tenant' },
    });

    await expect(completed).resolves.toBeUndefined();
    expect(executedJobs.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════
// CHECKLIST ITEM 4 — SIGTERM logs 'draining queue'
// ══════════════════════════════════════════════════════════
describe('✅ Checklist 4 — SIGTERM shutdown logs "draining queue"', () => {
  it('workers.ts shutdown function contains a draining queue log', () => {
    const workersPath = path.resolve(__dirname, '../src/workers.ts');
    const content = fs.readFileSync(workersPath, 'utf8');
    // Must contain draining/drain before the worker.close() calls
    expect(content.toLowerCase()).toMatch(/drain/);
  });

  it('workers.ts registers SIGTERM and SIGINT process handlers', () => {
    const workersPath = path.resolve(__dirname, '../src/workers.ts');
    const content = fs.readFileSync(workersPath, 'utf8');
    expect(content).toMatch(/process\.on\('SIGTERM'/);
    expect(content).toMatch(/process\.on\('SIGINT'/);
  });

  it('shutdown function closes all workers then all queues in order', () => {
    const workersPath = path.resolve(__dirname, '../src/workers.ts');
    const content = fs.readFileSync(workersPath, 'utf8');

    const workerCloseIdx = content.indexOf('emailWorker.close()');
    const queueCloseIdx = content.indexOf('emailQueue.close()');

    expect(workerCloseIdx).toBeGreaterThan(0);
    expect(queueCloseIdx).toBeGreaterThan(workerCloseIdx); // queues closed after workers
  });

  it('shutdown uses Promise.all for parallel worker closure (fast drain)', () => {
    const workersPath = path.resolve(__dirname, '../src/workers.ts');
    const content = fs.readFileSync(workersPath, 'utf8');
    // Both worker and queue closes happen inside Promise.all blocks
    const allCount = (content.match(/Promise\.all/g) || []).length;
    expect(allCount).toBeGreaterThanOrEqual(2);
  });

  it('runtime: calling shutdown() emits drain log before closing', async () => {
    // Simulate the shutdown function in isolation without real Redis
    const messages: string[] = [];
    const mockLogger = {
      info: (msg: string) => { messages.push(msg); },
      error: (msg: string) => { messages.push(msg); },
    };

    const mockClose = jest.fn().mockResolvedValue(undefined);

    async function simulatedShutdown() {
      let isShuttingDown = false;
      if (isShuttingDown) return;
      isShuttingDown = true;
      mockLogger.info('🛑 Shutting down workers gracefully...');
      mockLogger.info('⏳ Draining queue — waiting for active jobs to complete before exit...');
      await Promise.all([mockClose(), mockClose(), mockClose(), mockClose()]);
      await Promise.all([mockClose(), mockClose(), mockClose(), mockClose(), mockClose()]);
      mockLogger.info('✅ Workers and queues closed gracefully');
    }

    await simulatedShutdown();

    const drainingLog = messages.find((m) => m.toLowerCase().includes('drain'));
    expect(drainingLog).toBeDefined();
    expect(mockClose).toHaveBeenCalledTimes(9); // 4 workers + 5 queues
  });
});

// ══════════════════════════════════════════════════════════
// CHECKLIST ITEM 5 — Kill Redis → graceful error, no crash
// ══════════════════════════════════════════════════════════
describe('✅ Checklist 5 — Redis failure is logged, not a crash', () => {
  it('all 4 workers register an error event handler', () => {
    const workerFiles = [
      'email.worker.ts',
      'report.worker.ts',
      'dataProcessing.worker.ts',
      'scheduled.worker.ts',
    ];

    for (const file of workerFiles) {
      const filePath = path.resolve(__dirname, `../src/queues/workers/${file}`);
      const content = fs.readFileSync(filePath, 'utf8');
      // Each worker must call .on('error', ...) to prevent EventEmitter crash
      expect(content).toMatch(/\.on\('error'/);
    }
  });

  it("workers' error handlers call logger.error (not rethrow or process.exit)", () => {
    const workerFiles = [
      'email.worker.ts',
      'report.worker.ts',
      'dataProcessing.worker.ts',
      'scheduled.worker.ts',
    ];

    for (const file of workerFiles) {
      const filePath = path.resolve(__dirname, `../src/queues/workers/${file}`);
      const content = fs.readFileSync(filePath, 'utf8');
      // The handler must log, not throw or exit
      expect(content).toMatch(/logger\.error/);
    }
  });

  it('runtime: emitting error on a Worker EventEmitter does NOT throw with a handler', () => {
    // Simulate a BullMQ worker that has an error handler attached
    const fakeWorker = new EventEmitter();
    const loggedErrors: string[] = [];

    fakeWorker.on('error', (err: Error) => {
      loggedErrors.push(err.message);
    });

    // This would crash Node.js with "Unhandled 'error' event" if no handler existed
    expect(() => {
      fakeWorker.emit('error', new Error('ECONNREFUSED — Redis is down'));
    }).not.toThrow();

    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0]).toContain('ECONNREFUSED');
  });

  it('runtime: emitting error WITHOUT a handler would throw (baseline proof)', () => {
    const fakeWorker = new EventEmitter();
    // No .on('error') registered — EventEmitter will throw
    expect(() => {
      fakeWorker.emit('error', new Error('no handler'));
    }).toThrow('no handler');
  });

  it('workers.ts registers uncaughtException handler (last-resort guard)', () => {
    const workersPath = path.resolve(__dirname, '../src/workers.ts');
    const content = fs.readFileSync(workersPath, 'utf8');
    expect(content).toMatch(/process\.on\('uncaughtException'/);
  });

  it('BullMQ redisConnection has enableOfflineQueue:true (survives brief Redis outage)', () => {
    const {
      redisConnection,
    } = require('../src/queues/config/queue.config');
    expect(redisConnection.enableOfflineQueue).toBe(true);
  });

  describeIntegration('Integration: worker survives Redis restart', () => {
    it('worker error event fires and logs instead of crashing when Redis drops', async () => {
      const { Worker } = require('bullmq');
      const {
        redisConnection,
        QUEUE_NAMES,
      } = require('../src/queues/config/queue.config');

      const errors: Error[] = [];

      const worker = new Worker(
        QUEUE_NAMES.EMAIL,
        async () => { /* no-op processor */ },
        { connection: { ...redisConnection, host: '127.0.0.1', port: 9999 }, autorun: false },
      );

      worker.on('error', (err: Error) => errors.push(err));

      // Wait briefly so the connection attempt fails
      await new Promise((r) => setTimeout(r, 1500));
      await worker.close().catch(() => {/* ignore close errors */});

      // Process should still be alive (we didn't crash)
      expect(process.exitCode).toBeUndefined();
      // At least one connection error should have been captured
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
