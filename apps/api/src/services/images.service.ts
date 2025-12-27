import { query } from '../db/index.js';
import { NotFoundError } from '../middleware/error-handler.js';
import type { Image, PublishResponse } from '@360-imaging/shared';

interface ListImagesParams {
  orgId: string;
  sessionId: string;
  status?: string;
}

interface GetImageParams {
  imageId: string;
  orgId: string;
}

interface PublishImageParams {
  imageId: string;
  orgId: string;
}

export async function listImages(params: ListImagesParams) {
  const { orgId, sessionId, status } = params;

  let whereClause = 'WHERE org_id = $1 AND session_id = $2';
  const queryParams: unknown[] = [orgId, sessionId];

  if (status) {
    whereClause += ' AND status = $3';
    queryParams.push(status);
  }

  // Get session mode to determine sort order
  const sessionResult = await query<{ mode: string }>(
    'SELECT mode FROM sessions WHERE id = $1 AND org_id = $2',
    [sessionId, orgId]
  );

  if (sessionResult.rowCount === 0) {
    throw new NotFoundError('Session');
  }

  const isStudio360 = sessionResult.rows[0].mode === 'studio360';
  const orderBy = isStudio360 ? 'angle_deg ASC NULLS LAST' : 'created_at ASC';

  const result = await query<Image>(
    `SELECT * FROM images ${whereClause} ORDER BY ${orderBy}`,
    queryParams
  );

  return {
    data: result.rows.map(mapImageRow),
    total: result.rowCount,
  };
}

export async function getImage(params: GetImageParams) {
  const { imageId, orgId } = params;

  const result = await query<Image>(
    'SELECT * FROM images WHERE id = $1 AND org_id = $2',
    [imageId, orgId]
  );

  if (result.rowCount === 0) {
    throw new NotFoundError('Image');
  }

  return mapImageRow(result.rows[0]);
}

export async function publishImage(params: PublishImageParams): Promise<PublishResponse> {
  const { imageId, orgId } = params;

  const result = await query<{ id: string; published_at: Date }>(
    `UPDATE images
     SET status = 'published', published_at = now()
     WHERE id = $1 AND org_id = $2 AND status = 'processed'
     RETURNING id, published_at`,
    [imageId, orgId]
  );

  if (result.rowCount === 0) {
    // Check if image exists
    const exists = await query(
      'SELECT id, status FROM images WHERE id = $1 AND org_id = $2',
      [imageId, orgId]
    );

    if (exists.rowCount === 0) {
      throw new NotFoundError('Image');
    }

    // Image exists but is in wrong status
    throw new NotFoundError('Image (not in processed status)');
  }

  return {
    id: result.rows[0].id,
    status: 'published',
    publishedAt: result.rows[0].published_at,
  };
}

function mapImageRow(row: any): Image {
  return {
    id: row.id,
    orgId: row.org_id,
    siteId: row.site_id,
    sessionId: row.session_id,
    vehicleId: row.vehicle_id,
    angleDeg: row.angle_deg,
    shotName: row.shot_name,
    hashSha256: row.hash_sha256,
    phash: row.phash,
    width: row.width,
    height: row.height,
    exif: row.exif,
    storageKey: row.storage_key,
    thumbKeys: row.thumb_keys,
    qc: row.qc,
    qcVersion: row.qc_version,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}
