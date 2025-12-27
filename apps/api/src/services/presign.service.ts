import { v4 as uuidv4 } from 'uuid';
import { createPresignedUploadUrl } from '../lib/s3.js';
import { NotFoundError, AppError } from '../middleware/error-handler.js';
import { HTTP_STATUS } from '@360-imaging/shared';
import type { PresignResponse } from '@360-imaging/shared';
import { sessionsRepository, eventsRepository } from '../db/index.js';
import { logger } from '../lib/logger.js';

interface CreatePresignedUrlParams {
  orgId: string;
  sessionId: string;
  fileName: string;
  contentType: 'image/jpeg' | 'image/heic';
  contentSha256: string;
  deviceId?: string;
}

export async function createPresignedUrl(params: CreatePresignedUrlParams): Promise<PresignResponse> {
  const { orgId, sessionId, fileName, contentType, contentSha256, deviceId } = params;

  // Verify session exists and belongs to org
  const session = await sessionsRepository.findById(sessionId, { orgId });

  if (!session) {
    throw new NotFoundError('Session');
  }

  if (session.status !== 'active') {
    throw new AppError(HTTP_STATUS.BAD_REQUEST, 'SESSION_NOT_ACTIVE', 'Session is not active');
  }

  // Generate unique filename with extension
  const ext = contentType === 'image/heic' ? 'heic' : 'jpg';
  const uniqueFilename = `${uuidv4()}.${ext}`;

  const result = await createPresignedUploadUrl({
    orgId,
    siteId: session.siteId,
    sessionId,
    filename: uniqueFilename,
    contentType,
    contentSha256,
  });

  // Log upload initiation event
  await eventsRepository.create({
    orgId,
    entityType: 'session',
    entityId: sessionId,
    type: 'upload_started',
    actorId: deviceId,
    actorType: deviceId ? 'device' : 'system',
    meta: {
      fileName,
      contentType,
      storageKey: result.storageKey,
    },
  });

  logger.debug({ sessionId, storageKey: result.storageKey }, 'Presigned URL generated');

  return {
    uploadUrl: result.uploadUrl,
    storageKey: result.storageKey,
    headers: result.headers,
    expiresAt: result.expiresAt,
  };
}
