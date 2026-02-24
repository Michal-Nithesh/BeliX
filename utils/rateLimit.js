/**
 * Rate Limiting System
 * 
 * Production-grade throttling to prevent abuse:
 * - Per-user cooldown tracking (Map-based for O(1) lookups)
 * - Automatic cooldown cleanup to prevent memory leaks
 * - Graduated penalties (increased cooldown on repeated violations)
 * - Anti-spam detection for consecutive message/command abuse
 * - Leaderboard farming prevention (cooldown on point operations)
 * 
 * Strategy: In-memory Map for performance (< 1ms lookup)
 * Redis can be added for distributed deployments (sharded bot)
 */

const logger = require('./logger');

// ============ COOLDOWN MANAGERS ============

/**
 * Command Cooldown Manager
 * Prevents users from spamming slash commands
 */
class CommandCooldownManager {
    constructor() {
        // Map structure: userId -> { cmdName -> { expiresAt, violations } }
        this.cooldowns = new Map();
        this.cleanupInterval = 60000; // 1 minute cleanup cycle
        this.maxViolations = 3; // Escalate cooldown after X violations
        this.baseEscalation = 1000; // Add 1 second per violation
        
        // Start automatic cleanup
        this.startAutoCleanup();
    }

    /**
     * Check if user can run command
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Slash command name
     * @param {number} cooldownMs - Cooldown duration in milliseconds
     * @returns {Object} { allowed: boolean, retryAfter?: number }
     */
    checkCooldown(userId, commandName, cooldownMs = 5000) {
        const now = Date.now();
        
        // Initialize user map if doesn't exist
        if (!this.cooldowns.has(userId)) {
            this.cooldowns.set(userId, new Map());
        }

        const userCooldowns = this.cooldowns.get(userId);

        // Check if command is on cooldown
        if (userCooldowns.has(commandName)) {
            const cooldownData = userCooldowns.get(commandName);
            const isExpired = now >= cooldownData.expiresAt;

            if (!isExpired) {
                const retryAfter = Math.ceil((cooldownData.expiresAt - now) / 1000);
                
                // Increment violations for tracking
                cooldownData.violations = (cooldownData.violations || 0) + 1;

                logger.warn('Command cooldown triggered', {
                    userId,
                    command: commandName,
                    retryAfter,
                    violations: cooldownData.violations,
                });

                return {
                    allowed: false,
                    retryAfter,
                    violations: cooldownData.violations,
                };
            }
        }

        // Cooldown expired or first use - set new cooldown
        const violations = (userCooldowns.get(commandName)?.violations || 0);
        const escalatedCooldown = cooldownMs + (violations * this.baseEscalation);

        userCooldowns.set(commandName, {
            expiresAt: now + escalatedCooldown,
            violations: 0,
        });

        return { allowed: true };
    }

    /**
     * Reset cooldown for user (admin override or special cases)
     */
    resetCooldown(userId, commandName) {
        if (this.cooldowns.has(userId)) {
            this.cooldowns.get(userId).delete(commandName);
            logger.info('Cooldown reset', { userId, command: commandName });
        }
    }

    /**
     * Automatic cleanup of expired cooldowns
     * Prevents Map from growing unbounded in long-running bot
     */
    startAutoCleanup() {
        setInterval(() => {
            const now = Date.now();
            const expiredUsers = [];

            for (const [userId, commands] of this.cooldowns.entries()) {
                // Remove expired command cooldowns
                for (const [cmd, data] of commands.entries()) {
                    if (now >= data.expiresAt) {
                        commands.delete(cmd);
                    }
                }

                // Remove user if no active cooldowns
                if (commands.size === 0) {
                    expiredUsers.push(userId);
                }
            }

            for (const userId of expiredUsers) {
                this.cooldowns.delete(userId);
            }

            if (expiredUsers.length > 0) {
                logger.debug('Cooldown cleanup', {
                    usersRemoved: expiredUsers.length,
                    activeCooldowns: this.cooldowns.size,
                });
            }
        }, this.cleanupInterval);
    }

    /**
     * Get cooldown stats for monitoring
     */
    getStats() {
        return {
            totalUsers: this.cooldowns.size,
            totalActiveUsers: Array.from(this.cooldowns.values())
                .filter(cmds => cmds.size > 0).length,
        };
    }
}

// ============ ANTI-SPAM MANAGER ============

/**
 * Anti-Spam Detection
 * Detects rapid fire messages or commands
 * Useful for detecting bot farm automation
 */
class AntiSpamManager {
    constructor() {
        // Map structure: userId -> [timestamp1, timestamp2, ...]
        this.messageHistory = new Map();
        this.thresholds = {
            messageThreshold: 5, // Allow 5 messages
            timeWindow: 5000, // Per 5 seconds
            autoMute: 30000, // Mute for 30 seconds if violated
        };
    }

    /**
     * Check if user is spamming
     * @param {string} userId - Discord user ID
     * @returns {Object} { isSpamming: boolean, reason?: string }
     */
    checkSpam(userId) {
        const now = Date.now();

        if (!this.messageHistory.has(userId)) {
            this.messageHistory.set(userId, []);
        }

        const history = this.messageHistory.get(userId);

        // Remove messages older than time window
        const filteredHistory = history.filter(
            (timestamp) => now - timestamp < this.thresholds.timeWindow
        );

        // Check if exceeds threshold
        if (filteredHistory.length >= this.thresholds.messageThreshold) {
            logger.warn('Spam detected', {
                userId,
                messagesInWindow: filteredHistory.length,
                timeWindow: this.thresholds.timeWindow,
            });

            return {
                isSpamming: true,
                reason: 'Too many messages',
                muteDuration: this.thresholds.autoMute,
            };
        }

        // Add current message
        filteredHistory.push(now);
        this.messageHistory.set(userId, filteredHistory);

        return { isSpamming: false };
    }

    /**
     * Clear user spam history (on unmute)
     */
    clearUserHistory(userId) {
        this.messageHistory.delete(userId);
    }
}

// ============ LEADERBOARD FARMING PREVENTION ============

/**
 * Prevent leaderboard gaming through rapid point updates
 * Enforces cooldown between points operations
 */
class LeaderboardFarmingPrevention {
    constructor() {
        // Map structure: userId -> lastPointsUpdate timestamp
        this.lastPointsUpdate = new Map();
        this.minIntervalBetweenUpdates = 30000; // 30 seconds minimum
    }

    /**
     * Check if user can get points
     */
    canPerformAction(userId) {
        const now = Date.now();
        const lastUpdate = this.lastPointsUpdate.get(userId);

        if (!lastUpdate) {
            this.lastPointsUpdate.set(userId, now);
            return { allowed: true };
        }

        const timeSinceLastUpdate = now - lastUpdate;

        if (timeSinceLastUpdate < this.minIntervalBetweenUpdates) {
            const retryAfter = Math.ceil(
                (this.minIntervalBetweenUpdates - timeSinceLastUpdate) / 1000
            );

            return {
                allowed: false,
                retryAfter,
                reason: 'Points cooldown active',
            };
        }

        this.lastPointsUpdate.set(userId, now);
        return { allowed: true };
    }
}

// ============ SINGLETON INSTANCES ============

const commandCooldownManager = new CommandCooldownManager();
const antiSpamManager = new AntiSpamManager();
const leaderboardFarmingPrevention = new LeaderboardFarmingPrevention();

// ============ MIDDLEWARE-STYLE FUNCTIONS ============

/**
 * Rate limit middleware for slash commands
 * Usage in interactionCreate: await checkCommandRateLimit(interaction, commandName)
 */
async function checkCommandRateLimit(interaction, commandName, cooldownMs = 5000) {
    const result = commandCooldownManager.checkCooldown(
        interaction.user.id,
        commandName,
        cooldownMs
    );

    if (!result.allowed) {
        const message = `⏱️ This command is on cooldown. Try again in **${result.retryAfter}s**`;
        
        try {
            if (interaction.deferred) {
                await interaction.editReply(message);
            } else {
                await interaction.reply({ content: message, ephemeral: true });
            }
        } catch (err) {
            logger.error('Error sending rate limit reply', { error: err.message });
        }

        return false;
    }

    return true;
}

/**
 * Anti-spam check for messages
 * Usage: if (antiSpamManager.checkSpam(message.author.id).isSpamming) return;
 */
function checkMessageSpam(userId) {
    return antiSpamManager.checkSpam(userId);
}

/**
 * Leaderboard farming prevention check
 * Usage in points increment: if (!leaderboardFarmingPrevention.canPerformAction(userId).allowed) return error;
 */
function checkLeaderboardFarming(userId) {
    return leaderboardFarmingPrevention.canPerformAction(userId);
}

module.exports = {
    commandCooldownManager,
    antiSpamManager,
    leaderboardFarmingPrevention,
    checkCommandRateLimit,
    checkMessageSpam,
    checkLeaderboardFarming,
};
