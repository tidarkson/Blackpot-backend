/* eslint-disable no-console */
const path = require('path');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const HOST = process.env.HOST || 'localhost';
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = `http://${HOST}:${PORT}`;

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET in environment.');
  process.exit(1);
}

function connectSocket(token, role, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      transports: ['websocket'],
      auth: token ? { token, role } : { role },
      timeout: timeoutMs,
      forceNew: true,
      reconnection: false,
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Socket timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(error);
    });
  });
}

async function run() {
  const results = [];

  // Valid token connection
  const token = jwt.sign(
    {
      userId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      locationId: '33333333-3333-3333-3333-333333333333',
      role: 'STAFF',
      email: 'socket.check@test.local',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  let connectedSocket;
  try {
    connectedSocket = await connectSocket(token, 'kitchen');
    results.push({
      check: 'Connect socket client with valid JWT',
      status: 'PASS',
      details: `connected socketId=${connectedSocket.id}`,
    });
  } catch (error) {
    results.push({
      check: 'Connect socket client with valid JWT',
      status: 'FAIL',
      details: error.message,
    });
    throw error;
  } finally {
    if (connectedSocket) connectedSocket.disconnect();
  }

  // Missing token rejected
  let rejected = false;
  try {
    await connectSocket(undefined, 'kitchen');
  } catch (error) {
    rejected = true;
    results.push({
      check: 'Connect socket client without JWT',
      status: 'PASS',
      details: `rejected as expected: ${error.message}`,
    });
  }

  if (!rejected) {
    results.push({
      check: 'Connect socket client without JWT',
      status: 'FAIL',
      details: 'unexpectedly connected without token',
    });
    throw new Error('Socket accepted connection without JWT');
  }

  // Health check
  const response = await fetch(`${BASE_URL}/health`);
  const bodyText = await response.text();

  if (response.status !== 200) {
    results.push({
      check: 'curl /health returns 200',
      status: 'FAIL',
      details: `status=${response.status} body=${bodyText}`,
    });
    throw new Error(`/health returned ${response.status}`);
  }

  results.push({
    check: 'curl /health returns 200',
    status: 'PASS',
    details: bodyText,
  });

  console.log('\nSocket Auth + Health Checklist');
  console.table(results);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nExecution failed:', error.message);
    process.exit(1);
  });
