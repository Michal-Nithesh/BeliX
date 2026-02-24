/**
 * Analytics Controller
 * Handles requests for the analytics dashboard
 */

const logger = require('../../utils/logger');

class AnalyticsController {
  constructor(analyticsService, cache) {
    this.analyticsService = analyticsService;
    this.cache = cache;
  }

  /**
   * Render admin dashboard page
   */
  async renderDashboard(req, res) {
    try {
      logger.info('Rendering admin dashboard');

      const dashboard = await this.analyticsService.getDashboardSummary(30);

      res.render('dashboard', {
        title: 'BeliX Analytics Dashboard',
        dashboard,
        generatedAt: new Date().toLocaleString(),
      });
    } catch (error) {
      logger.error('Dashboard render failed', { error: error.message });
      res.status(500).render('error', {
        message: 'Failed to load dashboard',
        error: error.message,
      });
    }
  }

  /**
   * API endpoint: Daily activity data
   */
  async getDailyActivity(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      logger.info('Fetching daily activity', { days });

      const data = await this.analyticsService.getDailyActivityData(days);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Daily activity fetch failed', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch daily activity' });
    }
  }

  /**
   * API endpoint: Points growth
   */
  async getPointsGrowth(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      logger.info('Fetching points growth', { days });

      const data = await this.analyticsService.getPointsGrowthData(days);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Points growth fetch failed', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch points growth' });
    }
  }

  /**
   * API endpoint: Rookie progression
   */
  async getRookieProgress(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      logger.info('Fetching rookie progression', { days });

      const data = await this.analyticsService.getRookieProgressionData(days);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Rookie progression fetch failed', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch rookie progression' });
    }
  }

  /**
   * API endpoint: Command usage
   */
  async getCommandUsage(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;
      const limit = parseInt(req.query.limit) || 15;

      logger.info('Fetching command usage', { days, limit });

      const data = await this.analyticsService.getCommandUsageData(days, limit);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Command usage fetch failed', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch command usage' });
    }
  }

  /**
   * API endpoint: Active members trend
   */
  async getActiveMembersTrend(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      logger.info('Fetching active members trend', { days });

      const data = await this.analyticsService.getActiveMembersData(days);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Active members trend fetch failed', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch active members trend' });
    }
  }

  /**
   * API endpoint: Dashboard summary
   */
  async getDashboardSummary(req, res) {
    try {
      const days = parseInt(req.query.days) || 30;

      logger.info('Fetching dashboard summary', { days });

      const summary = await this.analyticsService.getDashboardSummary(days);

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('Dashboard summary fetch failed', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch dashboard summary' });
    }
  }

  /**
   * API endpoint: Export analytics
   */
  async exportAnalytics(req, res) {
    try {
      const format = req.query.format || 'json';
      const days = parseInt(req.query.days) || 30;

      logger.info('Exporting analytics', { format, days });

      const data = await this.analyticsService.exportAnalyticsData(format, days);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${Date.now()}.csv"`);
        res.send(data);
      } else {
        res.json({
          success: true,
          data,
        });
      }
    } catch (error) {
      logger.error('Analytics export failed', { error: error.message });
      res.status(500).json({ error: 'Failed to export analytics' });
    }
  }

  /**
   * Invalidate analytics caches (for manual refresh)
   */
  async invalidateCaches(req, res) {
    try {
      logger.info('Invalidating analytics caches');

      await this.analyticsService.invalidateAnalyticsCaches();

      res.json({
        success: true,
        message: 'Caches invalidated successfully',
      });
    } catch (error) {
      logger.error('Cache invalidation failed', { error: error.message });
      res.status(500).json({ error: 'Failed to invalidate caches' });
    }
  }
}

module.exports = AnalyticsController;
