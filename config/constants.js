/**
 * Configuration Constants
 * 
 * Centralized configuration for production deployments
 * Allows easy adjustment without code changes
 */

const env = process.env.NODE_ENV || 'development';

const config = {
    // ========== ENVIRONMENT ==========
    env,
    isDevelopment: env === 'development',
    isProduction: env === 'production',

    // ========== BOT CONFIG ==========
    bot: {
        token: process.env.DISCORD_TOKEN,
        guildId: process.env.GUILD_ID,
        version: '1.0.0',
    },

    // ========== DATABASE CONFIG ==========
    database: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY,
        retryAttempts: 3,
        retryDelay: 1000, // milliseconds
        connectionTimeout: 5000,
    },

    // ========== SERVER CONFIG ==========
    server: {
        port: parseInt(process.env.PORT) || 3000,
        host: process.env.HOST || 'localhost',
        trustProxy: process.env.TRUST_PROXY !== 'false',
    },

    // ========== LOGGING CONFIG ==========
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        consoleLevelOverride: process.env.CONSOLE_LOG_LEVEL || 'info',
        format: 'json', // 'json' or 'text'
    },

    // ========== RATE LIMITING CONFIG ==========
    rateLimiting: {
        // Command cooldowns (in milliseconds)
        commands: {
            default: 5000, // 5 seconds
            leaderboard: 3000, // 3 seconds
            mypoints: 3000,
            terminology: 10000, // 10 seconds (cached anyway)
            dailyQuestions: 5000,
        },

        // Message spam thresholds
        antiSpam: {
            messageThreshold: 5, // Allow 5 messages
            timeWindow: 5000, // Per 5 seconds
            autoMuteDuration: 30000, // Mute for 30 seconds
        },

        // Leaderboard farming prevention
        farmingPrevention: {
            minIntervalBetweenPointsUpdates: 30000, // 30 seconds
        },
    },

    // ========== CACHING CONFIG ==========
    caching: {
        enabled: !env.includes('no-cache'),
        ttl: {
            leaderboard: 5 * 60 * 1000, // 5 minutes
            dailyQuestion: 24 * 60 * 60 * 1000, // 24 hours
            terminology: 24 * 60 * 60 * 1000, // 24 hours
            memberProfile: 10 * 60 * 1000, // 10 minutes
        },
        cleanupInterval: 10 * 60 * 1000, // Run cleanup every 10 minutes
    },

    // ========== SCHEDULING CONFIG ==========
    scheduling: {
        timezone: process.env.TZ || 'Asia/Kolkata',
        
        dailyTerminology: {
            hour: 21, // 9:00 PM
            minute: 0,
        },

        vibeCodeReport: {
            hour: 23, // 11:00 PM
            minute: 50,
        },

        memberSync: {
            hour: 1, // 1:00 AM
            minute: 0,
            intervalMinutes: 60, // Run every hour
        },
    },

    // ========== CHANNELS CONFIG ==========
    channels: {
        introduction: process.env.introduction,
        announcements: process.env.announcements,
        commonHall: process.env['common-hall'],
        tinkering: process.env.tinkering,
        vibeCoding: process.env['vibe-coding'],
        reports: process.env.reports || '1475575831601610862',
    },

    // ========== ROLES CONFIG ==========
    roles: {
        rookieName: (process.env.ROOKIE_ROLE_NAME || 'rookies').toLowerCase(),
    },

    // ========== MONITORING CONFIG ==========
    monitoring: {
        enableMetrics: !env.includes('no-metrics'),
        metricsInterval: 60000, // Report metrics every minute
        errorWebhookUrl: process.env.ERROR_WEBHOOK_URL,
        healthCheckInterval: 30000, // Check health every 30 seconds
    },

    // ========== SHARDING CONFIG ==========
    sharding: {
        enabled: process.env.ENABLE_SHARDING === 'true',
        shardCount: parseInt(process.env.SHARD_COUNT) || 2,
        shardsPerProcess: parseInt(process.env.SHARDS_PER_PROCESS) || 2,
    },

    // ========== REDIS CONFIG (for distributed caching) ==========
    redis: {
        enabled: process.env.REDIS_ENABLED === 'true',
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        retryStrategy: {
            retries: 3,
            factor: 2,
            minTimeout: 1000,
            maxTimeout: 60000,
        },
    },

    // ========== PM2 CONFIG ==========
    pm2: {
        enabled: process.env.USE_PM2 === 'true',
        instances: process.env.PM2_INSTANCES || 'max',
        autoRestart: true,
        autorestart_on_memory_limit: 200, // MB
    },

    // ========== VALIDATION ==========
    isValid() {
        const required = ['bot.token', 'bot.guildId', 'database.url', 'database.anonKey'];
        for (const field of required) {
            const [parent, key] = field.split('.');
            if (!this[parent]?.[key]) {
                throw new Error(`Missing required config: ${field}`);
            }
        }
        return true;
    },
};

// Validate on load
try {
    config.isValid();
} catch (error) {
    console.error('Configuration validation failed:', error.message);
    process.exit(1);
}

module.exports = config;
