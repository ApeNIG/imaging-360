import pg from 'pg';
import { db, query } from '../index.js';
import { logger } from '../../lib/logger.js';

export interface QueryOptions {
  orgId: string;
  siteIds?: string[];
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface BaseEntity {
  id: string;
  orgId: string;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Base repository with org_id scoping enforcement.
 * All queries MUST include org_id in WHERE clause.
 */
export abstract class BaseRepository<T extends BaseEntity> {
  protected abstract tableName: string;
  protected abstract columns: string[];

  /**
   * Maps database row (snake_case) to entity (camelCase)
   */
  protected abstract mapRow(row: Record<string, unknown>): T;

  /**
   * Maps entity (camelCase) to database columns (snake_case)
   */
  protected abstract mapEntity(entity: Partial<T>): Record<string, unknown>;

  /**
   * Find by ID with org_id scoping
   */
  async findById(id: string, opts: QueryOptions): Promise<T | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM ${this.tableName} WHERE id = $1 AND org_id = $2`,
      [id, opts.orgId]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find all with org_id scoping and optional site filtering
   */
  async findAll(
    opts: QueryOptions,
    pagination?: PaginationOptions
  ): Promise<T[]> {
    const params: unknown[] = [opts.orgId];
    let sql = `SELECT * FROM ${this.tableName} WHERE org_id = $1`;

    if (opts.siteIds && opts.siteIds.length > 0) {
      sql += ` AND site_id = ANY($${params.length + 1})`;
      params.push(opts.siteIds);
    }

    sql += ` ORDER BY created_at DESC`;

    if (pagination?.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(pagination.limit);
    }
    if (pagination?.offset) {
      sql += ` OFFSET $${params.length + 1}`;
      params.push(pagination.offset);
    }

    const result = await query<Record<string, unknown>>(sql, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Count with org_id scoping
   */
  async count(opts: QueryOptions): Promise<number> {
    const params: unknown[] = [opts.orgId];
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE org_id = $1`;

    if (opts.siteIds && opts.siteIds.length > 0) {
      sql += ` AND site_id = ANY($${params.length + 1})`;
      params.push(opts.siteIds);
    }

    const result = await query<{ count: string }>(sql, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Insert with org_id enforcement
   */
  async insert(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const mapped = this.mapEntity(entity as Partial<T>);
    const columns = Object.keys(mapped);
    const values = Object.values(mapped);
    const placeholders = columns.map((_, i) => `$${i + 1}`);

    const sql = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    const result = await query<Record<string, unknown>>(sql, values);
    return this.mapRow(result.rows[0]);
  }

  /**
   * Update with org_id scoping
   */
  async update(
    id: string,
    entity: Partial<T>,
    opts: QueryOptions
  ): Promise<T | null> {
    const mapped = this.mapEntity(entity);
    mapped.updated_at = new Date();

    const columns = Object.keys(mapped);
    const values = Object.values(mapped);
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');

    const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE id = $${values.length + 1} AND org_id = $${values.length + 2}
      RETURNING *
    `;

    const result = await query<Record<string, unknown>>(
      sql,
      [...values, id, opts.orgId]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Delete with org_id scoping
   */
  async delete(id: string, opts: QueryOptions): Promise<boolean> {
    const result = await query(
      `DELETE FROM ${this.tableName} WHERE id = $1 AND org_id = $2`,
      [id, opts.orgId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Execute raw query with org_id parameter
   */
  protected async rawQuery<R = unknown>(
    sql: string,
    params: unknown[]
  ): Promise<pg.QueryResult<R>> {
    return query<R>(sql, params);
  }

  /**
   * Transaction helper
   */
  protected async transaction<R>(
    fn: (client: pg.PoolClient) => Promise<R>
  ): Promise<R> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// Helper to convert snake_case to camelCase
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Helper to convert camelCase to snake_case
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Map entire object from snake_case to camelCase
export function mapRowToCamel<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[toCamelCase(key)] = value;
  }
  return result as T;
}

// Map entire object from camelCase to snake_case
export function mapEntityToSnake(entity: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (value !== undefined) {
      result[toSnakeCase(key)] = value;
    }
  }
  return result;
}
