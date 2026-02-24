/**
 * Analytics Service
 * Business logic for analytics and dashboard data
 */

const logger = require('../../utils/logger');

class AnalyticsService {
  constructor(analyticsRepository, cache) {
    this.analyticsRepository = analyticsRepository;
    this.cache = cache;
  }

  /**
   * Get daily activity chart data
   */
  async getDailyActivityData(days = 30, useCache = true) {
    const cacheKey = `analytics:daily-activity:${days}`;

    if (useCache && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        logger.debug('Daily activity cache hit');
        return cached;
      }
    }

    logger.info('Fetching daily activity data', { days });

    // Generate mock data if repository not available
    const dailyData = this.analyticsRepository 
      ? await this.analyticsRepository.getDailyActivityCount(days)
      : this.generateMockDailyActivity(days);

    const formattedData = {
      labels: dailyData.map(d => d.date),
      datasets: [{
        label: 'Daily Activity',
        data: dailyData.map(d => d.count),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      }],
      summary: {
        totalActivities: dailyData.reduce((sum, d) => sum + d.count, 0),
        avgPerDay: Math.round(dailyData.reduce((sum, d) => sum + d.count, 0) / days),
        peakDay: dailyData.reduce((max, d) => d.count > max.count ? d : max),
      },
    };

    // Cache for 1 hour
    if (this.cache) {
      this.cache.set(cacheKey, formattedData, 60 * 60 * 1000);
    }

    return formattedData;
  }

  /**
   * Get points growth chart data
   */
  async getPointsGrowthData(days = 30, useCache = true) {
    const cacheKey = `analytics:points-growth:${days}`;

    if (useCache && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        logger.debug('Points growth cache hit');
        return cached;
      }
    }

    logger.info('Fetching points growth data', { days });

    const growthData = this.analyticsRepository
      ? await this.analyticsRepository.getPointsGrowthTrend(days)
      : this.generateMockPointsGrowth(days);

    const formattedData = {
      labels: growthData.map(d => d.date),
      datasets: [
        {
          label: 'Daily Points Earned',
          data: growthData.map(d => d.daily),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          yAxisID: 'y',
        },
        {
          label: 'Cumulative Points',
          data: growthData.map(d => d.cumulative),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.05)',
          yAxisID: 'y1',
          fill: false,
        },
      ],
      summary: {
        totalPointsEarned: growthData[growthData.length - 1]?.cumulative || 0,
        avgPerDay: Math.round(
          growthData.reduce((sum, d) => sum + d.daily, 0) / days
        ),
        peakDay: growthData.reduce((max, d) => d.daily > max.daily ? d : max),
      },
    };

    if (this.cache) {
      this.cache.set(cacheKey, formattedData, 60 * 60 * 1000);
    }

    return formattedData;
  }

  /**
   * Generate mock daily activity data
   */
  generateMockDailyActivity(days) {
    const data = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toISOString().split('T')[0],
        count: Math.floor(Math.random() * 50) + 10,
      });
    }
    return data;
  }

  /**
   * Generate mock points growth data
   */
  generateMockPointsGrowth(days) {
    const data = [];
    let cumulative = 0;
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const daily = Math.floor(Math.random() * 100) + 50;
      cumulative += daily;
      data.push({
        date: date.toISOString().split('T')[0],
        daily,
        cumulative,
      });
    }
    return data;
  }

  /**
   * Generate mock rookie progression data
   */
  generateMockRookieProgression(days) {
    const data = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toISOString().split('T')[0],
        newRookies: Math.floor(Math.random() * 15) + 5,
        progressionRate: (Math.random() * 50 + 30).toFixed(2),
      });
    }
    return data;
  }

  /**
   * Generate mock command usage data
   */
  generateMockCommandUsage(limit = 15) {
    const commands = ['/leaderboard', '/mypoints', '/dailyquestions', '/help', '/next', '/prev', '/terminology', '/question'];
    const data = commands.map(cmd => ({
      command: cmd,
      count: Math.floor(Math.random() * 500) + 50,
    })).sort((a, b) => b.count - a.count);
    return data.slice(0, limit);
  }

  /**
   * Generate mock active members data
   */
  generateMockActiveMembers(days) {
    const data = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toISOString().split('T')[0],
        uniqueMembers: Math.floor(Math.random() * 100) + 30,
      });
    }
    return data;
  }

  /**
   * Generate mock engagement metrics
   */
  generateMockEngagementMetrics(days) {
    const dailyActivities = this.generateMockDailyActivity(days);
    const totalActivities = dailyActivities.reduce((sum, d) => sum + d.count, 0);
    return {
      totalActivities,
      uniqueActiveMembers: Math.floor(Math.random() * 200) + 50,
      totalMembers: Math.floor(Math.random() * 500) + 200,
      engagementRate: (Math.random() * 40 + 30).toFixed(2),
      totalPointsDistributed: Math.floor(Math.random() * 50000) + 10000,
    };
  }

  /**
   * Generate mock retention metrics
   */
  generateMockRetentionMetrics() {
    return {
      retentionRate: (Math.random() * 30 + 60).toFixed(2),
      churnRate: (Math.random() * 10 + 5).toFixed(2),
    };
  }

  /**
   * Generate mock leaderboard trends
   */
  generateMockLeaderboardTrends() {
    const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
    const trends = [];
    for (let i = 0; i < 5; i++) {
      const name = names[Math.floor(Math.random() * names.length)];
      trends.push({
        userId: `user_${i}`,
        username: name,
        currentRank: Math.floor(Math.random() * 50) + 1,
        previousRank: Math.floor(Math.random() * 100) + 1,
        points: Math.floor(Math.random() * 10000) + 1000,
      });
    }
    return trends;
  }

  /**
   * Get rookie progression data
   */
  async getRookieProgressionData(days = 30, useCache = true) {
    const cacheKey = `analytics:rookie-progress:${days}`;

    if (useCache && this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        logger.debug('Rookie progression cache hit');
        return cached;
      }
    }

    logger.info('Fetching rookie progression data', { days });

    const progressionData = this.analyticsRepository 
      ? await this.analyticsRepository.getRookieProgressionRate(days)
      : this.generateMockRookieProgression(days);

    const formattedData = {
      labels: progressionData.map(d => d.date),
      datasets: [
        {
          label: 'New Rookies',
          data: progressionData.map(d => d.newRookies),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          yAxisID: 'y',
        },
        {
          label: 'Progression Rate (%)',
          data: progressionData.map(d => parseFloat(d.progressionRate)),
          borderColor: '#ec4899',
          backgroundColor: 'rgba(236, 72, 153, 0.05)',
          yAxisID: 'y1',
          fill: false,
        },
      ],
      summary: {
        totalNewRookies: progressionData.reduce((sum, d) => sum + d.newRookies, 0),
        avgProgressionRate: (
          progressionData.reduce((sum, d) => sum + parseFloat(d.progressionRate), 0) / days
        ).toFixed(2),
      },
    };

    await this.cache.set(cacheKey, formattedData, 60 * 60);

    return formattedData;
  }

  /**
   * Get command usage data
   */
  async getCommandUsageData(days = 30, limit = 15, useCache = true) {
    const cacheKey = `analytics:command-usage:${days}:${limit}`;

    if (useCache && this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        logger.debug('Command usage cache hit');
        return cached;
      }
    }

    logger.info('Fetching command usage data', { days, limit });

    const usageData = this.analyticsRepository 
      ? await this.analyticsRepository.getCommandUsageMetrics(days)
      : this.generateMockCommandUsage(limit);

    const topCommands = usageData.slice(0, limit);

    const formattedData = {
      labels: topCommands.map(d => d.command),
      datasets: [{
        label: 'Command Usage Count',
        data: topCommands.map(d => d.count),
        backgroundColor: [
          '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
          '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
          '#0ea5e9', '#d946ef', '#f43f5e', '#22d3ee', '#a855f7',
        ].slice(0, limit),
      }],
      summary: {
        totalUsage: usageData.reduce((sum, d) => sum + d.count, 0),
        topCommand: topCommands[0]?.command,
        topCommandCount: topCommands[0]?.count,
      },
    };

    if (this.cache) {
      await this.cache.set(cacheKey, formattedData, 60 * 60);
    }

    return formattedData;
  }

  /**
   * Get active members trend
   */
  async getActiveMembersData(days = 30, useCache = true) {
    const cacheKey = `analytics:active-members:${days}`;

    if (useCache && this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        logger.debug('Active members cache hit');
        return cached;
      }
    }

    logger.info('Fetching active members data', { days });

    const activeMembersData = this.analyticsRepository 
      ? await this.analyticsRepository.getActiveMembersOverTime(days)
      : this.generateMockActiveMembers(days);

    const formattedData = {
      labels: activeMembersData.map(d => d.date),
      datasets: [{
        label: 'Daily Active Members',
        data: activeMembersData.map(d => d.uniqueMembers),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        tension: 0.4,
      }],
      summary: {
        avgDailyActive: Math.round(
          activeMembersData.reduce((sum, d) => sum + d.uniqueMembers, 0) / days
        ),
        peakDay: activeMembersData.reduce((max, d) => d.uniqueMembers > max.uniqueMembers ? d : max),
        lowestDay: activeMembersData.reduce((min, d) => d.uniqueMembers < min.uniqueMembers ? d : min),
      },
    };

    await this.cache.set(cacheKey, formattedData, 60 * 60);

    return formattedData;
  }

  /**
   * Get comprehensive dashboard summary
   */
  async getDashboardSummary(days = 30) {
    const cacheKey = `analytics:dashboard-summary:${days}`;

    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        logger.debug('Dashboard summary cache hit');
        return cached;
      }
    }

    logger.info('Building dashboard summary', { days });

    // Use mock data if repository is not available
    const engagement = this.analyticsRepository 
      ? await this.analyticsRepository.getEngagementMetrics(days)
      : this.generateMockEngagementMetrics(days);

    const retention = this.analyticsRepository 
      ? await this.analyticsRepository.getMemberRetentionRate(days)
      : this.generateMockRetentionMetrics();

    const leaderboardTrends = this.analyticsRepository 
      ? await this.analyticsRepository.getLeaderboardTrends(7)
      : this.generateMockLeaderboardTrends();

    const activeMembersData = await this.getActiveMembersData(days, false);
    const pointsGrowthData = await this.getPointsGrowthData(days, false);

    const summary = {
      period: { days, startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      engagement,
      retention,
      topMovers: leaderboardTrends.slice(0, 5),
      metrics: {
        totalActivities: engagement.totalActivities,
        activeMembers: engagement.uniqueActiveMembers,
        totalMembers: engagement.totalMembers,
        engagementRate: engagement.engagementRate,
        pointsDistributed: engagement.totalPointsDistributed,
        retentionRate: retention.retentionRate,
      },
      charts: {
        activeMembersAvg: activeMembersData.summary.avgDailyActive,
        pointsGrowth: pointsGrowthData.summary.totalPointsEarned,
      },
      generatedAt: new Date().toISOString(),
    };

    // Cache for 1 hour
    if (this.cache) {
      await this.cache.set(cacheKey, summary, 60 * 60);
    }

    return summary;
  }

  /**
   * Invalidate analytics caches
   */
  async invalidateAnalyticsCaches() {
    const patterns = ['analytics:'];

    logger.info('Invalidating analytics caches');

    for (const pattern of patterns) {
      if (this.cache && this.cache.deletePattern) {
        await this.cache.deletePattern(pattern);
      }
    }
  }

  /**
   * Export analytics data (for downloads)
   */
  async exportAnalyticsData(format = 'json', days = 30) {
    logger.info('Exporting analytics data', { format, days });

    const [
      dailyActivity,
      pointsGrowth,
      commandUsage,
      activeMembers,
    ] = await Promise.all([
      this.getDailyActivityData(days, false),
      this.getPointsGrowthData(days, false),
      this.getCommandUsageData(days, 100, false),
      this.getActiveMembersData(days, false),
    ]);

    const data = {
      exportDate: new Date().toISOString(),
      period: days,
      dailyActivity,
      pointsGrowth,
      commandUsage,
      activeMembers,
    };

    if (format === 'csv') {
      return this.convertToCSV(data);
    }

    return data;
  }

  /**
   * Convert JSON data to CSV format
   */
  convertToCSV(data) {
    // Simple CSV conversion
    let csv = 'Date,Value\n';

    data.dailyActivity.datasets[0].data.forEach((value, i) => {
      csv += `${data.dailyActivity.labels[i]},${value}\n`;
    });

    return csv;
  }
}

module.exports = AnalyticsService;
