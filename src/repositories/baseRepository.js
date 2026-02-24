/**
 * Base Repository - Abstract base class for all repositories
 * Provides common database query patterns and error handling
 */

const logger = require('../../utils/logger');

class BaseRepository {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error('Supabase client is required');
    }
    this.db = supabaseClient;
  }

  /**
   * Execute a query with error handling and logging
   * @param {Function} queryFn - Function that executes the query
   * @param {string} operationName - Name for logging
   * @returns {Promise} Query result or null on error
   */
  async executeQuery(queryFn, operationName = 'Query') {
    const startTime = Date.now();
    try {
      const result = await queryFn();
      const duration = Date.now() - startTime;
      
      if (duration > 1000) {
        logger.warn(`${operationName} took ${duration}ms`, {
          operation: operationName,
          duration,
        });
      }
      
      logger.debug(`${operationName} completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`${operationName} failed after ${duration}ms`, {
        operation: operationName,
        error: error.message,
        duration,
      });
      throw error;
    }
  }

  /**
   * Find single record by ID
   */
  async findById(table, id) {
    return this.executeQuery(
      () => this.db.from(table).select('*').eq('id', id).single(),
      `FindById: ${table} ${id}`
    );
  }

  /**
   * Find all records with optional filtering
   */
  async findAll(table, filters = {}, options = {}) {
    let query = this.db.from(table).select(options.select || '*');

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });

    if (options.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending !== false,
      });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    return this.executeQuery(
      () => query,
      `FindAll: ${table}`
    );
  }

  /**
   * Create new record
   */
  async create(table, data) {
    return this.executeQuery(
      () => this.db.from(table).insert(data).select().single(),
      `Create: ${table}`
    );
  }

  /**
   * Update record
   */
  async update(table, id, data) {
    return this.executeQuery(
      () => this.db.from(table).update(data).eq('id', id).select().single(),
      `Update: ${table} ${id}`
    );
  }

  /**
   * Delete record
   */
  async delete(table, id) {
    return this.executeQuery(
      () => this.db.from(table).delete().eq('id', id).select(),
      `Delete: ${table} ${id}`
    );
  }

  /**
   * Execute raw SQL query
   */
  async executeRaw(sql, params = []) {
    return this.executeQuery(
      () => this.db.rpc(sql.replace(/SELECT /, ''), { ...params }),
      `ExecuteRaw: ${sql.substring(0, 50)}`
    );
  }

  /**
   * Count records in table
   */
  async count(table, filters = {}) {
    let query = this.db.from(table).select('*', { count: 'exact', head: true });

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });

    const { count } = await this.executeQuery(
      () => query,
      `Count: ${table}`
    );

    return count || 0;
  }

  /**
   * Batch create multiple records
   */
  async batchCreate(table, dataArray) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      throw new Error('dataArray must be non-empty array');
    }

    return this.executeQuery(
      () => this.db.from(table).insert(dataArray).select(),
      `BatchCreate: ${table} (${dataArray.length} items)`
    );
  }

  /**
   * Upsert record (create if not exists, update if exists)
   */
  async upsert(table, data, conflictKeys) {
    return this.executeQuery(
      () => this.db
        .from(table)
        .upsert(data, { onConflict: conflictKeys.join(',') })
        .select(),
      `Upsert: ${table}`
    );
  }

  /**
   * Paginated query with total count
   */
  async paginate(table, page = 1, pageSize = 10, filters = {}, orderBy = null) {
    const offset = (page - 1) * pageSize;
    
    // Get total count
    const totalCount = await this.count(table, filters);

    // Get paginated data
    const data = await this.findAll(table, filters, {
      orderBy,
      limit: pageSize,
      offset,
    });

    return {
      data: data.data || [],
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        hasMore: offset + pageSize < totalCount,
      },
    };
  }

  /**
   * Transaction: multiple operations that all succeed or all fail
   */
  async transaction(operations) {
    try {
      const results = [];
      for (const operation of operations) {
        const result = await operation();
        results.push(result);
      }
      return results;
    } catch (error) {
      logger.error('Transaction failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = BaseRepository;
