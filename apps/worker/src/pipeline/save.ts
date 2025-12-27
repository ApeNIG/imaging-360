import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import type { ThumbKeys, ImageExif, QCResult, ImageStatus } from '@360-imaging/shared';

interface SaveImageParams {
  orgId: string;
  siteId: string;
  sessionId: string;
  storageKey: string;
  hashSha256: string;
  width: number;
  height: number;
  exif?: ImageExif;
  thumbKeys: ThumbKeys;
  qc: QCResult;
  qcVersion: number;
  status: ImageStatus;
  phash?: string;
}

export async function saveImageRecord(params: SaveImageParams): Promise<string> {
  const startTime = Date.now();

  // Get vehicle_id from session
  const sessionResult = await query<{ vehicle_id: string }>(
    `SELECT vehicle_id FROM sessions WHERE id = $1 AND org_id = $2`,
    [params.sessionId, params.orgId]
  );

  if (sessionResult.rows.length === 0) {
    throw new Error(`Session not found: ${params.sessionId}`);
  }

  const vehicleId = sessionResult.rows[0].vehicle_id;

  // Parse angle from filename if present (e.g., 0deg.jpg, 15deg.jpg)
  const angleMatch = params.storageKey.match(/(\d+)deg\./i);
  const angleDeg = angleMatch ? parseInt(angleMatch[1], 10) : undefined;

  // Parse shot name from filename if present (e.g., front_3q.jpg)
  const shotMatch = params.storageKey.match(/\/([a-z_]+)\.(jpg|jpeg|heic)$/i);
  const shotName = shotMatch && !angleMatch ? shotMatch[1] : undefined;

  // Upsert image record
  const result = await query<{ id: string }>(
    `INSERT INTO images (
      org_id, site_id, session_id, vehicle_id, storage_key, hash_sha256,
      angle_deg, shot_name, width, height, exif, thumb_keys, qc, qc_version, status, phash
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (hash_sha256) DO UPDATE SET
      thumb_keys = COALESCE(EXCLUDED.thumb_keys, images.thumb_keys),
      qc = COALESCE(EXCLUDED.qc, images.qc),
      qc_version = COALESCE(EXCLUDED.qc_version, images.qc_version),
      status = EXCLUDED.status,
      phash = COALESCE(EXCLUDED.phash, images.phash),
      updated_at = NOW()
    RETURNING id`,
    [
      params.orgId,
      params.siteId,
      params.sessionId,
      vehicleId,
      params.storageKey,
      params.hashSha256,
      angleDeg ?? null,
      shotName ?? null,
      params.width,
      params.height,
      params.exif ? JSON.stringify(params.exif) : null,
      JSON.stringify(params.thumbKeys),
      JSON.stringify(params.qc),
      params.qcVersion,
      params.status,
      params.phash ?? null,
    ]
  );

  const imageId = result.rows[0].id;

  // Log event
  await query(
    `INSERT INTO events (org_id, entity_type, entity_id, type, actor_type, meta)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.orgId,
      'image',
      imageId,
      params.status === 'processed' ? 'processing_complete' : 'processing_failed',
      'system',
      JSON.stringify({
        sessionId: params.sessionId,
        qcStatus: params.status,
        sharpness: params.qc.sharpness?.status,
        exposure: params.qc.exposure?.status,
      }),
    ]
  );

  const duration = Date.now() - startTime;
  logger.info({ imageId, duration }, 'Image record saved');

  return imageId;
}
