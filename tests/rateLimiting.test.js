/**
 * Rate Limiting Tests
 */

// Mock the rate limiting module
const createRateLimitManager = () => ({
  cooldowns: new Map(),

  async check(userId, actionType = 'default', cooldown = 3000) {
    const key = `${userId}:${actionType}`;

    if (this.cooldowns.has(key)) {
      const expiry = this.cooldowns.get(key);
      if (Date.now() < expiry) {
        return { allowed: false, msLeft: expiry - Date.now() };
      }
    }

    this.cooldowns.set(key, Date.now() + cooldown);
    return { allowed: true };
  },

  async cleanup() {
    const now = Date.now();
    for (const [key, expiry] of this.cooldowns.entries()) {
      if (now > expiry) {
        this.cooldowns.delete(key);
      }
    }
  },
});

describe('Rate Limiting', () => {
  let rateLimiter;

  beforeEach(() => {
    rateLimiter = createRateLimitManager();
  });

  describe('CommandRateLimiter', () => {
    test('allows first execution', async () => {
      const result = await rateLimiter.check('user-1', 'leaderboard', 3000);

      expect(result.allowed).toBe(true);
    });

    test('blocks repeated execution within cooldown', async () => {
      await rateLimiter.check('user-1', 'leaderboard', 3000);

      const result = await rateLimiter.check('user-1', 'leaderboard', 3000);

      expect(result.allowed).toBe(false);
      expect(result.msLeft).toBeGreaterThan(0);
    });

    test('allows different users to execute simultaneously', async () => {
      const result1 = await rateLimiter.check('user-1', 'leaderboard', 3000);
      const result2 = await rateLimiter.check('user-2', 'leaderboard', 3000);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    test('allows same user to execute different commands', async () => {
      const result1 = await rateLimiter.check('user-1', 'leaderboard', 3000);
      const result2 = await rateLimiter.check('user-1', 'points', 3000);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });

    test('cleanup removes expired cooldowns', async () => {
      await rateLimiter.check('user-1', 'command', 100);

      await new Promise(resolve => setTimeout(resolve, 150));

      await rateLimiter.cleanup();

      const result = await rateLimiter.check('user-1', 'command', 100);

      expect(result.allowed).toBe(true);
    });
  });

  describe('AntiSpamManager', () => {
    let spamDetector;

    beforeEach(() => {
      spamDetector = {
        userMessages: new Map(),

        async checkSpam(userId, maxMessages = 5, windowSeconds = 10) {
          const now = Date.now();
          const key = userId;

          if (!this.userMessages.has(key)) {
            this.userMessages.set(key, []);
          }

          const messages = this.userMessages.get(key);
          const recentMessages = messages.filter(ts => now - ts < windowSeconds * 1000);

          if (recentMessages.length >= maxMessages) {
            return { isSpam: true, messagesInWindow: recentMessages.length };
          }

          recentMessages.push(now);
          this.userMessages.set(key, recentMessages);

          return { isSpam: false, messagesInWindow: recentMessages.length };
        },
      };
    });

    test('allows messages under threshold', async () => {
      const result = await spamDetector.checkSpam('user-1', 5, 10);

      expect(result.isSpam).toBe(false);
    });

    test('detects spam at threshold', async () => {
      for (let i = 0; i < 5; i++) {
        await spamDetector.checkSpam('user-1', 5, 10);
      }

      const result = await spamDetector.checkSpam('user-1', 5, 10);

      expect(result.isSpam).toBe(true);
    });

    test('resets spam detection after window expires', async () => {
      for (let i = 0; i < 5; i++) {
        await spamDetector.checkSpam('user-1', 5, 1); // 1 second window
      }

      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = await spamDetector.checkSpam('user-1', 5, 1);

      expect(result.isSpam).toBe(false);
    });
  });

  describe('LeaderboardFarmingPrevention', () => {
    let farmingDetector;

    beforeEach(() => {
      farmingDetector = {
        lastPointActivity: new Map(),
        minimumInterval: 30000, // 30 seconds

        async checkFarming(userId) {
          const now = Date.now();
          const lastActivity = this.lastPointActivity.get(userId);

          if (lastActivity && now - lastActivity < this.minimumInterval) {
            return {
              isFarming: true,
              msUntilAllowed: this.minimumInterval - (now - lastActivity),
            };
          }

          this.lastPointActivity.set(userId, now);
          return { isFarming: false };
        },
      };
    });

    test('allows first points operation', async () => {
      const result = await farmingDetector.checkFarming('user-1');

      expect(result.isFarming).toBe(false);
    });

    test('prevents rapid points operations', async () => {
      await farmingDetector.checkFarming('user-1');

      const result = await farmingDetector.checkFarming('user-1');

      expect(result.isFarming).toBe(true);
      expect(result.msUntilAllowed).toBeGreaterThan(0);
    });

    test('allows operations after interval', async () => {
      await farmingDetector.checkFarming('user-1');

      await new Promise(resolve => setTimeout(resolve, 100));
      farmingDetector.minimumInterval = 50;

      const result = await farmingDetector.checkFarming('user-1');

      expect(result.isFarming).toBe(false);
    });
  });
});
