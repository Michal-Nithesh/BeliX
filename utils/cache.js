/**
 * In-Memory Caching System
 * 
 * Performance optimization layer for frequently accessed data:
 * - TTL-based cache invalidation (automatic expiry)
 * - Manual cache invalidation triggers
 * - Fallback to database on cache miss
 * - Cache hit/miss metrics for monitoring
 * - Type-specific caching strategies
 * 
 * For distributed deployments (sharded bot):
 * - Can be upgraded to Redis without changing interface
 * - Suitable for data that doesn't require real-time sync across shards
 * 
 * Candidates for caching:
 * - Leaderboard (refresh every 5 minutes)
 * - Daily question (refresh daily)
 * - Terminologies (refresh daily)
 * - Member profiles (if frequently accessed)
 */

const logger = require('./logger');

/**
 * Cached value with metadata
 */
class CacheEntry {
    constructor(value, ttl) {
        this.value = value;
        this.createdAt = Date.now();
        this.ttl = ttl; // milliseconds
        this.hits = 0;
        this.lastAccessed = Date.now();
    }

    /**
     * Check if cache entry has expired
     */
    isExpired() {
        return Date.now() - this.createdAt > this.ttl;
    }

    /**
     * Record cache hit for metrics
     */
    recordHit() {
        this.hits++;
        this.lastAccessed = Date.now();
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            createdAt: this.createdAt,
            lastAccessed: this.lastAccessed,
            hits,
            age: Date.now() - this.createdAt,
            ttl: this.ttl,
        };
    }
}

/**
 * Main Cache Manager
 */
class CacheManager {
    constructor() {
        // Map structure: cacheKey -> CacheEntry
        this.store = new Map();
        this.metrics = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
        };
        
        // Auto-cleanup expired entries every 10 minutes
        this.startAutoCleanup();
    }

    /**
     * Set cache value with TTL
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - Time-to-live in milliseconds
     */
    set(key, value, ttl = 300000) { // Default 5 minutes
        try {
            this.store.set(key, new CacheEntry(value, ttl));
            this.metrics.sets++;

            logger.debug('Cache set', {
                key,
                ttl,
                size: this.store.size,
            });
        } catch (error) {
            logger.error('Cache set error', {
                key,
                error: error.message,
            });
        }
    }

    /**
     * Get cache value
     * @param {string} key - Cache key
     * @returns {*} Value or null if expired/not found
     */
    get(key) {
        try {
            const entry = this.store.get(key);

            if (!entry) {
                this.metrics.misses++;
                return null;
            }

            // Check expiration
            if (entry.isExpired()) {
                this.store.delete(key);
                this.metrics.misses++;
                return null;
            }

            // Record hit
            entry.recordHit();
            this.metrics.hits++;

            logger.debug('Cache hit', {
                key,
                hits: entry.hits,
            });

            return entry.value;
        } catch (error) {
            logger.error('Cache get error', {
                key,
                error: error.message,
            });
            return null;
        }
    }

    /**
     * Get or set pattern for cleaner code
     * Usage: const leaderboard = await cache.getOrSet(
     *   'leaderboard', 
     *   () => db.getLeaderboard(),
     *   300000 // 5 minutes
     * );
     */
    async getOrSet(key, fetchFn, ttl = 300000) {
        // Try cache first
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        // Cache miss - fetch from function
        try {
            const value = await fetchFn();
            this.set(key, value, ttl);
            return value;
        } catch (error) {
            logger.error('Cache getOrSet fetch error', {
                key,
                error: error.message,
            });
            throw error;
        }
    }

    /**
     * Delete specific cache entry
     */
    delete(key) {
        const hadEntry = this.store.has(key);
        this.store.delete(key);
        
        if (hadEntry) {
            this.metrics.deletes++;
            logger.debug('Cache invalidated', { key });
        }

        return hadEntry;
    }

    /**
     * Clear entire cache
     */
    clear() {
        const size = this.store.size;
        this.store.clear();
        logger.info('Cache cleared', { entriesRemoved: size });
    }

    /**
     * Auto-cleanup expired entries
     */
    startAutoCleanup() {
        setInterval(() => {
            const before = this.store.size;
            
            for (const [key, entry] of this.store.entries()) {
                if (entry.isExpired()) {
                    this.store.delete(key);
                    this.metrics.deletes++;
                }
            }

            const after = this.store.size;
            const removed = before - after;

            if (removed > 0) {
                logger.debug('Cache cleanup', {
                    entriesRemoved: removed,
                    remainingEntries: after,
                });
            }
        }, 600000); // Every 10 minutes
    }

    /**
     * Get cache statistics for monitoring
     */
    getStats() {
        const hitRate = this.metrics.hits + this.metrics.misses > 0
            ? (this.metrics.hits / (this.metrics.hits + this.metrics.misses) * 100).toFixed(2)
            : 0;

        return {
            ...this.metrics,
            hitRate: `${hitRate}%`,
            entriesStored: this.store.size,
            estimatedMemory: this.estimateMemoryUsage(),
        };
    }

    /**
     * Rough estimation of memory usage (not including entry structure overhead)
     */
    estimateMemoryUsage() {
        let bytes = 0;
        for (const entry of this.store.values()) {
            bytes += JSON.stringify(entry.value).length * 2; // UTF-16
        }
        return `${(bytes / 1024).toFixed(2)} KB`;
    }
}

// ============ SINGLETON INSTANCE ============

const cache = new CacheManager();

// ============ SPECIALIZED CACHE STRATEGIES ============

/**
 * Leaderboard Cache Handler
 * - Refresh every 5 minutes
 * - Manual invalidation when points change
 */
class LeaderboardCacheHandler {
    constructor() {
        this.cacheKey = 'leaderboard:top10';
        this.ttl = 300000; // 5 minutes
    }

    async get(fetchFn) {
        return cache.getOrSet(this.cacheKey, fetchFn, this.ttl);
    }

    invalidate() {
        cache.delete(this.cacheKey);
        logger.info('Leaderboard cache invalidated');
    }
}

/**
 * Daily Question Cache Handler
 * - Refresh every 24 hours
 * - Manual invalidation on schedule update
 */
class DailyQuestionCacheHandler {
    constructor() {
        this.cacheKey = 'question:daily';
        this.ttl = 86400000; // 24 hours
    }

    async get(fetchFn) {
        return cache.getOrSet(this.cacheKey, fetchFn, this.ttl);
    }

    invalidate() {
        cache.delete(this.cacheKey);
        logger.info('Daily question cache invalidated');
    }
}

/**
 * Terminology Cache Handler
 * - Refresh every 24 hours
 * - Manual invalidation on rotation
 */
class TerminologyCacheHandler {
    constructor() {
        this.cacheKey = 'terminology:daily';
        this.ttl = 86400000; // 24 hours
    }

    async get(fetchFn) {
        return cache.getOrSet(this.cacheKey, fetchFn, this.ttl);
    }

    invalidate() {
        cache.delete(this.cacheKey);
        logger.info('Terminology cache invalidated');
    }
}

// ============ EXPORTS ============

const leaderboardCache = new LeaderboardCacheHandler();
const dailyQuestionCache = new DailyQuestionCacheHandler();
const terminologyCache = new TerminologyCacheHandler();

module.exports = {
    cache,
    leaderboardCache,
    dailyQuestionCache,
    terminologyCache,
    CacheManager,
    CacheEntry,
};
