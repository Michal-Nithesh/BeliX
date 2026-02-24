/**
 * Leaderboard Repository
 * Data access layer for leaderboard queries
 */

const BaseRepository = require('./baseRepository');

class LeaderboardRepository extends BaseRepository {
  /**
   * Get top leaderboard entries with member details
   */
  async getTopLeaderboard(limit = 10, offset = 0) {
    const { data, error } = await this.db
      .from('members')
      .select('id, username, points, level, rank, avatar_url, joined_date')
      .order('points', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  }

  /**
   * Get member rank and surrounding context
   */
  async getMemberRankContext(userId, contextSize = 5) {
    // Get all members ordered by points
    const { data: allMembers, error } = await this.db
      .from('members')
      .select('id, username, points, level, rank')
      .order('points', { ascending: false });

    if (error) throw error;

    // Find user's rank
    const userRank = allMembers.findIndex(m => m.id === userId) + 1;
    const start = Math.max(0, userRank - contextSize - 1);
    const end = Math.min(allMembers.length, userRank + contextSize);

    return {
      userRank,
      totalMembers: allMembers.length,
      context: allMembers.slice(start, end).map((member, i) => ({
        ...member,
        overallRank: start + i + 1,
      })),
    };
  }

  /**
   * Get leaderboard grouped by level
   */
  async getLeaderboardByLevel(level, limit = 10, offset = 0) {
    const { data, error } = await this.db
      .from('members')
      .select('id, username, points, level, avatar_url')
      .eq('level', level)
      .order('points', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  }

  /**
   * Get weekly/monthly point changes (activity leaderboard)
   */
  async getPointGrowth(days = 7, limit = 10) {
    // Get current points for all members
    const { data: currentPoints, error: currentError } = await this.db
      .from('members')
      .select('id, username, points, level');

    if (currentError) throw currentError;

    // Get points from N days ago (using point_history if available)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - days);

    const { data: pointHistory, error: historyError } = await this.db
      .from('point_history')
      .select('user_id, points')
      .gte('created_at', pastDate.toISOString());

    if (historyError) throw historyError;

    // Calculate growth
    const growth = currentPoints.map(member => {
      const pastPoints = pointHistory
        .filter(h => h.user_id === member.id)
        .reduce((sum, h) => sum + h.points, 0);

      return {
        id: member.id,
        username: member.username,
        level: member.level,
        currentPoints: member.points,
        pointsGained: member.points - pastPoints,
        growthPercentage: ((member.points - pastPoints) / Math.max(member.points, 1)) * 100,
      };
    })
      .sort((a, b) => b.pointsGained - a.pointsGained)
      .slice(0, limit);

    return growth;
  }

  /**
   * Get trending members (most recent activity)
   */
  async getTrendingMembers(limit = 10, hours = 24) {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - hours);

    const { data, error } = await this.db
      .from('activity_log')
      .select('user_id, count(*) as activity_count')
      .gte('created_at', pastDate.toISOString())
      .group_by('user_id')
      .order('activity_count', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Enrich with member data
    const memberIds = data.map(d => d.user_id);
    const { data: members, error: memberError } = await this.db
      .from('members')
      .select('id, username, level, avatar_url')
      .in('id', memberIds);

    if (memberError) throw memberError;

    return data.map(activity => ({
      ...members.find(m => m.id === activity.user_id),
      recentActivity: activity.activity_count,
    }));
  }

  /**
   * Get member statistics in leaderboard context
   */
  async getMemberStats(userId) {
    const { data, error } = await this.db
      .from('members')
      .select(
        `id, username, points, level, 
         created_at, last_activity,
         commands_used, questions_answered`
      )
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Get rank
    const { data: allMembers } = await this.db
      .from('members')
      .select('id')
      .order('points', { ascending: false });

    const rank = allMembers.findIndex(m => m.id === userId) + 1;

    return {
      ...data,
      rank,
      totalMembers: allMembers.length,
    };
  }

  /**
   * Update member leaderboard data
   */
  async updateMemberStats(userId, updates) {
    const { data, error } = await this.update('members', userId, {
      ...updates,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
    return data;
  }

  /**
   * Get leaderboard season data (if implementing seasons)
   */
  async getSeasonLeaderboard(seasonId, limit = 10, offset = 0) {
    const { data, error } = await this.db
      .from('season_points')
      .select('user_id, points, members(id, username, level, avatar_url)')
      .eq('season_id', seasonId)
      .order('points', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  }

  /**
   * Log leaderboard view for analytics
   */
  async logLeaderboardView(userId, viewType) {
    const { data, error } = await this.create('leaderboard_views', {
      user_id: userId,
      view_type: viewType,
      viewed_at: new Date().toISOString(),
    });

    if (error) throw error;
    return data;
  }
}

module.exports = LeaderboardRepository;
