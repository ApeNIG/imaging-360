import type { Organization } from '@360-imaging/shared';
import { query } from '../index.js';
import { BaseRepository, mapEntityToSnake } from './base.repository.js';

interface OrgEntity extends Organization {
  createdAt: Date;
  updatedAt: Date;
}

export class OrganizationsRepository {
  protected tableName = 'organizations';

  protected mapRow(row: Record<string, unknown>): OrgEntity {
    return {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      settings: (row.settings as Record<string, unknown>) || {},
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  /**
   * Find organization by ID
   */
  async findById(id: string): Promise<OrgEntity | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM organizations WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find organization by slug
   */
  async findBySlug(slug: string): Promise<OrgEntity | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM organizations WHERE slug = $1`,
      [slug]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Check if organization exists
   */
  async exists(id: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM organizations WHERE id = $1) as exists`,
      [id]
    );
    return result.rows[0].exists;
  }

  /**
   * Create organization
   */
  async create(data: {
    name: string;
    slug: string;
    settings?: Record<string, unknown>;
  }): Promise<OrgEntity> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO organizations (name, slug, settings)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.name, data.slug, data.settings ? JSON.stringify(data.settings) : '{}']
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Update organization settings
   */
  async updateSettings(
    id: string,
    settings: Record<string, unknown>
  ): Promise<OrgEntity | null> {
    const result = await query<Record<string, unknown>>(
      `UPDATE organizations
       SET settings = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(settings)]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get organization statistics
   */
  async getStats(id: string): Promise<{
    siteCount: number;
    userCount: number;
    deviceCount: number;
    sessionCount: number;
    imageCount: number;
  }> {
    const result = await query<{
      site_count: string;
      user_count: string;
      device_count: string;
      session_count: string;
      image_count: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM sites WHERE org_id = $1) as site_count,
         (SELECT COUNT(*) FROM users WHERE org_id = $1) as user_count,
         (SELECT COUNT(*) FROM devices WHERE org_id = $1) as device_count,
         (SELECT COUNT(*) FROM sessions WHERE org_id = $1) as session_count,
         (SELECT COUNT(*) FROM images WHERE org_id = $1) as image_count`,
      [id]
    );

    const row = result.rows[0];
    return {
      siteCount: parseInt(row.site_count, 10),
      userCount: parseInt(row.user_count, 10),
      deviceCount: parseInt(row.device_count, 10),
      sessionCount: parseInt(row.session_count, 10),
      imageCount: parseInt(row.image_count, 10),
    };
  }
}

export const organizationsRepository = new OrganizationsRepository();
