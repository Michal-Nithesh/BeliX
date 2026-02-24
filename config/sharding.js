/**
 * Discord.js Sharding Manager
 * 
 * Enables horizontal scaling of bot across multiple processes/machines
 * 
 * What is sharding?
 * - Discord requires sharding for bots in 2,500+ servers
 * - Each shard handles subset of servers (reduces Gateway connections)
 * - Allows bot to handle more concurrent events
 * 
 * Setup: Use this manager in bot.js (main process)
 * Alternative: Use index.js with ShardClientUtil for worker processes
 * 
 * Production deployment:
 * - Run with PM2 cluster mode
 * - Use Redis for cross-shard caching/communication
 * - Monitor shard health separately
 */

const { ShardingManager } = require('discord.js');
const path = require('path');
const logger = require('../utils/logger');
const config = require('./constants');

/**
 * Initialize sharding manager for production deployment
 * This runs in the main process and spawns worker processes
 */
async function initializeShardingManager() {
    // Sharding is optional - can run single process for dev/small bots
    if (!config.sharding.enabled) {
        logger.info('Sharding disabled - running in single process mode');
        return null;
    }

    const manager = new ShardingManager(path.join(__dirname, '../botWorker.js'), {
        token: config.bot.token,
        totalShards: config.sharding.shardCount,
        shardsPerProcess: config.sharding.shardsPerProcess,
        respawn: true, // Auto-respawn dead shards
    });

    // ========== SHARD LIFECYCLE EVENTS ==========

    /**
     * Shard spawn event
     * Triggered when a new shard process is created
     */
    manager.on('shardCreate', (shard) => {
        logger.info('Shard created', {
            shardId: shard.id,
            totalShards: manager.totalShards,
        });

        // Monitor shard for lifecycle events
        shard.on('disconnect', () => {
            logger.warn('Shard disconnected', { shardId: shard.id });
        });

        shard.on('reconnecting', () => {
            logger.warn('Shard reconnecting', { shardId: shard.id });
        });

        shard.on('ready', () => {
            logger.info('Shard ready', { shardId: shard.id });
        });
    });

    /**
     * Spawn all shards and wait for ready
     */
    try {
        await manager.spawn({ delay: 5500, timeout: 30000 });
        logger.info('All shards spawned successfully', {
            totalShards: manager.totalShards,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('Failed to spawn shards', {
            error: error.message,
            stack: error.stack,
        });
        throw error;
    }

    // ========== SHARD COMMUNICATION ==========

    /**
     * Example: Broadcast message to all shards
     * Useful for coordinating behavior across shards
     * Usage: await manager.broadcast({ type: 'CACHE_INVALIDATE', key: 'leaderboard' })
     */
    manager.on('message', (shard, message) => {
        logger.debug('Message from shard', {
            shardId: shard.id,
            messageType: message.type,
        });
    });

    // ========== MONITORING & HEALTH CHECKS ==========

    /**
     * Periodic health check of all shards
     */
    setInterval(async () => {
        try {
            const shards = manager.shards.map((shard) => ({
                id: shard.id,
                ready: shard.ready,
                process: shard.process ? shard.process.connected : false,
                uptime: shard.uptime || 0,
            }));

            logger.debug('Shard health check', { shards });
        } catch (error) {
            logger.error('Error during health check', { error: error.message });
        }
    }, 60000); // Every minute

    return manager;
}

/**
 * Export for use in main bot.js as sharding manager
 */
module.exports = { initializeShardingManager };
