import type {
  Image,
  ImageStatus,
  ImageExif,
  ThumbKeys,
  QCResult,
} from '@360-imaging/shared';
import { query, db } from '../index.js';
import {
  BaseRepository,
  QueryOptions,
  PaginationOptions,
  mapEntityToSnake,
} from './base.repository.js';

interface ImageEntity extends Image {
  createdAt: Date;
  updatedAt: Date;
}

export interface ImageFilter {
  sessionId?: string;
  status?: ImageStatus;
  vehicleId?: string;
}

export class ImagesRepository extends BaseRepository<ImageEntity> {
  protected tableName = 'images';
  protected columns = [
    'id',
    'org_id',
    'site_id',
    'session_id',
    'vehicle_id',
    'angle_deg',
    'shot_name',
    'hash_sha256',
    'phash',
    'width',
    'height',
    'exif',
    'storage_key',
    'thumb_keys',
    'qc',
    'qc_version',
    'status',
    'created_at',
    'published_at',
    'updated_at',
  ];

  protected mapRow(row: Record<string, unknown>): ImageEntity {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      siteId: row.site_id as string,
      sessionId: row.session_id as string,
      vehicleId: row.vehicle_id as string,
      angleDeg: row.angle_deg as number | undefined,
      shotName: row.shot_name as string | undefined,
      hashSha256: row.hash_sha256 as string,
      phash: row.phash as string | undefined,
      width: row.width as number | undefined,
      height: row.height as number | undefined,
      exif: row.exif as ImageExif | undefined,
      storageKey: row.storage_key as string,
      thumbKeys: row.thumb_keys as ThumbKeys | undefined,
      qc: row.qc as QCResult | undefined,
      qcVersion: row.qc_version as number,
      status: row.status as ImageStatus,
      createdAt: row.created_at as Date,
      publishedAt: row.published_at as Date | undefined,
      updatedAt: row.updated_at as Date,
    };
  }

  protected mapEntity(entity: Partial<ImageEntity>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    if (entity.orgId !== undefined) mapped.org_id = entity.orgId;
    if (entity.siteId !== undefined) mapped.site_id = entity.siteId;
    if (entity.sessionId !== undefined) mapped.session_id = entity.sessionId;
    if (entity.vehicleId !== undefined) mapped.vehicle_id = entity.vehicleId;
    if (entity.angleDeg !== undefined) mapped.angle_deg = entity.angleDeg;
    if (entity.shotName !== undefined) mapped.shot_name = entity.shotName;
    if (entity.hashSha256 !== undefined) mapped.hash_sha256 = entity.hashSha256;
    if (entity.phash !== undefined) mapped.phash = entity.phash;
    if (entity.width !== undefined) mapped.width = entity.width;
    if (entity.height !== undefined) mapped.height = entity.height;
    if (entity.storageKey !== undefined) mapped.storage_key = entity.storageKey;
    if (entity.qcVersion !== undefined) mapped.qc_version = entity.qcVersion;
    if (entity.status !== undefined) mapped.status = entity.status;
    if (entity.publishedAt !== undefined) mapped.published_at = entity.publishedAt;

    if (entity.exif) mapped.exif = JSON.stringify(entity.exif);
    if (entity.thumbKeys) mapped.thumb_keys = JSON.stringify(entity.thumbKeys);
    if (entity.qc) mapped.qc = JSON.stringify(entity.qc);

    return mapped;
  }

  /**
   * Find images by session with ordering for 360 or stills
   */
  async findBySession(
    sessionId: string,
    opts: QueryOptions
  ): Promise<ImageEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM images
       WHERE org_id = $1 AND session_id = $2
       ORDER BY COALESCE(angle_deg, 999), created_at ASC`,
      [opts.orgId, sessionId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find filtered images with pagination
   */
  async findFiltered(
    opts: QueryOptions,
    filters: ImageFilter,
    pagination?: PaginationOptions
  ): Promise<ImageEntity[]> {
    const params: unknown[] = [opts.orgId];
    let sql = `SELECT * FROM images WHERE org_id = $1`;

    if (filters.sessionId) {
      sql += ` AND session_id = $${params.length + 1}`;
      params.push(filters.sessionId);
    }

    if (filters.status) {
      sql += ` AND status = $${params.length + 1}`;
      params.push(filters.status);
    }

    if (filters.vehicleId) {
      sql += ` AND vehicle_id = $${params.length + 1}`;
      params.push(filters.vehicleId);
    }

    sql += ` ORDER BY COALESCE(angle_deg, 999), created_at ASC`;

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
   * Check for duplicate by hash
   */
  async findByHash(
    hashSha256: string,
    opts: QueryOptions
  ): Promise<ImageEntity | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM images WHERE org_id = $1 AND hash_sha256 = $2`,
      [opts.orgId, hashSha256]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Create image record (with upsert on hash conflict)
   */
  async createOrUpdate(
    data: {
      orgId: string;
      siteId: string;
      sessionId: string;
      vehicleId: string;
      storageKey: string;
      hashSha256: string;
      angleDeg?: number;
      shotName?: string;
      width?: number;
      height?: number;
      exif?: ImageExif;
      thumbKeys?: ThumbKeys;
      qc?: QCResult;
      qcVersion?: number;
      status: ImageStatus;
    }
  ): Promise<ImageEntity> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO images (
         org_id, site_id, session_id, vehicle_id, storage_key, hash_sha256,
         angle_deg, shot_name, width, height, exif, thumb_keys, qc, qc_version, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (hash_sha256) DO UPDATE SET
         thumb_keys = COALESCE(EXCLUDED.thumb_keys, images.thumb_keys),
         qc = COALESCE(EXCLUDED.qc, images.qc),
         qc_version = COALESCE(EXCLUDED.qc_version, images.qc_version),
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING *`,
      [
        data.orgId,
        data.siteId,
        data.sessionId,
        data.vehicleId,
        data.storageKey,
        data.hashSha256,
        data.angleDeg ?? null,
        data.shotName ?? null,
        data.width ?? null,
        data.height ?? null,
        data.exif ? JSON.stringify(data.exif) : null,
        data.thumbKeys ? JSON.stringify(data.thumbKeys) : null,
        data.qc ? JSON.stringify(data.qc) : null,
        data.qcVersion ?? 1,
        data.status,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Update image with processing results
   */
  async updateProcessingResult(
    id: string,
    orgId: string,
    data: {
      width?: number;
      height?: number;
      exif?: ImageExif;
      thumbKeys?: ThumbKeys;
      qc?: QCResult;
      qcVersion?: number;
      status: ImageStatus;
      phash?: string;
    }
  ): Promise<ImageEntity | null> {
    const result = await query<Record<string, unknown>>(
      `UPDATE images SET
         width = COALESCE($3, width),
         height = COALESCE($4, height),
         exif = COALESCE($5, exif),
         thumb_keys = COALESCE($6, thumb_keys),
         qc = COALESCE($7, qc),
         qc_version = COALESCE($8, qc_version),
         status = $9,
         phash = COALESCE($10, phash),
         updated_at = NOW()
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [
        id,
        orgId,
        data.width ?? null,
        data.height ?? null,
        data.exif ? JSON.stringify(data.exif) : null,
        data.thumbKeys ? JSON.stringify(data.thumbKeys) : null,
        data.qc ? JSON.stringify(data.qc) : null,
        data.qcVersion ?? null,
        data.status,
        data.phash ?? null,
      ]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Publish image
   */
  async publish(id: string, opts: QueryOptions): Promise<ImageEntity | null> {
    const result = await query<Record<string, unknown>>(
      `UPDATE images
       SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [id, opts.orgId]
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Bulk publish images
   */
  async bulkPublish(ids: string[], opts: QueryOptions): Promise<number> {
    const result = await query(
      `UPDATE images
       SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE id = ANY($1) AND org_id = $2`,
      [ids, opts.orgId]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Count images by session
   */
  async countBySession(sessionId: string, opts: QueryOptions): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM images WHERE org_id = $1 AND session_id = $2`,
      [opts.orgId, sessionId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Count images by status for session
   */
  async countByStatusForSession(
    sessionId: string,
    opts: QueryOptions
  ): Promise<Record<ImageStatus, number>> {
    const result = await query<{ status: ImageStatus; count: string }>(
      `SELECT status, COUNT(*) as count FROM images
       WHERE org_id = $1 AND session_id = $2
       GROUP BY status`,
      [opts.orgId, sessionId]
    );

    const counts: Record<ImageStatus, number> = {
      pending: 0,
      processing: 0,
      processed: 0,
      failed: 0,
      published: 0,
    };

    for (const row of result.rows) {
      counts[row.status] = parseInt(row.count, 10);
    }

    return counts;
  }
}

export const imagesRepository = new ImagesRepository();
