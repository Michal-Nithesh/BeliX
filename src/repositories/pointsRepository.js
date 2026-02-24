/**
 * Points Repository
 * Data access layer for points management
 */

const BaseRepository = require('./baseRepository');

class PointsRepository extends BaseRepository {
  /**
   * Get member's current points
   */
  async getMemberPoints(userId) {
    const { data, error } = await this.db
      .from('members')
      .select('points')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data?.points || 0;
  }

  /**
   * Add points to member
   */
  async addPoints(userId, points, source = 'command', metadata = {}) {
    // Get current points
    const currentPoints = await this.getMemberPoints(userId);
    const newPoints = currentPoints + points;

    // Update member points
    const { data: updated, error: updateError } = await this.update(
      'members',
      userId,
      { points: newPoints, updated_at: new Date().toISOString() }
    );

    if (updateError) throw updateError;

    // Log transaction
    await this.create('point_history', {
      user_id: userId,
      points_added: points,
      source,
      metadata: JSON.stringify(metadata),
      created_at: new Date().toISOString(),
    });

    return { previousPoints: currentPoints, newPoints, pointsAdded: points };
  }

  /**
   * Subtract points from member
   */
  async subtractPoints(userId, points, reason = '', metadata = {}) {
    return this.addPoints(userId, -points, reason, metadata);
  }

  /**
   * Set member points (absolute value)
   */
  async setPoints(userId, points, reason = '', metadata = {}) {
    const currentPoints = await this.getMemberPoints(userId);
    const pointsDifference = points - currentPoints;

    const { data: updated, error: updateError } = await this.update(
      'members',
      userId,
      { points, updated_at: new Date().toISOString() }
    );

    if (updateError) throw updateError;

    // Log transaction
    await this.create('point_history', {
      user_id: userId,
      points_added: pointsDifference,
      source: 'set',
      reason,
      metadata: JSON.stringify(metadata),
      created_at: new Date().toISOString(),
    });

    return { previousPoints: currentPoints, newPoints: points, pointsDifference };
  }

  /**
   * Get point history for user
   */
  async getPointHistory(userId, limit = 50, offset = 0) {
    const { data, error } = await this.db
      .from('point_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  }

  /**
   * Get points earned in date range
   */
  async getPointsInRange(userId, startDate, endDate) {
    const { data, error } = await this.db
      .from('point_history')
      .select('points_added')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) throw error;

    const totalPoints = data.reduce((sum, record) => sum + record.points_added, 0);
    return { count: data.length, totalPoints };
  }

  /**
   * Get daily point summary
   */
  async getDailyPointSummary(userId, days = 30) {
    const { data, error } = await this.db
      .from('point_history')
      .select('created_at, points_added')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (error) throw error;

    // Group by date
    const summary = {};
    data.forEach(record => {
      const date = new Date(record.created_at).toISOString().split('T')[0];
      summary[date] = (summary[date] || 0) + record.points_added;
    });

    return summary;
  }

  /**
   * Get point sources breakdown
   */
  async getPointSourceBreakdown(userId, days = 30) {
    const { data, error } = await this.db
      .from('point_history')
      .select('source, points_added')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (error) throw error;

    // Group by source
    const breakdown = {};
    data.forEach(record => {
      breakdown[record.source] = (breakdown[record.source] || 0) + record.points_added;
    });

    return breakdown;
  }

  /**
   * Transfer points between members
   */
  async transferPoints(fromUserId, toUserId, points, reason = '') {
    await this.subtractPoints(fromUserId, points, `transfer_out_${reason}`);
    await this.addPoints(toUserId, points, `transfer_in_${reason}`);

    return { from: fromUserId, to: toUserId, points, reason };
  }

  /**
   * Bulk adjust points for members
   */
  async bulkAdjustPoints(adjustments) {
    // adjustments: [{ userId, points, reason }, ...]
    const results = [];

    for (const { userId, points, reason, metadata } of adjustments) {
      const result = await this.addPoints(userId, points, reason, metadata);
      results.push(result);
    }

    return results;
  }

  /**
   * Get top point earners in period
   */
  async getTopEarners(days = 7, limit = 10) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data, error } = await this.db
      .from('point_history')
      .select('user_id, sum(points_added) as total_earned')
      .gte('created_at', startDate.toISOString())
      .group_by('user_id')
      .order('total_earned', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Enrich with member data
    const memberIds = data.map(d => d.user_id);
    const { data: members } = await this.db
      .from('members')
      .select('id, username, level')
      .in('id', memberIds);

    return data.map(earner => ({
      member: members.find(m => m.id === earner.user_id),
      pointsEarned: earner.total_earned,
    }));
  }
}

module.exports = PointsRepository;
