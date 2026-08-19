module.exports = {
  apps: [
    {
      name: 'drawer-server',
      script: 'server/src/index.js',
      env: {
        PORT: 5002,
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M'
    },
    {
      name: 'drawer-dashboard',
      script: 'npm',
      args: 'start',
      cwd: './dashboard',
      env: {
        PORT: 5003,
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M'
    }
  ]
};
