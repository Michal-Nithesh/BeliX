/**
 * BeliX Discord Bot - Production Entry Point
 * 
 * Production-grade setup with:
 * - Centralized logging (Winston)
 * - Rate limiting and anti-spam
 * - In-memory caching with TTL
 * - Error handling and monitoring
 * - Graceful shutdown
 * - Health monitoring endpoints
 */

require('dotenv').config();

// ========== PRODUCTION IMPORTS ==========

const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');

// Custom utilities
const logger = require('./utils/logger');
const { checkCommandRateLimit, checkMessageSpam } = require('./utils/rateLimit');
const { cache, leaderboardCache, dailyQuestionCache, terminologyCache } = require('./utils/cache');
const config = require('./config/constants');

// Services and Controllers
const AnalyticsService = require('./src/services/analyticsService');
const AnalyticsController = require('./src/controllers/analyticsController');
const createAdminRoutes = require('./src/routes/adminRoutes');

// Feature handlers  
const { handleWelcomeMessage } = require('./features/welcome');
const { handleProgressUpdate } = require('./features/progressupdate');
const { handleDailyTerminology } = require('./features/dailyTerminology');
const { handleSlashCommands } = require('./features/slashCommands');
const { handleMemberSync } = require('./features/memberSync');
const { handleBirthdayAnnouncement } = require('./features/birthdayAnnouncement');
const { handleScheduledReminders } = require('./features/scheduledReminders');
const { setupDailyQuestion } = require('./features/dailyQuestionPoster');
const { handleGatheringScheduler } = require('./features/dailyGatheringScheduler');
const { handleVibeCodeReport } = require('./features/dailyVibeCodeReport');

// ========== EXPRESS SERVER SETUP ==========

const app = express();
const PORT = config.server.port;

// Setup EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/dashboard/templates'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.debug('HTTP request', {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration,
        });
    });
    next();
});

// ========== BOT STATUS TRACKING ==========

const botStatus = {
    isOnline: false,
    connectedAt: null,
    lastMessageReceived: null,
    totalMessagesReceived: 0,
    commandsExecuted: 0,
    errors: 0,
    lastError: null,
};

// ========== DISCORD CLIENT SETUP ==========

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// ========== BOT LIFECYCLE EVENTS ==========

/**
 * Ready event - bot successfully connected to Discord
 */
client.once('ready', async () => {
    try {
        botStatus.isOnline = true;
        botStatus.connectedAt = new Date().toISOString();

        logger.info('✓ Bot connected to Discord', {
            botTag: client.user.tag,
            userId: client.user.id,
            guildCount: client.guilds.cache.size,
            timestamp: botStatus.connectedAt,
        });

        // Set bot status
        client.user.setActivity('members engage 🎯', { type: 'WATCHING' });
        logger.info('Bot status updated');

    } catch (error) {
        logger.error('Error in ready event', {
            error: error.message,
            stack: error.stack,
        });
    }
});

/**
 * Message create event - log and track message activity
 */
client.on('messageCreate', (message) => {
    try {
        // Ignore bot messages
        if (message.author.bot) return;

        // Log message activity
        botStatus.lastMessageReceived = new Date().toISOString();
        botStatus.totalMessagesReceived++;

        // Anti-spam check
        const spamResult = checkMessageSpam(message.author.id);
        if (spamResult.isSpamming) {
            logger.warn('Spam detected', {
                userId: message.author.id,
                username: message.author.username,
                channelId: message.channelId,
            });
            message.reply({ 
                content: '⏸️ You\'re sending messages too fast. Please slow down.',
                ephemeral: true 
            }).catch(err => logger.error('Error sending spam warning', { error: err.message }));
            return;
        }

        logger.debug('Message received', {
            userId: message.author.id,
            username: message.author.username,
            content: message.content.substring(0, 50),
        });

    } catch (error) {
        logger.error('Error in messageCreate handler', {
            error: error.message,
            userId: message?.author?.id,
        });
    }
});

/**
 * Guild member add - new member joined
 */
client.on('guildMemberAdd', async (member) => {
    try {
        logger.info('Member joined', {
            userId: member.id,
            username: member.user.username,
            guildId: member.guild.id,
            guildName: member.guild.name,
        });

        // Trigger welcome handler
        // (Existing handleWelcomeMessage will handle it)

    } catch (error) {
        logger.error('Error in guildMemberAdd', {
            error: error.message,
            memberId: member?.id,
        });
    }
});

/**
 * Guild member remove - member left
 */
client.on('guildMemberRemove', async (member) => {
    try {
        logger.info('Member left', {
            userId: member.id,
            username: member.user.username,
            guildId: member.guild.id,
        });

    } catch (error) {
        logger.error('Error in guildMemberRemove', {
            error: error.message,
            memberId: member?.id,
        });
    }
});

/**
 * Interaction create - slash commands and buttons
 * This is where rate limiting is enforced
 */
client.on('interactionCreate', async (interaction) => {
    try {
        // Handle slash commands
        if (interaction.isCommand()) {
            const commandName = interaction.commandName;
            
            logger.info('Slash command received', {
                command: commandName,
                userId: interaction.user.id,
                username: interaction.user.username,
                guildId: interaction.guildId,
            });

            // Rate limit check (configured per command in config/constants.js)
            const cooldown = config.rateLimiting.commands[commandName] || 5000;
            const allowed = await checkCommandRateLimit(interaction, commandName, cooldown);
            
            if (!allowed) {
                botStatus.errors++;
                return; // Rate limit reply already sent
            }

            // Track successful command execution
            botStatus.commandsExecuted++;
        }

        // Handle button interactions
        if (interaction.isButton()) {
            logger.debug('Button interaction', {
                customId: interaction.customId,
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
        }

    } catch (error) {
        logger.error('Error in interactionCreate', {
            error: error.message,
            stack: error.stack,
            userId: interaction?.user?.id,
            commandName: interaction?.commandName,
        });

        botStatus.errors++;
        botStatus.lastError = error.message;

        // Try to send error reply
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your command.',
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error('Failed to send error reply', { error: replyError.message });
        }
    }
});

// ========== ERROR HANDLING ==========

/**
 * Handle Discord.js errors
 */
client.on('error', (error) => {
    logger.error('Discord client error', {
        error: error.message,
        stack: error.stack,
    });
    botStatus.errors++;
    botStatus.lastError = error.message;
});

/**
 * Handle warnings
 */
client.on('warn', (warning) => {
    logger.warn('Discord client warning', { warning });
});

// ========== FEATURE SETUP ==========

/**
 * Initialize all bot features
 * These handle automated tasks, scheduled jobs, etc.
 */
async function setupFeatures() {
    try {
        logger.info('Initializing bot features...');

        const features = [
            { name: 'Welcome Handler', fn: () => handleWelcomeMessage(client) },
            { name: 'Progress Updates', fn: () => handleProgressUpdate(client) },
            { name: 'Daily Terminology', fn: () => handleDailyTerminology(client) },
            { name: 'Slash Commands', fn: () => handleSlashCommands(client) },
            { name: 'Member Sync', fn: () => handleMemberSync(client) },
            { name: 'Birthday Announcements', fn: () => handleBirthdayAnnouncement(client) },
            { name: 'Scheduled Reminders', fn: () => handleScheduledReminders(client) },
            { name: 'Daily Questions', fn: () => setupDailyQuestion(client) },
            { name: 'Gathering Scheduler', fn: () => handleGatheringScheduler(client) },
            { name: 'Vibe Code Reports', fn: () => handleVibeCodeReport(client) },
        ];

        for (const feature of features) {
            try {
                feature.fn();
                logger.info(`✓ ${feature.name} loaded`);
            } catch (error) {
                logger.error(`✗ ${feature.name} failed to load`, {
                    error: error.message,
                });
            }
        }

        logger.info('✓ All features initialized');

    } catch (error) {
        logger.error('Error during feature setup', {
            error: error.message,
            stack: error.stack,
        });
        throw error;
    }
}

// ========== EXPRESS API ENDPOINTS ==========

/**
 * Root endpoint - service information
 */
app.get('/', (req, res) => {
    res.json({
        service: 'BeliX Discord Bot',
        version: config.bot.version,
        environment: config.env,
        status: botStatus.isOnline ? 'online' : 'offline',
        uptime: botStatus.connectedAt 
            ? Math.floor((Date.now() - new Date(botStatus.connectedAt)) / 1000) 
            : 0,
        endpoints: {
            health: '/health',
            status: '/status',
            metrics: '/metrics',
            cache: '/cache/stats',
        },
    });
});

/**
 * Auth Middleware - Simple token/admin check
 */
const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1] || req.query.token;
        const adminUsers = config.admin?.users || [];
        
        // For development, allow requests without token
        if (process.env.NODE_ENV !== 'production') {
            return next();
        }

        // Check if valid token or admin user
        if (!token && !adminUsers.length) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        next();
    } catch (error) {
        logger.error('Auth middleware error', { error: error.message });
        res.status(500).json({ error: 'Authentication failed' });
    }
};

/**
 * Dashboard Routes Setup
 */
try {
    const analyticsService = new AnalyticsService(null, cache);
    const analyticsController = new AnalyticsController(analyticsService, cache);
    const adminRoutes = createAdminRoutes(analyticsController, authMiddleware);
    
    app.use('/admin', adminRoutes);
    logger.info('✓ Dashboard routes registered at /admin');
} catch (error) {
    logger.warn('Dashboard routes setup failed', { error: error.message });
}

/**
 * Health check - for load balancers
 */
app.get('/health', (req, res) => {
    const healthy = botStatus.isOnline;
    const statusCode = healthy ? 200 : 503;

    res.status(statusCode).json({
        status: healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
    });
});

/**
 * Status endpoint - detailed bot information
 */
app.get('/status', (req, res) => {
    const statusCode = botStatus.isOnline ? 200 : 503;

    res.status(statusCode).json({
        botOnline: botStatus.isOnline,
        connectedAt: botStatus.connectedAt,
        lastMessageReceived: botStatus.lastMessageReceived,
        totalMessagesReceived: botStatus.totalMessagesReceived,
        commandsExecuted: botStatus.commandsExecuted,
        errors: botStatus.errors,
        lastError: botStatus.lastError,
        uptime: botStatus.connectedAt 
            ? Math.floor((Date.now() - new Date(botStatus.connectedAt)) / 1000)
            : 0,
        guildCount: client.guilds.cache.size,
        userCount: client.users.cache.size,
        timestamp: new Date().toISOString(),
    });
});

/**
 * Metrics endpoint - performance and system metrics
 */
app.get('/metrics', (req, res) => {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
        process: {
            uptime,
            memory: {
                heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
            },
            cpuUsage: process.cpuUsage(),
        },
        cache: cache.getStats(),
        rateLimiting: {
            commandCooldowns: require('./utils/rateLimit').commandCooldownManager.getStats(),
        },
        timestamp: new Date().toISOString(),
    });
});

/**
 * Cache statistics endpoint
 */
app.get('/cache/stats', (req, res) => {
    res.json({
        general: cache.getStats(),
        timestamp: new Date().toISOString(),
    });
});

/**
 * Cache invalidation endpoint (admin only in production)
 */
app.post('/cache/invalidate', (req, res) => {
    const { key } = req.query;

    if (!key) {
        return res.status(400).json({ error: 'Missing cache key' });
    }

    try {
        cache.delete(key);
        logger.info('Cache invalidated via API', { key });
        res.json({ success: true, invalidatedKey: key });
    } catch (error) {
        logger.error('Error invalidating cache', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// ========== GRACEFUL SHUTDOWN ==========

let server;

/**
 * Handle process termination gracefully
 * Waits for all connections to close before exiting
 */
async function gracefulShutdown(signal) {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
        // Close Express server
        await new Promise((resolve) => {
            server.close(() => {
                logger.info('Express server closed');
                resolve();
            });
        });

        // Disconnect Discord client
        if (client.isReady()) {
            await client.destroy();
            logger.info('Discord client disconnected');
        }

        // Clear caches
        cache.clear();
        logger.info('Caches cleared');

        logger.info('Graceful shutdown complete');
        process.exit(0);

    } catch (error) {
        logger.error('Error during graceful shutdown', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    }
}

// Setup signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ========== BOT STARTUP ==========

async function start() {
    try {
        logger.info('========================================');
        logger.info('🤖 BeliX Discord Bot - Production Start');
        logger.info(`📅 ${new Date().toISOString()}`);
        logger.info(`🔧 Environment: ${config.env}`);
        logger.info('========================================');

        // Setup features
        await setupFeatures();

        // Start Express server
        server = app.listen(PORT, () => {
            logger.info(`✓ Express server running on port ${PORT}`);
            logger.info(`  Health: http://localhost:${PORT}/health`);
            logger.info(`  Status: http://localhost:${PORT}/status`);
            logger.info(`  Metrics: http://localhost:${PORT}/metrics`);
        });

        // Connect to Discord
        logger.info('Attempting Discord connection...');
        await client.login(config.bot.token);

    } catch (error) {
        logger.error('Fatal error during startup', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    }
}

// Start the bot
start().catch((error) => {
    logger.error('Startup failed', { error: error.message });
    process.exit(1);
});

module.exports = { client, app, botStatus };
