/**
 * PM2 Ecosystem Configuration
 * 
 * PM2 is a production process manager for Node.js
 * 
 * Benefits:
 * - Auto-restart on crash
 * - Cluster mode (spawn multiple instances)
 * - Memory monitoring (auto-restart if exceeds limit)
 * - Log management and rotation
 * - Environment variable management
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --only belix-bot
 *   pm2 start ecosystem.config.js --only belix-monitor
 *   pm2 status
 *   pm2 logs belix-bot
 *   pm2 delete ecosystem.config.js
 */

const os = require('os');

module.exports = {
    /**
     * Applications configuration
     */
    apps: [
        // ========== MAIN BOT PROCESS ==========
        {
            name: 'belix-bot',
            script: './index.js',
            
            // Auto-restart on crash
            autorestart: true,
            watch: false, // Set to true to watch file changes in development
            ignore_watch: ['node_modules', 'logs', 'json'],
            
            // Environment variables
            env: {
                NODE_ENV: 'production',
                LOG_LEVEL: 'info',
                CONSOLE_LOG_LEVEL: 'warn',
                APP_VERSION: '1.0.0',
            },
            
            // Error handling
            error_file: './logs/belix-bot-error.log',
            out_file: './logs/belix-bot-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            
            // Memory management
            // Auto-restart if bot exceeds 500 MB
            max_memory_restart: '500M',
            
            // Graceful shutdown (wait 5 seconds before force kill)
            kill_timeout: 5000,
            
            // Instance count - can be:
            // - Number: specific instance count
            // - 'max': spawn instance per CPU core
            // - Leave undefined for single instance
            instances: 1, // Use 'max' only if load balancing is needed
            
            // Merge stdout/stderr from cluster instances
            merge_logs: true,
            
            // Additional command line arguments
            args: '',
        },

        // ========== HEALTH MONITOR PROCESS ==========
        // Optional: Separate process to monitor bot health
        {
            name: 'belix-monitor',
            script: './monitoring/healthMonitor.js',
            autorestart: true,
            watch: false,
            ignore_watch: ['node_modules', 'logs'],
            
            env: {
                NODE_ENV: 'production',
                LOG_LEVEL: 'info',
                MONITOR_INTERVAL: '30000', // Check every 30 seconds
            },
            
            error_file: './logs/belix-monitor-error.log',
            out_file: './logs/belix-monitor-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            max_memory_restart: '200M',
            kill_timeout: 3000,
            instances: 1,
        },
    ],

    /**
     * Global configuration for all apps
     */
    deploy: {
        production: {
            // SSH connection details
            user: 'ubuntu',
            host: 'your-production-server.com',
            ref: 'origin/main',
            repo: 'git repository',
            path: '/var/www/belix',
            
            // Commands to run on deploy
            'post-deploy': 'npm install && npm run start',
            'pre-deploy-local': 'echo "Deploying to production"',
        },
    },
};

/**
 * Notes for production deployment:
 * 
 * 1. RUN WITH: pm2 start ecosystem.config.js
 * 
 * 2. MAKE PM2 START ON SYSTEM BOOT:
 *    pm2 startup
 *    pm2 save
 * 
 * 3. MONITOR PROCESSES:
 *    pm2 status
 *    pm2 monit (real-time monitoring)
 *    pm2 logs
 * 
 * 4. UPDATE PROCESS:
 *    pm2 restart ecosystem.config.js
 *    pm2 reload ecosystem.config.js (graceful reload)
 * 
 * 5. CLUSTER MODE (if scaling):
 *    Change "instances: 'max'" to spawn per CPU core
 *    Use load balancer (nginx) in front
 * 
 * 6. MEMORY LIMITS:
 *    Adjust "max_memory_restart" based on your server
 *    Monitor with: pm2 monit
 * 
 * 7. LOG ROTATION:
 *    pm2 install pm2-logrotate
 *    pm2 set pm2-logrotate:max_size 10M
 *    pm2 set pm2-logrotate:retain 7
 */
