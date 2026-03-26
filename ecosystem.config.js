module.exports = {
  apps: [
    {
      name: 'api',
      script: 'node backend/dist/index.js',
      instances: 1,
    },
    {
      name: 'workers',
      script: 'node backend/dist/workers.js',
      instances: 1,
    },
  ],
};
