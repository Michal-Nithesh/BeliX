/**
 * OpenRouter AI Service
 * Integration with OpenRouter API for AI capabilities
 * Supports: code evaluation, hint generation, difficulty adjustment
 */

const https = require('https');
const logger = require('../../utils/logger');

class OpenRouterService {
  constructor(config) {
    if (!config.apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseURL = 'https://openrouter.io/api/v1';
    this.model = config.model || 'mistral/mistral-7b-instruct';
    this.maxTokens = config.maxTokens || 500;
    this.costLimit = config.costLimit || 0.01; // $0.01 per request max
    this.usageTracking = new Map(); // userId -> { tokens, cost }
  }

  /**
   * Make HTTP request to OpenRouter API
   */
  async makeRequest(endpoint, data) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);

      const options = {
        hostname: 'openrouter.io',
        port: 443,
        path: `/api/v1${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': postData.length,
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://discord.com',
          'X-Title': 'BeliX Discord Bot',
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', chunk => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${responseData}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Generate a hint for a coding question
   */
  async generateHint(question, difficulty = 'medium', userId = null) {
    const prompt = this.buildHintPrompt(question, difficulty);

    try {
      logger.info('Generating hint', { userId, difficulty });

      const response = await this.makeRequest('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a helpful coding mentor. Generate a single, concise hint that guides without revealing the solution. Keep it under 100 words.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: this.maxTokens,
        temperature: 0.7,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const hint = response.choices[0].message.content;
      const tokensUsed = response.usage.total_tokens;

      // Track usage
      this.trackUsage(userId, tokensUsed, response.usage);

      logger.info('Hint generated successfully', {
        userId,
        tokensUsed,
        contentLength: hint.length,
      });

      return hint;
    } catch (error) {
      logger.error('Failed to generate hint', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Evaluate a coding answer and provide feedback
   */
  async evaluateAnswer(question, userAnswer, correctAnswer = null, userId = null) {
    const prompt = this.buildEvaluationPrompt(question, userAnswer, correctAnswer);

    try {
      logger.info('Evaluating answer', { userId });

      const response = await this.makeRequest('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert code reviewer. Analyze the provided code answer and give:
1. Correctness (0-100%)
2. Key issues (if any)
3. Specific improvements
4. Learning tips

Format as JSON: { score: number, issues: string[], improvements: string[], tips: string[] }`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: this.maxTokens,
        temperature: 0.5,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const evaluation = this.parseEvaluationResponse(response.choices[0].message.content);
      const tokensUsed = response.usage.total_tokens;

      this.trackUsage(userId, tokensUsed, response.usage);

      logger.info('Answer evaluated', { userId, score: evaluation.score, tokensUsed });

      return evaluation;
    } catch (error) {
      logger.error('Failed to evaluate answer', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Determine if user should get harder or easier question
   */
  async adjustDifficulty(userId, recentPerformance) {
    // recentPerformance: array of { score, isCorrect, timeSpent }
    const avgScore = recentPerformance.reduce((sum, p) => sum + p.score, 0) / recentPerformance.length;
    const successRate = recentPerformance.filter(p => p.isCorrect).length / recentPerformance.length;

    logger.info('Adjusting difficulty', { userId, avgScore, successRate });

    let recommendation = 'maintain';

    if (avgScore >= 85 && successRate >= 0.8) {
      recommendation = 'increase';
      logger.debug('Recommending difficulty increase', { userId });
    } else if (avgScore < 50 && successRate < 0.5) {
      recommendation = 'decrease';
      logger.debug('Recommending difficulty decrease', { userId });
    }

    return {
      recommendation,
      avgScore: avgScore.toFixed(2),
      successRate: (successRate * 100).toFixed(2),
      reasoning: this.getDifficultyReasoning(recommendation, avgScore, successRate),
    };
  }

  /**
   * Mentor AI response for coding questions in chat
   */
  async generateMentorResponse(question, context = '', userId = null) {
    const prompt = `
User asked: "${question}"
${context ? `Context: ${context}` : ''}

Provide a helpful, guiding response that:
1. Acknowledges their question
2. Asks clarifying questions or suggests debugging steps
3. Hints at the solution without revealing it
4. Encourages learning and problem-solving

Keep response under 150 words.
    `.trim();

    try {
      logger.info('Generating mentor response', { userId });

      const response = await this.makeRequest('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are BeliX AI Mentor, a supportive coding mentor in a Discord community. Help members learn through guided questioning and hints, not direct solutions.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 300,
        temperature: 0.8,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const mentorResponse = response.choices[0].message.content;
      const tokensUsed = response.usage.total_tokens;

      this.trackUsage(userId, tokensUsed, response.usage);

      logger.info('Mentor response generated', { userId, tokensUsed });

      return mentorResponse;
    } catch (error) {
      logger.error('Failed to generate mentor response', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Batch check multiple answers (for daily question)
   */
  async batchEvaluateAnswers(answers) {
    // answers: [{ userId, answer, correct }, ...]
    const results = [];

    for (const item of answers) {
      try {
        const evaluation = await this.evaluateAnswer(
          'Daily Question',
          item.answer,
          item.correct,
          item.userId
        );

        results.push({
          userId: item.userId,
          evaluation,
          success: true,
        });
      } catch (error) {
        logger.warn('Batch evaluation skipped for user', { userId: item.userId });
        results.push({
          userId: item.userId,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get user's AI usage statistics
   */
  getUserUsageStats(userId) {
    const usage = this.usageTracking.get(userId);

    if (!usage) {
      return { tokensUsed: 0, estimatedCost: 0, requestCount: 0 };
    }

    return {
      tokensUsed: usage.tokens,
      estimatedCost: (usage.cost || 0).toFixed(4),
      requestCount: usage.requestCount || 0,
      lastUpdated: usage.lastUpdated,
    };
  }

  /**
   * Reset user's usage tracking (daily/weekly)
   */
  resetUserUsageStats(userId = null) {
    if (userId) {
      this.usageTracking.delete(userId);
      logger.info('Reset usage stats for user', { userId });
    } else {
      this.usageTracking.clear();
      logger.info('Reset all usage stats');
    }
  }

  /**
   * Private: Build hint generation prompt
   */
  buildHintPrompt(question, difficulty) {
    return `
Question: ${question}
Difficulty: ${difficulty}

Generate a hint that:
1. Doesn't reveal the answer
2. Points toward the approach
3. Is appropriate for "${difficulty}" level
4. Keeps learning value high
    `.trim();
  }

  /**
   * Private: Build answer evaluation prompt
   */
  buildEvaluationPrompt(question, userAnswer, correctAnswer) {
    return `
Question: ${question}

User's Answer:
\`\`\`
${userAnswer}
\`\`\`

${correctAnswer ? `Reference Answer:\n\`\`\`\n${correctAnswer}\n\`\`\`` : ''}

Evaluate this answer thoroughly.
    `.trim();
  }

  /**
   * Private: Parse evaluation JSON response
   */
  parseEvaluationResponse(content) {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback if no JSON
      return {
        score: 70,
        issues: ['Unable to parse evaluation'],
        improvements: ['Review the reference implementation'],
        tips: ['Keep practicing!'],
      };
    } catch (error) {
      logger.warn('Failed to parse evaluation response', { error: error.message });

      return {
        score: 70,
        issues: [],
        improvements: ['Review the solution again'],
        tips: ['Keep learning!'],
      };
    }
  }

  /**
   * Private: Get difficulty change reasoning
   */
  getDifficultyReasoning(recommendation, avgScore, successRate) {
    if (recommendation === 'increase') {
      return `You're excelling! (${avgScore}% avg, ${(successRate * 100).toFixed(0)}% success). Time to challenge yourself with harder problems.`;
    }

    if (recommendation === 'decrease') {
      return `You're struggling (${avgScore}% avg, ${(successRate * 100).toFixed(0)}% success). Let's practice with easier problems to build confidence.`;
    }

    return `Keep it up! You're progressing well (${avgScore}% avg, ${(successRate * 100).toFixed(0)}% success).`;
  }

  /**
   * Private: Track usage for cost control
   */
  trackUsage(userId, tokensUsed, usage) {
    if (!userId) return;

    if (!this.usageTracking.has(userId)) {
      this.usageTracking.set(userId, { tokens: 0, cost: 0, requestCount: 0 });
    }

    const userUsage = this.usageTracking.get(userId);
    userUsage.tokens += tokensUsed;
    userUsage.requestCount = (userUsage.requestCount || 0) + 1;

    // Estimate cost based on model (varies by model)
    // This is an approximation; update based on your actual model costs
    const costPerToken = 0.00001; // Adjust per your model
    userUsage.cost = (userUsage.cost || 0) + (tokensUsed * costPerToken);
    userUsage.lastUpdated = new Date().toISOString();

    // Warn if approaching limit
    if (userUsage.cost > this.costLimit * 0.8) {
      logger.warn('User approaching cost limit', {
        userId,
        cost: userUsage.cost,
        limit: this.costLimit,
      });
    }
  }

  /**
   * Check if user has exceeded cost limits
   */
  isUserLimitExceeded(userId) {
    const usage = this.usageTracking.get(userId);
    return usage && usage.cost > this.costLimit;
  }
}

module.exports = OpenRouterService;
