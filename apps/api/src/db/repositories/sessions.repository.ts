import type { Session, SessionStatus, CaptureMode, ShotList, Vehicle, User, Site } from '@360-imaging/shared';
import { query, db } from '../index.js';
import {
  BaseRepository,
  QueryOptions,
  PaginationOptions,
  mapEntityToSnake,
} from './base.repository.js';

interface SessionEntity extends Session {
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionWithDetails extends SessionEntity {
  vehicle?: Vehicle;
  operator?: Pick<User, 'id' | 'name'>;
  site?: Pick<Site, 'id' | 'name'>;
  imageCount?: number;
}

export interface SessionFilter {
  siteId?: string;
  status?: SessionStatus;
  vehicleId?: string;
}

export class SessionsRepository extends BaseRepository<SessionEntity> {
  protected tableName = 'sessions';
  protected columns = [
    'id',
    'org_id',
    'site_id',
    'vehicle_id',
    'mode',
    'shot_list',
    'operator_id',
    'device_id',
    'started_at',
    'completed_at',
    'status',
    'abandoned_at',
    'created_at',
    'updated_at',
  ];

  protected mapRow(row: Record<string, unknown>): SessionEntity {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      siteId: row.site_id as string,
      vehicleId: row.vehicle_id as string,
      mode: row.mode as CaptureMode,
      shotList: row.shot_list as ShotList | undefined,
      operatorId: row.operator_id as string,
      deviceId: row.device_id as string,
      startedAt: row.started_at as Date,
      completedAt: row.completed_at as Date | undefined,
      status: row.status as SessionStatus,
      abandonedAt: row.abandoned_at as Date | undefined,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  protected mapEntity(entity: Partial<SessionEntity>): Record<string, unknown> {
    const mapped = mapEntityToSnake({
      orgId: entity.orgId,
      siteId: entity.siteId,
      vehicleId: entity.vehicleId,
      mode: entity.mode,
      operatorId: entity.operatorId,
      deviceId: entity.deviceId,
      startedAt: entity.startedAt,
      completedAt: entity.completedAt,
      status: entity.status,
      abandonedAt: entity.abandonedAt,
    });

    if (entity.shotList) {
      mapped.shot_list = JSON.stringify(entity.shotList);
    }

    return mapped;
  }

  /**
   * Create a new session
   */
  async create(
    orgId: string,
    siteId: string,
    vehicleId: string,
    mode: CaptureMode,
    operatorId: string,
    deviceId: string,
    shotList?: ShotList
  ): Promise<SessionEntity> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO sessions (org_id, site_id, vehicle_id, mode, shot_list, operator_id, device_id, started_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'active')
       RETURNING *`,
      [
        orgId,
        siteId,
        vehicleId,
        mode,
        shotList ? JSON.stringify(shotList) : null,
        operatorId,
        deviceId,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find session with related data
   */
  async findByIdWithDetails(
    id: string,
    opts: QueryOptions
  ): Promise<SessionWithDetails | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT
         s.*,
         v.id as vehicle_id, v.vin, v.stock, v.meta as vehicle_meta,
         u.id as user_id, u.name as operator_name,
         st.id as site_id_ref, st.name as site_name,
         (SELECT COUNT(*) FROM images WHERE session_id = s.id) as image_count
       FROM sessions s
       LEFT JOIN vehicles v ON s.vehicle_id = v.id
       LEFT JOIN users u ON s.operator_id = u.id
       LEFT JOIN sites st ON s.site_id = st.id
       WHERE s.id = $1 AND s.org_id = $2`,
      [id, opts.orgId]
    );

    if (!result.rows[0]) return null;

    const row = result.rows[0];
    return {
      ...this.mapRow(row),
      vehicle: row.vin || row.stock ? {
        id: row.vehicle_id as string,
        orgId: opts.orgId,
        siteId: row.site_id as string,
        vin: row.vin as string | undefined,
        stock: row.stock as string | undefined,
        meta: (row.vehicle_meta as Record<string, unknown>) || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } : undefined,
      operator: row.user_id ? {
        id: row.user_id as string,
        name: row.operator_name as string | undefined,
      } : undefined,
      site: row.site_id_ref ? {
        id: row.site_id_ref as string,
        name: row.site_name as string,
      } : undefined,
      imageCount: parseInt(row.image_count as string, 10) || 0,
    };
  }

  /**
   * List sessions with filters and pagination
   */
  async findFiltered(
    opts: QueryOptions,
    filters: SessionFilter,
    pagination?: PaginationOptions
  ): Promise<SessionWithDetails[]> {
    const params: unknown[] = [opts.orgId];
    let sql = `
      SELECT
        s.*,
        v.vin, v.stock, v.meta as vehicle_meta,
        u.name as operator_name,
        st.name as site_name,
        (SELECT COUNT(*) FROM images WHERE session_id = s.id) as image_count
      FROM sessions s
      LEFT JOIN vehicles v ON s.vehicle_id = v.id
      LEFT JOIN users u ON s.operator_id = u.id
      LEFT JOIN sites st ON s.site_id = st.id
      WHERE s.org_id = $1
    `;

    // Filter by accessible sites
    if (opts.siteIds && opts.siteIds.length > 0) {
      sql += ` AND s.site_id = ANY($${params.length + 1})`;
      params.push(opts.siteIds);
    }

    if (filters.siteId) {
      sql += ` AND s.site_id = $${params.length + 1}`;
      params.push(filters.siteId);
    }

    if (filters.status) {
      sql += ` AND s.status = $${params.length + 1}`;
      params.push(filters.status);
    }

    if (filters.vehicleId) {
      sql += ` AND s.vehicle_id = $${params.length + 1}`;
      params.push(filters.vehicleId);
    }

    // Order: active first, then by started_at desc
    sql += ` ORDER BY (CASE WHEN s.status = 'active' THEN 0 ELSE 1 END), s.started_at DESC`;

    if (pagination?.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(pagination.limit);
    }
    if (pagination?.offset) {
      sql += ` OFFSET $${params.length + 1}`;
      params.push(pagination.offset);
    }

    const result = await query<Record<string, unknown>>(sql, params);

    return result.rows.map((row) => ({
      ...this.mapRow(row),
      vehicle: row.vin || row.stock ? {
        id: row.vehicle_id as string,
        orgId: opts.orgId,
        siteId: row.site_id as string,
        vin: row.vin as string | undefined,
        stock: row.stock as string | undefined,
        meta: (row.vehicle_meta as Record<string, unknown>) || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } : undefined,
      operator: row.operator_name ? {
        id: row.operator_id as string,
        name: row.operator_name as string,
      } : undefined,
      site: {
        id: row.site_id as string,
        name: row.site_name as string,
      },
      imageCount: parseInt(row.image_count as string, 10) || 0,
    }));
  }

  /**
   * Update session status
   */
  async updateStatus(
    id: string,
    status: SessionStatus,
    opts: QueryOptions
  ): Promise<SessionEntity | null> {
    let sql = `UPDATE sessions SET status = $1, updated_at = NOW()`;
    const params: unknown[] = [status];

    if (status === 'complete') {
      sql += `, completed_at = NOW()`;
    } else if (status === 'abandoned') {
      sql += `, abandoned_at = NOW()`;
    }

    sql += ` WHERE id = $${params.length + 1} AND org_id = $${params.length + 2} RETURNING *`;
    params.push(id, opts.orgId);

    const result = await query<Record<string, unknown>>(sql, params);
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Count sessions by status
   */
  async countByStatus(
    opts: QueryOptions
  ): Promise<Record<SessionStatus, number>> {
    const result = await query<{ status: SessionStatus; count: string }>(
      `SELECT status, COUNT(*) as count FROM sessions WHERE org_id = $1 GROUP BY status`,
      [opts.orgId]
    );

    const counts: Record<SessionStatus, number> = {
      active: 0,
      complete: 0,
      abandoned: 0,
      failed: 0,
    };

    for (const row of result.rows) {
      counts[row.status] = parseInt(row.count, 10);
    }

    return counts;
  }

  /**
   * Find active sessions for device
   */
  async findActiveByDevice(
    deviceId: string,
    opts: QueryOptions
  ): Promise<SessionEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM sessions
       WHERE org_id = $1 AND device_id = $2 AND status = 'active'
       ORDER BY started_at DESC`,
      [opts.orgId, deviceId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }
}

export const sessionsRepository = new SessionsRepository();
