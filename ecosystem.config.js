module.exports = {
  apps: [
    {
      name: 'bot-auto-reply',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      autopause: false,
      max_memory_restart: '256M',
    },
  ],
};
