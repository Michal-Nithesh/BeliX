/**
 * Leaderboard Service
 * Business logic for leaderboard operations
 */

const logger = require('../../utils/logger');

class LeaderboardService {
  constructor(leaderboardRepository, pointsRepository, cache) {
    this.leaderboardRepository = leaderboardRepository;
    this.pointsRepository = pointsRepository;
    this.cache = cache;
  }

  /**
   * Get leaderboard with caching
   */
  async getLeaderboard(limit = 10, offset = 0, useCache = true) {
    const cacheKey = `leaderboard:${limit}:${offset}`;

    if (useCache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        logger.debug('Leaderboard cache hit', { cacheKey });
        return cached;
      }
    }

    logger.info('Fetching leaderboard from database', { limit, offset });
    const data = await this.leaderboardRepository.getTopLeaderboard(limit, offset);

    // Add rank and formatting
    const formatted = data.map((member, i) => ({
      ...member,
      rank: offset + i + 1,
      formattedPoints: this.formatPoints(member.points),
    }));

    // Cache for 5 minutes
    await this.cache.set(cacheKey, formatted, 5 * 60);

    return formatted;
  }

  /**
   * Get member's rank and surrounding context
   */
  async getMemberRank(userId) {
    const cacheKey = `member-rank:${userId}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    logger.info('Fetching member rank', { userId });
    const rankContext = await this.leaderboardRepository.getMemberRankContext(userId, 5);

    // Cache for 2 minutes
    await this.cache.set(cacheKey, rankContext, 2 * 60);

    return rankContext;
  }

  /**
   * Get leaderboard by level
   */
  async getLeaderboardByLevel(level, limit = 10, offset = 0) {
    if (level < 1 || level > 50) {
      throw new Error('Invalid level');
    }

    const cacheKey = `leaderboard-level:${level}:${limit}:${offset}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    logger.info('Fetching leaderboard by level', { level, limit, offset });
    const data = await this.leaderboardRepository.getLeaderboardByLevel(level, limit, offset);

    const formatted = data.map((member, i) => ({
      ...member,
      rank: offset + i + 1,
      formattedPoints: this.formatPoints(member.points),
    }));

    await this.cache.set(cacheKey, formatted, 5 * 60);

    return formatted;
  }

  /**
   * Get trending members
   */
  async getTrendingMembers(limit = 10, hours = 24) {
    const cacheKey = `trending:${limit}:${hours}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    logger.info('Fetching trending members', { limit, hours });
    const trending = await this.leaderboardRepository.getTrendingMembers(limit, hours);

    await this.cache.set(cacheKey, trending, 30 * 60); // Cache 30 mins

    return trending;
  }

  /**
   * Get point growth leaders
   */
  async getPointGrowthLeaders(days = 7, limit = 10) {
    const cacheKey = `growth-leaders:${days}:${limit}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    logger.info('Fetching point growth leaders', { days, limit });
    const growth = await this.leaderboardRepository.getPointGrowth(days, limit);

    await this.cache.set(cacheKey, growth, 60 * 60); // Cache 1 hour

    return growth;
  }

  /**
   * Get member statistics
   */
  async getMemberStats(userId) {
    const cacheKey = `member-stats:${userId}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    logger.info('Fetching member stats', { userId });
    const stats = await this.leaderboardRepository.getMemberStats(userId);

    // Format stats
    const formatted = {
      ...stats,
      formattedPoints: this.formatPoints(stats.points),
      percentile: this.calculatePercentile(stats.rank, stats.totalMembers),
    };

    await this.cache.set(cacheKey, formatted, 10 * 60);

    return formatted;
  }

  /**
   * Invalidate leaderboard caches (call after points update)
   */
  async invalidateLeaderboardCaches() {
    const patterns = ['leaderboard:', 'member-rank:', 'member-stats:', 'trending:', 'growth-leaders:'];

    logger.info('Invalidating leaderboard caches');

    for (const pattern of patterns) {
      await this.cache.deletePattern(pattern);
    }
  }

  /**
   * Log leaderboard view
   */
  async logLeaderboardView(userId, viewType = 'general') {
    try {
      await this.leaderboardRepository.logLeaderboardView(userId, viewType);
      logger.debug('Leaderboard view logged', { userId, viewType });
    } catch (error) {
      // Non-critical, log but don't fail
      logger.warn('Failed to log leaderboard view', { userId, error: error.message });
    }
  }

  /**
   * Utility: Format points with commas
   */
  formatPoints(points) {
    return points.toLocaleString();
  }

  /**
   * Utility: Calculate percentile rank
   */
  calculatePercentile(rank, total) {
    return Math.round(((total - rank) / total) * 100);
  }

  /**
   * Get leaderboard embed data (formatted for Discord embed)
   */
  async getLeaderboardEmbedData(page = 1, pageSize = 10) {
    const offset = (page - 1) * pageSize;
    const leaderboard = await this.getLeaderboard(pageSize, offset);

    return {
      title: '📊 Leaderboard',
      description: 'Top Members by Points',
      fields: leaderboard.map(member => ({
        name: `#${member.rank} - ${member.username}`,
        value: `${this.formatPoints(member.points)} points • Level ${member.level}`,
        inline: false,
      })),
      color: 0x00ff00,
      footer: { text: `Page ${page}` },
    };
  }
}

module.exports = LeaderboardService;
