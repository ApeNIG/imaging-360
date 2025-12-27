import type { User, UserRole } from '@360-imaging/shared';
import { query } from '../index.js';
import {
  BaseRepository,
  QueryOptions,
  mapEntityToSnake,
} from './base.repository.js';

interface UserEntity extends User {
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithSiteAccess extends UserEntity {
  siteIds: string[];
}

export class UsersRepository extends BaseRepository<UserEntity> {
  protected tableName = 'users';
  protected columns = [
    'id',
    'org_id',
    'email',
    'name',
    'role',
    'created_at',
    'updated_at',
  ];

  protected mapRow(row: Record<string, unknown>): UserEntity {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      email: row.email as string,
      name: row.name as string | undefined,
      role: row.role as UserRole,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  protected mapEntity(entity: Partial<UserEntity>): Record<string, unknown> {
    return mapEntityToSnake({
      orgId: entity.orgId,
      email: entity.email,
      name: entity.name,
      role: entity.role,
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string, opts: QueryOptions): Promise<UserEntity | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM users WHERE org_id = $1 AND email = $2`,
      [opts.orgId, email]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find user with site access
   */
  async findByIdWithSiteAccess(
    id: string,
    opts: QueryOptions
  ): Promise<UserWithSiteAccess | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT u.*,
         COALESCE(
           ARRAY_AGG(usa.site_id) FILTER (WHERE usa.site_id IS NOT NULL),
           '{}'::uuid[]
         ) as site_ids
       FROM users u
       LEFT JOIN user_site_access usa ON u.id = usa.user_id
       WHERE u.id = $1 AND u.org_id = $2
       GROUP BY u.id`,
      [id, opts.orgId]
    );

    if (!result.rows[0]) return null;

    const row = result.rows[0];
    return {
      ...this.mapRow(row),
      siteIds: row.site_ids as string[],
    };
  }

  /**
   * Find user by email with site access
   */
  async findByEmailWithSiteAccess(
    email: string,
    opts: QueryOptions
  ): Promise<UserWithSiteAccess | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT u.*,
         COALESCE(
           ARRAY_AGG(usa.site_id) FILTER (WHERE usa.site_id IS NOT NULL),
           '{}'::uuid[]
         ) as site_ids
       FROM users u
       LEFT JOIN user_site_access usa ON u.id = usa.user_id
       WHERE u.email = $1 AND u.org_id = $2
       GROUP BY u.id`,
      [email, opts.orgId]
    );

    if (!result.rows[0]) return null;

    const row = result.rows[0];
    return {
      ...this.mapRow(row),
      siteIds: row.site_ids as string[],
    };
  }

  /**
   * Find users by role
   */
  async findByRole(role: UserRole, opts: QueryOptions): Promise<UserEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM users WHERE org_id = $1 AND role = $2 ORDER BY name`,
      [opts.orgId, role]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find users with access to site
   */
  async findBySite(siteId: string, opts: QueryOptions): Promise<UserEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT u.* FROM users u
       INNER JOIN user_site_access usa ON u.id = usa.user_id
       WHERE u.org_id = $1 AND usa.site_id = $2
       ORDER BY u.name`,
      [opts.orgId, siteId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Create user with site access
   */
  async createWithSiteAccess(
    data: {
      orgId: string;
      email: string;
      name?: string;
      role: UserRole;
    },
    siteIds: string[]
  ): Promise<UserWithSiteAccess> {
    // Use transaction for atomicity
    const client = await (await import('../index.js')).db.connect();

    try {
      await client.query('BEGIN');

      // Create user
      const userResult = await client.query<Record<string, unknown>>(
        `INSERT INTO users (org_id, email, name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [data.orgId, data.email, data.name ?? null, data.role]
      );
      const user = this.mapRow(userResult.rows[0]);

      // Create site access records
      if (siteIds.length > 0) {
        const valueRows = siteIds
          .map((_, i) => `($1, $${i + 2})`)
          .join(', ');
        await client.query(
          `INSERT INTO user_site_access (user_id, site_id) VALUES ${valueRows}`,
          [user.id, ...siteIds]
        );
      }

      await client.query('COMMIT');

      return { ...user, siteIds };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update user's site access
   */
  async updateSiteAccess(
    userId: string,
    siteIds: string[],
    opts: QueryOptions
  ): Promise<void> {
    const client = await (await import('../index.js')).db.connect();

    try {
      await client.query('BEGIN');

      // Verify user belongs to org
      const userCheck = await client.query(
        `SELECT id FROM users WHERE id = $1 AND org_id = $2`,
        [userId, opts.orgId]
      );
      if (userCheck.rows.length === 0) {
        throw new Error('User not found');
      }

      // Delete existing access
      await client.query(
        `DELETE FROM user_site_access WHERE user_id = $1`,
        [userId]
      );

      // Insert new access
      if (siteIds.length > 0) {
        const valueRows = siteIds
          .map((_, i) => `($1, $${i + 2})`)
          .join(', ');
        await client.query(
          `INSERT INTO user_site_access (user_id, site_id) VALUES ${valueRows}`,
          [userId, ...siteIds]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if user has access to site
   */
  async hasAccessToSite(
    userId: string,
    siteId: string,
    opts: QueryOptions
  ): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM user_site_access usa
         INNER JOIN users u ON usa.user_id = u.id
         WHERE usa.user_id = $1 AND usa.site_id = $2 AND u.org_id = $3
       ) as exists`,
      [userId, siteId, opts.orgId]
    );
    return result.rows[0].exists;
  }
}

export const usersRepository = new UsersRepository();
