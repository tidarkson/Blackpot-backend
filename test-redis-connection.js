const Redis = require('ioredis');

console.log('🧪 Testing Redis Cloud Connection with ioredis...\n');

const redis = new Redis({
  host: 'redis-15852.c341.af-south-1-1.ec2.cloud.redislabs.com',
  port: 15852,
  password: 'hi11sNva11ey$',
  db: 0,
  retryStrategy: (times) => {
    if (times > 5) {
      console.error(`❌ Failed after ${times} retries`);
      return new Error('Max retries exceeded');
    }
    return Math.min(times * 50, 500);
  },
  connectTimeout: 10000,
  commandTimeout: 5000,
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  console.log('✅ Redis connected (socket connected)');
});

redis.on('ready', () => {
  console.log('✅ Redis ready for commands');
});

redis.on('error', (err) => {
  console.error('❌ Redis Error:', err.message);
});

(async () => {
  try {
    const pongReply = await redis.ping();
    console.log('✅ PING Response:', pongReply);

    await redis.set('test-key', 'test-value');
    console.log('✅ SET test-key successful');

    const value = await redis.get('test-key');
    console.log('✅ GET test-key:', value);

    const info = await redis.info('server');
    console.log('✅ Server info:', info.substring(0, 200) + '...');

    await redis.del('test-key');
    console.log('✅ Deleted test-key');
    
    console.log('\n✅ ALL REDIS CONNECTIVITY TESTS PASSED');
    await redis.quit();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during testing:', err.message);
    process.exit(1);
  }
})();
