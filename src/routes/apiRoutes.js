/**
 * API Routes
 * Routes for AI features and public API endpoints
 */

const express = require('express');
const router = express.Router();

module.exports = function createAPIRoutes(aiController, authMiddleware) {
  /**
   * AI Endpoints
   */

  // Generate hint
  router.post('/ai/hint', (req, res) => {
    aiController.generateHint(req, res);
  });

  // Evaluate answer
  router.post('/ai/evaluate', (req, res) => {
    aiController.evaluateAnswer(req, res);
  });

  // Get difficulty recommendation
  router.get('/ai/difficulty/:userId', (req, res) => {
    aiController.getDifficultyRecommendation(req, res);
  });

  // Get mentor response
  router.post('/ai/mentor', (req, res) => {
    aiController.getMentorResponse(req, res);
  });

  // Get AI usage stats
  router.get('/ai/stats/:userId', (req, res) => {
    aiController.getUserStats(req, res);
  });

  /**
   * Health Check
   */
  router.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  return router;
};
