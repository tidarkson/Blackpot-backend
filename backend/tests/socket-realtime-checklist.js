/* eslint-disable no-console */
const path = require('path');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { PrismaClient, UserRole } = require('@prisma/client');

// Load environment from project root .env
const envPath = path.resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

const HOST = process.env.HOST || 'localhost';
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = `http://${HOST}:${PORT}`;

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET in environment.');
  process.exit(1);
}

const prisma = new PrismaClient();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function connectSocket(ioClient, token, role, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BASE_URL, {
      transports: ['websocket'],
      auth: { token, role },
      timeout: timeoutMs,
      forceNew: true,
      reconnection: false,
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Socket connect timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(err);
    });
  });
}

function expectEvent(socket, eventName, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      resolve(payload);
    };

    socket.on(eventName, onEvent);
  });
}

async function expectNoEvent(socket, eventName, waitMs = 1800) {
  return new Promise((resolve, reject) => {
    let received = false;

    const onEvent = (payload) => {
      received = true;
      socket.off(eventName, onEvent);
      reject(new Error(`Unexpected ${eventName}: ${JSON.stringify(payload)}`));
    };

    socket.on(eventName, onEvent);

    setTimeout(() => {
      socket.off(eventName, onEvent);
      if (!received) {
        resolve(true);
      }
    }, waitMs);
  });
}

async function run() {
  const { io: ioClient } = await import('socket.io-client');

  const checklist = [];
  const sockets = [];
  const fixtureIds = {
    tenantA: null,
    tenantB: null,
  };

  try {
    const suffix = Date.now();

    // Fixture setup for two isolated tenants
    const tenantA = await prisma.tenant.create({
      data: { name: `Socket Test Tenant A ${suffix}` },
    });
    fixtureIds.tenantA = tenantA.id;

    const tenantB = await prisma.tenant.create({
      data: { name: `Socket Test Tenant B ${suffix}` },
    });
    fixtureIds.tenantB = tenantB.id;

    const locationA = await prisma.location.create({
      data: {
        tenantId: tenantA.id,
        name: `Main A ${suffix}`,
      },
    });

    const locationB = await prisma.location.create({
      data: {
        tenantId: tenantB.id,
        name: `Main B ${suffix}`,
      },
    });

    const serverA = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        locationId: locationA.id,
        email: `socket.server.a.${suffix}@blackpot.test`,
        name: 'Socket Server A',
        passwordHash: 'hash',
        role: UserRole.STAFF,
      },
    });

    const serverB = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        locationId: locationB.id,
        email: `socket.server.b.${suffix}@blackpot.test`,
        name: 'Socket Server B',
        passwordHash: 'hash',
        role: UserRole.STAFF,
      },
    });

    const tableA = await prisma.table.create({
      data: {
        tenantId: tenantA.id,
        locationId: locationA.id,
        serverId: serverA.id,
        name: `A-01-${suffix}`,
        capacity: 4,
        x: 10,
        y: 20,
        width: 120,
        height: 80,
      },
    });

    const tableB = await prisma.table.create({
      data: {
        tenantId: tenantB.id,
        locationId: locationB.id,
        serverId: serverB.id,
        name: `B-01-${suffix}`,
        capacity: 4,
        x: 30,
        y: 40,
        width: 120,
        height: 80,
      },
    });

    const tokenA = buildToken({
      userId: serverA.id,
      tenantId: tenantA.id,
      locationId: locationA.id,
      role: serverA.role,
      email: serverA.email,
    });

    const tokenB = buildToken({
      userId: serverB.id,
      tenantId: tenantB.id,
      locationId: locationB.id,
      role: serverB.role,
      email: serverB.email,
    });

    // 1) Connect valid JWT client
    const kitchenSocketA = await connectSocket(ioClient, tokenA, 'kitchen');
    sockets.push(kitchenSocketA);
    checklist.push({
      check: 'Connect socket with valid JWT',
      status: 'PASS',
      details: `Connected socketId=${kitchenSocketA.id}`,
    });

    // 2) Connect without JWT should reject
    let rejectedNoJwt = false;
    try {
      await connectSocket(ioClient, undefined, 'kitchen');
    } catch (error) {
      rejectedNoJwt = true;
      checklist.push({
        check: 'Connect socket without JWT',
        status: 'PASS',
        details: `Rejected as expected: ${error.message}`,
      });
    }

    if (!rejectedNoJwt) {
      checklist.push({
        check: 'Connect socket without JWT',
        status: 'FAIL',
        details: 'Connection unexpectedly succeeded without token',
      });
      throw new Error('Socket without JWT was accepted');
    }

    // Tenant B observer for isolation tests
    const kitchenSocketB = await connectSocket(ioClient, tokenB, 'kitchen');
    sockets.push(kitchenSocketB);

    // 3) Create order -> expect order:created on tenant A kitchen room
    const createdPromiseA = expectEvent(kitchenSocketA, 'order:created');
    const noCreatedPromiseB = expectNoEvent(kitchenSocketB, 'order:created');

    const createRes = await fetch(`${BASE_URL}/api/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        tableId: tableA.id,
        serverId: serverA.id,
        guestCount: 2,
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Create order failed (${createRes.status}): ${body}`);
    }

    const createBody = await createRes.json();
    const orderId = createBody?.data?.id;

    if (!orderId) {
      throw new Error('Create order succeeded but response missing order id');
    }

    const orderCreatedEvent = await createdPromiseA;
    await noCreatedPromiseB;

    checklist.push({
      check: "POST /api/v1/orders emits 'order:created'",
      status: 'PASS',
      details: `Received event for orderId=${orderCreatedEvent?.order?.id || orderId}`,
    });

    // 4) Update order status -> expect order:status_updated
    const statusPromiseA = expectEvent(kitchenSocketA, 'order:status_updated');
    const noStatusPromiseB = expectNoEvent(kitchenSocketB, 'order:status_updated');

    const statusRes = await fetch(`${BASE_URL}/api/v1/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });

    if (!statusRes.ok) {
      const body = await statusRes.text();
      throw new Error(`Update status failed (${statusRes.status}): ${body}`);
    }

    const statusEvent = await statusPromiseA;
    await noStatusPromiseB;

    checklist.push({
      check: "PATCH order status emits 'order:status_updated'",
      status: 'PASS',
      details: `Received status=${statusEvent?.status || 'unknown'}`,
    });

    // 5) Cross-tenant isolation (already validated by no-event checks)
    checklist.push({
      check: 'Cross-tenant socket isolation',
      status: 'PASS',
      details: 'Tenant B socket did not receive Tenant A order events',
    });

    // 6) /health still responds 200
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthBody = await healthRes.text();

    if (healthRes.status !== 200) {
      throw new Error(`/health returned ${healthRes.status}: ${healthBody}`);
    }

    checklist.push({
      check: 'GET /health returns 200 after socket setup',
      status: 'PASS',
      details: healthBody,
    });

    console.log('\nSocket.IO Realtime Checklist Results');
    console.table(checklist);
    console.log('\nAll checklist items passed.');
  } catch (error) {
    console.error('\nChecklist execution failed:', error.message);
    throw error;
  } finally {
    for (const socket of sockets) {
      try {
        socket.disconnect();
      } catch (e) {
        // ignore
      }
    }

    // Cleanup test tenants and all related data via cascade
    try {
      if (fixtureIds.tenantA) {
        await prisma.tenant.delete({ where: { id: fixtureIds.tenantA } });
      }
    } catch (e) {
      // ignore cleanup errors
    }

    try {
      if (fixtureIds.tenantB) {
        await prisma.tenant.delete({ where: { id: fixtureIds.tenantB } });
      }
    } catch (e) {
      // ignore cleanup errors
    }

    await prisma.$disconnect();
  }
}

run()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
