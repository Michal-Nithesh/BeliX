/**
 * Analytics Service Tests
 */

const AnalyticsService = require('../../src/services/analyticsService');

describe('AnalyticsService', () => {
  let service;
  let mockRepository;
  let mockCache;

  beforeEach(() => {
    mockRepository = createMockRepository();
    mockCache = createMockCache();

    service = new AnalyticsService(mockRepository, mockCache);
  });

  describe('getDailyActivityData', () => {
    test('returns formatted daily activity chart data', async () => {
      const mockData = [
        { date: '2024-01-01', count: 10 },
        { date: '2024-01-02', count: 15 },
      ];

      mockCache.get.mockResolvedValue(null);
      mockRepository.getDailyActivityCount.mockResolvedValue(mockData);

      const result = await service.getDailyActivityData(30, true);

      expect(result).toHaveProperty('labels');
      expect(result).toHaveProperty('datasets');
      expect(result).toHaveProperty('summary');
      expect(result.summary.totalActivities).toBe(25);
    });

    test('returns cached data when available', async () => {
      const cached = { labels: ['2024-01-01'], datasets: [] };
      mockCache.get.mockResolvedValue(cached);

      const result = await service.getDailyActivityData(30, true);

      expect(result).toEqual(cached);
      expect(mockRepository.getDailyActivityCount).not.toHaveBeenCalled();
    });
  });

  describe('getPointsGrowthData', () => {
    test('returns formatted points growth data', async () => {
      const mockData = [
        { date: '2024-01-01', daily: 100, cumulative: 100 },
        { date: '2024-01-02', daily: 150, cumulative: 250 },
      ];

      mockCache.get.mockResolvedValue(null);
      mockRepository.getPointsGrowthTrend.mockResolvedValue(mockData);

      const result = await service.getPointsGrowthData(30, true);

      expect(result).toHaveProperty('datasets');
      expect(result.datasets).toHaveLength(2);
      expect(result.summary.totalPointsEarned).toBe(250);
    });
  });

  describe('getCommandUsageData', () => {
    test('returns formatted command usage data', async () => {
      const mockData = [
        { command: 'leaderboard', count: 150 },
        { command: 'points', count: 100 },
      ];

      mockCache.get.mockResolvedValue(null);
      mockRepository.getCommandUsageMetrics.mockResolvedValue(mockData);

      const result = await service.getCommandUsageData(30, 15, true);

      expect(result).toHaveProperty('labels');
      expect(result.labels).toContain('leaderboard');
      expect(result.summary.totalUsage).toBe(250);
    });
  });

  describe('getDashboardSummary', () => {
    test('returns complete dashboard summary', async () => {
      const mockEngagement = {
        totalActivities: 500,
        uniqueActiveMembers: 50,
        totalMembers: 100,
        engagementRate: '50%',
      };

      const mockRetention = {
        retentionRate: '80%',
      };

      mockCache.get.mockResolvedValue(null);
      mockRepository.getEngagementMetrics.mockResolvedValue(mockEngagement);
      mockRepository.getMemberRetentionRate.mockResolvedValue(mockRetention);
      mockRepository.getLeaderboardTrends.mockResolvedValue([]);
      mockRepository.getActiveMembersOverTime.mockResolvedValue([]);
      mockRepository.getPointsGrowthTrend.mockResolvedValue([]);

      const result = await service.getDashboardSummary(30);

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('engagement');
      expect(result).toHaveProperty('retention');
      expect(result).toHaveProperty('metrics');
    });
  });

  describe('invalidateAnalyticsCaches', () => {
    test('clears analytics caches', async () => {
      mockCache.deletePattern.mockResolvedValue(true);

      await service.invalidateAnalyticsCaches();

      expect(mockCache.deletePattern).toHaveBeenCalledWith('analytics:');
    });
  });
});
