/**
 * Leaderboard Service Tests
 * Testing leaderboard business logic
 */

const LeaderboardService = require('../../src/services/leaderboardService');

describe('LeaderboardService', () => {
  let service;
  let mockRepository;
  let mockCache;
  let mockLogger;

  beforeEach(() => {
    mockRepository = createMockRepository();
    mockCache = createMockCache();
    mockLogger = createMockLogger();

    service = new LeaderboardService(mockRepository, null, mockCache);
  });

  describe('getLeaderboard', () => {
    test('returns leaderboard data', async () => {
      const mockData = [
        { id: '1', username: 'User1', points: 1000, level: 5 },
        { id: '2', username: 'User2', points: 900, level: 4 },
      ];

      mockRepository.getTopLeaderboard.mockResolvedValue(mockData);

      const result = await service.getLeaderboard(10, 0, false);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('rank', 1);
      expect(result[0]).toHaveProperty('formattedPoints');
    });

    test('uses cache when available', async () => {
      const cached = [{ id: '1', rank: 1 }];
      mockCache.get.mockResolvedValue(cached);

      const result = await service.getLeaderboard(10, 0, true);

      expect(result).toEqual(cached);
      expect(mockRepository.getTopLeaderboard).not.toHaveBeenCalled();
    });

    test('fetches from repository when cache miss', async () => {
      const mockData = [{ id: '1', username: 'User1', points: 1000, level: 5 }];
      mockCache.get.mockResolvedValue(null);
      mockRepository.getTopLeaderboard.mockResolvedValue(mockData);

      await service.getLeaderboard(10, 0, true);

      expect(mockRepository.getTopLeaderboard).toHaveBeenCalledWith(10, 0);
      expect(mockCache.set).toHaveBeenCalled();
    });
  });

  describe('getMemberRank', () => {
    test('returns member rank and context', async () => {
      const mockRank = {
        userRank: 5,
        totalMembers: 100,
        context: [
          { id: '1', username: 'User1', points: 1000, overallRank: 1 },
        ],
      };

      mockCache.get.mockResolvedValue(null);
      mockRepository.getMemberRankContext.mockResolvedValue(mockRank);

      const result = await service.getMemberRank('user-id');

      expect(result.userRank).toBe(5);
      expect(result.totalMembers).toBe(100);
    });
  });

  describe('getTrendingMembers', () => {
    test('returns trending members', async () => {
      const mockTrending = [
        { id: '1', username: 'Trending1', recentActivity: 50 },
        { id: '2', username: 'Trending2', recentActivity: 45 },
      ];

      mockCache.get.mockResolvedValue(null);
      mockRepository.getTrendingMembers.mockResolvedValue(mockTrending);

      const result = await service.getTrendingMembers(10, 24);

      expect(result).toHaveLength(2);
      expect(result[0].recentActivity).toBe(50);
    });
  });

  describe('formatPoints', () => {
    test('formats points with comma separator', () => {
      expect(service.formatPoints(1000)).toBe('1,000');
      expect(service.formatPoints(1000000)).toBe('1,000,000');
      expect(service.formatPoints(100)).toBe('100');
    });
  });

  describe('calculatePercentile', () => {
    test('calculates percentile rank correctly', () => {
      expect(service.calculatePercentile(1, 100)).toBe(99);
      expect(service.calculatePercentile(50, 100)).toBe(50);
      expect(service.calculatePercentile(100, 100)).toBe(0);
    });
  });

  describe('invalidateLeaderboardCaches', () => {
    test('clears all leaderboard caches', async () => {
      mockCache.deletePattern.mockResolvedValue(true);

      await service.invalidateLeaderboardCaches();

      expect(mockCache.deletePattern).toHaveBeenCalledWith('leaderboard:');
      expect(mockCache.deletePattern).toHaveBeenCalledWith('member-rank:');
      expect(mockCache.deletePattern).toHaveBeenCalledWith('member-stats:');
    });
  });

  describe('getLeaderboardEmbedData', () => {
    test('returns embed-formatted leaderboard data', async () => {
      const mockData = [
        { id: '1', username: 'User1', points: 1000, level: 5 },
        { id: '2', username: 'User2', points: 900, level: 4 },
      ];

      mockCache.get.mockResolvedValue(null);
      mockRepository.getTopLeaderboard.mockResolvedValue(mockData);

      const result = await service.getLeaderboardEmbedData(1, 10);

      expect(result.title).toBe('📊 Leaderboard');
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0].name).toContain('User1');
    });
  });
});
