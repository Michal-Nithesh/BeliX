/**
 * Analytics Repository
 * Data access layer for aggregated analytics queries
 */

const BaseRepository = require('./baseRepository');

class AnalyticsRepository extends BaseRepository {
  /**
   * Get daily activity count (grouped by date)
   */
  async getDailyActivityCount(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data, error } = await this.db
      .from('activity_log')
      .select('created_at, id')
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    // Group by date
    const dailyStats = {};
    data.forEach(record => {
      const date = new Date(record.created_at).toISOString().split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + 1;
    });

    // Fill missing dates with 0
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      result.push({
        date: dateStr,
        count: dailyStats[dateStr] || 0,
      });
    }

    return result;
  }

  /**
   * Get points growth over time
   */
  async getPointsGrowthTrend(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data, error } = await this.db
      .from('point_history')
      .select('created_at, points_added')
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    // Group by date
    const dailyGrowth = {};
    let cumulativePoints = 0;

    data.forEach(record => {
      const date = new Date(record.created_at).toISOString().split('T')[0];
      if (!dailyGrowth[date]) dailyGrowth[date] = 0;
      dailyGrowth[date] += record.points_added;
      cumulativePoints += record.points_added;
    });

    // Build result with cumulative
    const result = [];
    let runningTotal = 0;

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      runningTotal += dailyGrowth[dateStr] || 0;

      result.push({
        date: dateStr,
        daily: dailyGrowth[dateStr] || 0,
        cumulative: runningTotal,
      });
    }

    return result;
  }

  /**
   * Get rookie progression rate
   */
  async getRookieProgressionRate(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get members joined in this period
    const { data: newMembers, error: newError } = await this.db
      .from('members')
      .select('id, created_at, level')
      .gte('created_at', startDate.toISOString());

    if (newError) throw newError;

    // Group by date
    const dailyStats = {};

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const joined = newMembers.filter(m => m.created_at.split('T')[0] === dateStr).length;
      const advanced = newMembers.filter(m => m.created_at.split('T')[0] === dateStr && m.level > 1).length;

      dailyStats[dateStr] = {
        date: dateStr,
        newRookies: joined,
        advancedRookies: advanced,
        progressionRate: joined > 0 ? (advanced / joined * 100).toFixed(2) : 0,
      };
    }

    return Object.values(dailyStats);
  }

  /**
   * Get command usage metrics
   */
  async getCommandUsageMetrics(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data, error } = await this.db
      .from('activity_log')
      .select('action')
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    // Group by command
    const usage = {};
    data.forEach(record => {
      const command = record.action || 'unknown';
      usage[command] = (usage[command] || 0) + 1;
    });

    // Sort by count
    return Object.entries(usage)
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get active members count over time
   */
  async getActiveMembersOverTime(days = 30, granularity = 'daily') {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data, error } = await this.db
      .from('activity_log')
      .select('user_id, created_at')
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    // Group by date and count unique users
    const activeMembers = {};

    data.forEach(record => {
      const date = new Date(record.created_at).toISOString().split('T')[0];
      if (!activeMembers[date]) activeMembers[date] = new Set();
      activeMembers[date].add(record.user_id);
    });

    // Convert to counts
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      result.push({
        date: dateStr,
        uniqueMembers: (activeMembers[dateStr] || new Set()).size,
      });
    }

    return result;
  }

  /**
   * Get leaderboard trends (top position changes)
   */
  async getLeaderboardTrends(snapshots = 7) {
    // Get latest member positions
    const { data: current, error: currentError } = await this.db
      .from('members')
      .select('id, username, points, level')
      .order('points', { ascending: false })
      .limit(10);

    if (currentError) throw currentError;

    // Get historical snapshots if available
    const { data: history, error: histError } = await this.db
      .from('leaderboard_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(snapshots);

    if (histError) throw histError;

    // Compare rankings
    const trends = current.map((member, currentRank) => {
      const historicalRanks = history
        .map(snapshot => {
          const snapshotData = JSON.parse(snapshot.data);
          return snapshotData.findIndex(m => m.id === member.id) + 1;
        })
        .filter(rank => rank > 0);

      const previousRank = historicalRanks[historicalRanks.length - 1];
      const rankChange = previousRank ? previousRank - (currentRank + 1) : 0;

      return {
        id: member.id,
        username: member.username,
        currentRank: currentRank + 1,
        previousRank,
        rankChange, // Positive = improved
        points: member.points,
        level: member.level,
      };
    });

    return trends;
  }

  /**
   * Get engagement metrics summary
   */
  async getEngagementMetrics(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Total activity
    const { data: activities } = await this.db
      .from('activity_log')
      .select('id')
      .gte('created_at', startDate.toISOString());

    // Active members
    const { data: activeUsers } = await this.db
      .from('activity_log')
      .select('user_id')
      .gte('created_at', startDate.toISOString());

    const uniqueMembers = new Set(activeUsers.map(a => a.user_id)).size;

    // Total members
    const { data: allMembers } = await this.db
      .from('members')
      .select('id');

    // Points distributed
    const { data: pointData } = await this.db
      .from('point_history')
      .select('points_added')
      .gte('created_at', startDate.toISOString());

    const totalPointsDistributed = pointData.reduce((sum, p) => sum + p.points_added, 0);

    return {
      periodDays: days,
      totalActivities: activities.length,
      uniqueActiveMembers: uniqueMembers,
      totalMembers: allMembers.length,
      engagementRate: ((uniqueMembers / allMembers.length) * 100).toFixed(2) + '%',
      avgActivitiesPerMember: (activities.length / uniqueMembers).toFixed(2),
      totalPointsDistributed,
      avgPointsPerActivity: (totalPointsDistributed / Math.max(activities.length, 1)).toFixed(2),
    };
  }

  /**
   * Get member retention rate
   */
  async getMemberRetentionRate(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const midDate = new Date(Date.now() - days / 2 * 24 * 60 * 60 * 1000);

    // First period actives
    const { data: firstPeriod } = await this.db
      .from('activity_log')
      .select('user_id')
      .gte('created_at', startDate.toISOString())
      .lt('created_at', midDate.toISOString());

    const firstPeriodUsers = new Set(firstPeriod.map(a => a.user_id));

    // Second period actives
    const { data: secondPeriod } = await this.db
      .from('activity_log')
      .select('user_id')
      .gte('created_at', midDate.toISOString());

    const secondPeriodUsers = new Set(secondPeriod.map(a => a.user_id));

    // Retained users
    const retained = [...firstPeriodUsers].filter(id => secondPeriodUsers.has(id));

    return {
      firstPeriodMembers: firstPeriodUsers.size,
      secondPeriodMembers: secondPeriodUsers.size,
      retainedMembers: retained.length,
      retentionRate: ((retained.length / Math.max(firstPeriodUsers.size, 1)) * 100).toFixed(2) + '%',
    };
  }
}

module.exports = AnalyticsRepository;
