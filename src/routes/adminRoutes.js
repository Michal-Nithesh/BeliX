/**
 * Admin Routes
 * Routes for the analytics dashboard
 */

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');

module.exports = function createAdminRoutes(analyticsController, authMiddleware) {
  /**
   * Admin Dashboard Main Page
   */
  router.get('/', authMiddleware, (req, res) => {
    analyticsController.renderDashboard(req, res);
  });

  /**
   * Analytics API Endpoints
   */

  // Daily activity data
  router.get('/api/activity', authMiddleware, (req, res) => {
    analyticsController.getDailyActivity(req, res);
  });

  // Points growth data
  router.get('/api/points-growth', authMiddleware, (req, res) => {
    analyticsController.getPointsGrowth(req, res);
  });

  // Rookie progression data
  router.get('/api/rookie-progress', authMiddleware, (req, res) => {
    analyticsController.getRookieProgress(req, res);
  });

  // Command usage data
  router.get('/api/command-usage', authMiddleware, (req, res) => {
    analyticsController.getCommandUsage(req, res);
  });

  // Active members trend
  router.get('/api/active-members', authMiddleware, (req, res) => {
    analyticsController.getActiveMembersTrend(req, res);
  });

  // Dashboard summary
  router.get('/api/summary', authMiddleware, (req, res) => {
    analyticsController.getDashboardSummary(req, res);
  });

  // Export analytics
  router.get('/api/export', authMiddleware, (req, res) => {
    analyticsController.exportAnalytics(req, res);
  });

  // Invalidate caches
  router.post('/api/cache/invalidate', authMiddleware, (req, res) => {
    analyticsController.invalidateCaches(req, res);
  });

  return router;
};
