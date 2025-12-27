import type { Site, SiteAddress } from '@360-imaging/shared';
import { query } from '../index.js';
import {
  BaseRepository,
  QueryOptions,
  mapEntityToSnake,
} from './base.repository.js';

interface SiteEntity extends Site {
  createdAt: Date;
  updatedAt: Date;
}

export class SitesRepository extends BaseRepository<SiteEntity> {
  protected tableName = 'sites';
  protected columns = [
    'id',
    'org_id',
    'name',
    'slug',
    'address',
    'timezone',
    'settings',
    'created_at',
    'updated_at',
  ];

  protected mapRow(row: Record<string, unknown>): SiteEntity {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      name: row.name as string,
      slug: row.slug as string,
      address: row.address as SiteAddress | undefined,
      timezone: row.timezone as string,
      settings: (row.settings as Record<string, unknown>) || {},
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  protected mapEntity(entity: Partial<SiteEntity>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    if (entity.orgId !== undefined) mapped.org_id = entity.orgId;
    if (entity.name !== undefined) mapped.name = entity.name;
    if (entity.slug !== undefined) mapped.slug = entity.slug;
    if (entity.timezone !== undefined) mapped.timezone = entity.timezone;
    if (entity.address) mapped.address = JSON.stringify(entity.address);
    if (entity.settings) mapped.settings = JSON.stringify(entity.settings);

    return mapped;
  }

  /**
   * Find site by slug
   */
  async findBySlug(slug: string, opts: QueryOptions): Promise<SiteEntity | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM sites WHERE org_id = $1 AND slug = $2`,
      [opts.orgId, slug]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find sites accessible by user
   */
  async findAccessibleByUser(
    userId: string,
    opts: QueryOptions
  ): Promise<SiteEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT s.* FROM sites s
       INNER JOIN user_site_access usa ON s.id = usa.site_id
       WHERE s.org_id = $1 AND usa.user_id = $2
       ORDER BY s.name`,
      [opts.orgId, userId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all sites in org (for admins)
   */
  async findAllInOrg(opts: QueryOptions): Promise<SiteEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM sites WHERE org_id = $1 ORDER BY name`,
      [opts.orgId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Create site
   */
  async create(data: {
    orgId: string;
    name: string;
    slug: string;
    timezone?: string;
    address?: SiteAddress;
    settings?: Record<string, unknown>;
  }): Promise<SiteEntity> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO sites (org_id, name, slug, timezone, address, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.orgId,
        data.name,
        data.slug,
        data.timezone ?? 'America/New_York',
        data.address ? JSON.stringify(data.address) : null,
        data.settings ? JSON.stringify(data.settings) : '{}',
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Check if user has access to site
   */
  async userHasAccess(
    userId: string,
    siteId: string,
    opts: QueryOptions
  ): Promise<boolean> {
    // Admin users have access to all sites in their org
    const adminCheck = await query<{ role: string }>(
      `SELECT role FROM users WHERE id = $1 AND org_id = $2`,
      [userId, opts.orgId]
    );

    if (adminCheck.rows[0]?.role === 'admin') {
      // Verify site belongs to org
      const siteCheck = await query<{ id: string }>(
        `SELECT id FROM sites WHERE id = $1 AND org_id = $2`,
        [siteId, opts.orgId]
      );
      return siteCheck.rows.length > 0;
    }

    // Non-admin: check user_site_access
    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM user_site_access usa
         INNER JOIN sites s ON usa.site_id = s.id
         WHERE usa.user_id = $1 AND usa.site_id = $2 AND s.org_id = $3
       ) as exists`,
      [userId, siteId, opts.orgId]
    );
    return result.rows[0].exists;
  }

  /**
   * Get site statistics
   */
  async getStats(
    siteId: string,
    opts: QueryOptions
  ): Promise<{
    sessionCount: number;
    imageCount: number;
    vehicleCount: number;
    activeSessionCount: number;
  }> {
    const result = await query<{
      session_count: string;
      image_count: string;
      vehicle_count: string;
      active_session_count: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM sessions WHERE site_id = $1 AND org_id = $2) as session_count,
         (SELECT COUNT(*) FROM images WHERE site_id = $1 AND org_id = $2) as image_count,
         (SELECT COUNT(*) FROM vehicles WHERE site_id = $1 AND org_id = $2) as vehicle_count,
         (SELECT COUNT(*) FROM sessions WHERE site_id = $1 AND org_id = $2 AND status = 'active') as active_session_count`,
      [siteId, opts.orgId]
    );

    const row = result.rows[0];
    return {
      sessionCount: parseInt(row.session_count, 10),
      imageCount: parseInt(row.image_count, 10),
      vehicleCount: parseInt(row.vehicle_count, 10),
      activeSessionCount: parseInt(row.active_session_count, 10),
    };
  }
}

export const sitesRepository = new SitesRepository();
