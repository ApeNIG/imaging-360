import { NotFoundError, AppError } from '../middleware/error-handler.js';
import { HTTP_STATUS } from '@360-imaging/shared';
import type { Image, ImageStatus, PublishResponse } from '@360-imaging/shared';
import { imagesRepository, sessionsRepository, eventsRepository, ImageEntity } from '../db/index.js';
import { logger } from '../lib/logger.js';

interface ListImagesParams {
  orgId: string;
  sessionId: string;
  status?: ImageStatus;
}

interface GetImageParams {
  imageId: string;
  orgId: string;
}

interface PublishImageParams {
  imageId: string;
  orgId: string;
  userId?: string;
}

export async function listImages(params: ListImagesParams): Promise<{
  data: ImageEntity[];
  total: number;
  statusCounts: Record<ImageStatus, number>;
}> {
  const { orgId, sessionId, status } = params;

  // Verify session exists
  const session = await sessionsRepository.findById(sessionId, { orgId });
  if (!session) {
    throw new NotFoundError('Session');
  }

  const images = await imagesRepository.findFiltered(
    { orgId },
    { sessionId, status }
  );

  const statusCounts = await imagesRepository.countByStatusForSession(sessionId, { orgId });

  return {
    data: images,
    total: images.length,
    statusCounts,
  };
}

export async function getImage(params: GetImageParams): Promise<Image> {
  const { imageId, orgId } = params;

  const image = await imagesRepository.findById(imageId, { orgId });

  if (!image) {
    throw new NotFoundError('Image');
  }

  return image;
}

export async function publishImage(params: PublishImageParams): Promise<PublishResponse> {
  const { imageId, orgId, userId } = params;

  // Get image first to check status
  const image = await imagesRepository.findById(imageId, { orgId });

  if (!image) {
    throw new NotFoundError('Image');
  }

  if (image.status !== 'processed') {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      'INVALID_STATUS',
      `Cannot publish image with status '${image.status}'. Must be 'processed'.`
    );
  }

  const published = await imagesRepository.publish(imageId, { orgId });

  if (!published) {
    throw new NotFoundError('Image');
  }

  // Log publish event
  await eventsRepository.create({
    orgId,
    entityType: 'image',
    entityId: imageId,
    type: 'published',
    actorId: userId,
    actorType: userId ? 'user' : 'system',
  });

  logger.info({ imageId, userId }, 'Image published');

  return {
    id: published.id,
    status: 'published',
    publishedAt: published.publishedAt!,
  };
}

export async function bulkPublish(
  imageIds: string[],
  orgId: string,
  userId?: string
): Promise<{ published: number; failed: string[] }> {
  const failed: string[] = [];
  let published = 0;

  // Validate all images first
  for (const id of imageIds) {
    const image = await imagesRepository.findById(id, { orgId });
    if (!image || image.status !== 'processed') {
      failed.push(id);
    }
  }

  const validIds = imageIds.filter((id) => !failed.includes(id));

  if (validIds.length > 0) {
    published = await imagesRepository.bulkPublish(validIds, { orgId });

    // Log bulk publish event
    await eventsRepository.create({
      orgId,
      entityType: 'session',
      entityId: validIds[0], // Use first image's session
      type: 'published',
      actorId: userId,
      actorType: userId ? 'user' : 'system',
      meta: { count: published, imageIds: validIds },
    });
  }

  logger.info({ published, failed: failed.length, userId }, 'Bulk publish completed');

  return { published, failed };
}

export async function getImagesBySession(
  sessionId: string,
  orgId: string
): Promise<Image[]> {
  return imagesRepository.findBySession(sessionId, { orgId });
}
