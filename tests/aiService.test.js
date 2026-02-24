/**
 * OpenRouter AI Service Tests
 */

const OpenRouterService = require('../../src/ai/openrouterService');

describe('OpenRouterService', () => {
  let service;
  let mockHttps;

  beforeEach(() => {
    service = new OpenRouterService({
      apiKey: 'test-key',
      model: 'mistral/mistral-7b-instruct',
      maxTokens: 500,
    });

    // Mock the makeRequest method
    service.makeRequest = jest.fn();
  });

  describe('initialization', () => {
    test('throws error if apiKey not provided', () => {
      expect(() => {
        new OpenRouterService({});
      }).toThrow('OpenRouter API key is required');
    });

    test('initializes with default config', () => {
      expect(service.apiKey).toBe('test-key');
      expect(service.model).toBe('mistral/mistral-7b-instruct');
      expect(service.maxTokens).toBe(500);
    });
  });

  describe('generateHint', () => {
    test('generates hint for coding question', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hint: Consider using a loop' } }],
        usage: { total_tokens: 50 },
      };

      service.makeRequest.mockResolvedValue(mockResponse);

      const result = await service.generateHint('What is a loop?', 'easy', 'user-1');

      expect(result).toBe('Hint: Consider using a loop');
    });

    test('tracks token usage', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hint' } }],
        usage: { total_tokens: 50 },
      };

      service.makeRequest.mockResolvedValue(mockResponse);

      await service.generateHint('Question', 'easy', 'user-1');

      const stats = service.getUserUsageStats('user-1');
      expect(stats.tokensUsed).toBe(50);
    });

    test('handles API errors gracefully', async () => {
      service.makeRequest.mockRejectedValue(new Error('API Error'));

      await expect(service.generateHint('Question', 'easy', 'user-1')).rejects.toThrow();
    });
  });

  describe('evaluateAnswer', () => {
    test('evaluates coding answer', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '{"score": 85, "issues": [], "improvements": ["Variable naming"], "tips": ["Good job!"]}',
          },
        }],
        usage: { total_tokens: 100 },
      };

      service.makeRequest.mockResolvedValue(mockResponse);

      const result = await service.evaluateAnswer('Question', 'const x = 5;', 'x', 'user-1');

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('improvements');
    });

    test('handles malformed response', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Invalid JSON' } }],
        usage: { total_tokens: 50 },
      };

      service.makeRequest.mockResolvedValue(mockResponse);

      const result = await service.evaluateAnswer('Question', 'answer', null, 'user-1');

      expect(result).toHaveProperty('score');
      expect(result.score).toBe(70);
    });
  });

  describe('adjustDifficulty', () => {
    test('recommends difficulty increase for high performers', async () => {
      const performance = [
        { score: 95, isCorrect: true, timeSpent: 5 },
        { score: 90, isCorrect: true, timeSpent: 6 },
        { score: 88, isCorrect: true, timeSpent: 7 },
      ];

      const result = await service.adjustDifficulty('user-1', performance);

      expect(result.recommendation).toBe('increase');
    });

    test('recommends difficulty decrease for struggling users', async () => {
      const performance = [
        { score: 40, isCorrect: false, timeSpent: 30 },
        { score: 35, isCorrect: false, timeSpent: 35 },
        { score: 45, isCorrect: false, timeSpent: 32 },
      ];

      const result = await service.adjustDifficulty('user-1', performance);

      expect(result.recommendation).toBe('decrease');
    });

    test('recommends maintaining difficulty for average performers', async () => {
      const performance = [
        { score: 70, isCorrect: true, timeSpent: 15 },
        { score: 65, isCorrect: true, timeSpent: 18 },
        { score: 75, isCorrect: true, timeSpent: 14 },
      ];

      const result = await service.adjustDifficulty('user-1', performance);

      expect(result.recommendation).toBe('maintain');
    });
  });

  describe('generateMentorResponse', () => {
    test('generates mentor response for coding question', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Have you tried debugging with console.log?' } }],
        usage: { total_tokens: 75 },
      };

      service.makeRequest.mockResolvedValue(mockResponse);

      const result = await service.generateMentorResponse('How do I fix this?', '', 'user-1');

      expect(result).toContain('console.log');
    });
  });

  describe('usage tracking', () => {
    test('tracks user usage statistics', async () => {
      service.trackUsage('user-1', 100, {});

      const stats = service.getUserUsageStats('user-1');

      expect(stats.tokensUsed).toBe(100);
      expect(stats.requestCount).toBe(1);
    });

    test('resets user usage', () => {
      service.trackUsage('user-1', 100, {});
      service.resetUserUsageStats('user-1');

      const stats = service.getUserUsageStats('user-1');

      expect(stats.tokensUsed).toBe(0);
    });

    test('detects when user exceeds cost limit', () => {
      service.costLimit = 0.001;
      service.trackUsage('user-1', 10000, {});

      const isExceeded = service.isUserLimitExceeded('user-1');

      expect(isExceeded).toBe(true);
    });
  });
});
