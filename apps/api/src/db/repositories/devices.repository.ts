import type { Device, Platform } from '@360-imaging/shared';
import { query } from '../index.js';
import {
  BaseRepository,
  QueryOptions,
  mapRowToCamel,
  mapEntityToSnake,
} from './base.repository.js';

interface DeviceEntity extends Device {
  createdAt: Date;
  updatedAt: Date;
}

export class DevicesRepository extends BaseRepository<DeviceEntity> {
  protected tableName = 'devices';
  protected columns = [
    'id',
    'org_id',
    'site_id',
    'platform',
    'model',
    'app_version',
    'registered_at',
    'last_seen',
    'created_at',
    'updated_at',
  ];

  protected mapRow(row: Record<string, unknown>): DeviceEntity {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      siteId: row.site_id as string | undefined,
      platform: row.platform as Platform,
      model: row.model as string | undefined,
      appVersion: row.app_version as string | undefined,
      registeredAt: row.registered_at as Date,
      lastSeen: row.last_seen as Date | undefined,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  protected mapEntity(entity: Partial<DeviceEntity>): Record<string, unknown> {
    return mapEntityToSnake({
      orgId: entity.orgId,
      siteId: entity.siteId,
      platform: entity.platform,
      model: entity.model,
      appVersion: entity.appVersion,
      registeredAt: entity.registeredAt,
      lastSeen: entity.lastSeen,
    });
  }

  /**
   * Find or create device by platform/model/org
   * Used during device authentication
   */
  async findOrCreate(
    orgId: string,
    platform: Platform,
    model: string,
    appVersion: string
  ): Promise<DeviceEntity> {
    // Try to find existing device
    const existing = await query<Record<string, unknown>>(
      `SELECT * FROM devices
       WHERE org_id = $1 AND platform = $2 AND model = $3
       ORDER BY registered_at DESC
       LIMIT 1`,
      [orgId, platform, model]
    );

    if (existing.rows[0]) {
      // Update last_seen and app_version
      const updated = await query<Record<string, unknown>>(
        `UPDATE devices
         SET last_seen = NOW(), app_version = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [appVersion, existing.rows[0].id]
      );
      return this.mapRow(updated.rows[0]);
    }

    // Create new device
    const result = await query<Record<string, unknown>>(
      `INSERT INTO devices (org_id, platform, model, app_version, registered_at, last_seen)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [orgId, platform, model, appVersion]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Update last_seen timestamp
   */
  async updateLastSeen(deviceId: string, orgId: string): Promise<void> {
    await query(
      `UPDATE devices SET last_seen = NOW(), updated_at = NOW()
       WHERE id = $1 AND org_id = $2`,
      [deviceId, orgId]
    );
  }

  /**
   * Find devices by site
   */
  async findBySite(siteId: string, opts: QueryOptions): Promise<DeviceEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM devices
       WHERE org_id = $1 AND site_id = $2
       ORDER BY last_seen DESC`,
      [opts.orgId, siteId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Get active devices (seen in last 24 hours)
   */
  async findActive(opts: QueryOptions): Promise<DeviceEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM devices
       WHERE org_id = $1 AND last_seen > NOW() - INTERVAL '24 hours'
       ORDER BY last_seen DESC`,
      [opts.orgId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

export const devicesRepository = new DevicesRepository();
