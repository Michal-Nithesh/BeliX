/**
 * AI Controller
 * Handles requests for AI features (hints, answer evaluation, mentoring)
 */

const logger = require('../../utils/logger');

class AIController {
  constructor(aiService, pointsRepository, cache) {
    this.aiService = aiService;
    this.pointsRepository = pointsRepository;
    this.cache = cache;
  }

  /**
   * Generate hint for a question
   */
  async generateHint(req, res) {
    try {
      const { userId, question, difficulty = 'medium' } = req.body;

      if (!userId || !question) {
        return res.status(400).json({
          error: 'userId and question are required',
        });
      }

      logger.info('Hint request', { userId, difficulty });

      const hint = await this.aiService.generateHint(question, difficulty, userId);

      res.json({
        success: true,
        hint,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Hint generation failed', { error: error.message });
      res.status(500).json({
        error: 'Failed to generate hint',
        message: error.message,
      });
    }
  }

  /**
   * Evaluate a user's answer
   */
  async evaluateAnswer(req, res) {
    try {
      const { userId, question, answer, correctAnswer } = req.body;

      if (!userId || !question || !answer) {
        return res.status(400).json({
          error: 'userId, question, and answer are required',
        });
      }

      logger.info('Answer evaluation request', { userId });

      const evaluation = await this.aiService.evaluateAnswer(
        question,
        answer,
        correctAnswer,
        userId
      );

      // Award points based on score
      if (evaluation.score >= 70) {
        const pointsToAward = Math.round(evaluation.score / 10);
        await this.pointsRepository.addPoints(
          userId,
          pointsToAward,
          'ai_evaluated_answer',
          { score: evaluation.score }
        );
      }

      res.json({
        success: true,
        evaluation,
        pointsAwarded: evaluation.score >= 70 ? Math.round(evaluation.score / 10) : 0,
      });
    } catch (error) {
      logger.error('Answer evaluation failed', { error: error.message });
      res.status(500).json({
        error: 'Failed to evaluate answer',
        message: error.message,
      });
    }
  }

  /**
   * Get difficulty recommendation
   */
  async getDifficultyRecommendation(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      // Get recent performance from cache or compute
      const cacheKey = `difficulty-perf:${userId}`;
      let performance = await this.cache.get(cacheKey);

      if (!performance) {
        // In real implementation, fetch from database
        // For now, return default
        performance = [
          { score: 72, isCorrect: true, timeSpent: 10 },
          { score: 68, isCorrect: true, timeSpent: 12 },
          { score: 75, isCorrect: true, timeSpent: 9 },
        ];
      }

      const recommendation = await this.aiService.adjustDifficulty(userId, performance);

      res.json({
        success: true,
        recommendation,
      });
    } catch (error) {
      logger.error('Difficulty recommendation failed', { error: error.message });
      res.status(500).json({
        error: 'Failed to get difficulty recommendation',
      });
    }
  }

  /**
   * Get user's AI usage stats
   */
  async getUserStats(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const stats = this.aiService.getUserUsageStats(userId);
      const isLimitExceeded = this.aiService.isUserLimitExceeded(userId);

      res.json({
        success: true,
        stats,
        limitExceeded: isLimitExceeded,
      });
    } catch (error) {
      logger.error('Failed to fetch user stats', { error: error.message });
      res.status(500).json({
        error: 'Failed to fetch user statistics',
      });
    }
  }

  /**
   * Mentor response endpoint
   */
  async getMentorResponse(req, res) {
    try {
      const { userId, question, context = '' } = req.body;

      if (!userId || !question) {
        return res.status(400).json({
          error: 'userId and question are required',
        });
      }

      logger.info('Mentor request', { userId });

      const response = await this.aiService.generateMentorResponse(question, context, userId);

      res.json({
        success: true,
        response,
        respondedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Mentor response generation failed', { error: error.message });
      res.status(500).json({
        error: 'Failed to generate mentor response',
      });
    }
  }
}

module.exports = AIController;
