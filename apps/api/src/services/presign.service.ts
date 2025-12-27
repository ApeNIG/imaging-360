import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/index.js';
import { createPresignedUploadUrl } from '../lib/s3.js';
import { NotFoundError, AppError } from '../middleware/error-handler.js';
import { HTTP_STATUS } from '@360-imaging/shared';
import type { PresignResponse } from '@360-imaging/shared';

interface CreatePresignedUrlParams {
  orgId: string;
  sessionId: string;
  fileName: string;
  contentType: 'image/jpeg' | 'image/heic';
  contentSha256: string;
}

export async function createPresignedUrl(params: CreatePresignedUrlParams): Promise<PresignResponse> {
  const { orgId, sessionId, fileName, contentType, contentSha256 } = params;

  // Verify session exists and belongs to org
  const sessionResult = await query<{ site_id: string; status: string }>(
    'SELECT site_id, status FROM sessions WHERE id = $1 AND org_id = $2',
    [sessionId, orgId]
  );

  if (sessionResult.rowCount === 0) {
    throw new NotFoundError('Session');
  }

  const session = sessionResult.rows[0];

  if (session.status !== 'active') {
    throw new AppError(HTTP_STATUS.BAD_REQUEST, 'SESSION_NOT_ACTIVE', 'Session is not active');
  }

  // Generate unique filename
  const ext = contentType === 'image/heic' ? 'heic' : 'jpg';
  const uniqueFilename = `${uuidv4()}.${ext}`;

  const result = await createPresignedUploadUrl({
    orgId,
    siteId: session.site_id,
    sessionId,
    filename: uniqueFilename,
    contentType,
    contentSha256,
  });

  return {
    uploadUrl: result.uploadUrl,
    storageKey: result.storageKey,
    headers: result.headers,
    expiresAt: result.expiresAt,
  };
}
