import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listImages,
  getImage,
  publishImage,
  bulkPublish,
  getImagesBySession,
} from './images.service.js';
import { NotFoundError, AppError } from '../middleware/error-handler.js';
import { HTTP_STATUS } from '@360-imaging/shared';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  imagesRepository: {
    findFiltered: vi.fn(),
    findById: vi.fn(),
    countByStatusForSession: vi.fn(),
    publish: vi.fn(),
    bulkPublish: vi.fn(),
    findBySession: vi.fn(),
  },
  sessionsRepository: {
    findById: vi.fn(),
  },
  eventsRepository: {
    create: vi.fn(),
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { imagesRepository, sessionsRepository, eventsRepository } from '../db/index.js';

describe('Images Service', () => {
  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const siteId = '660e8400-e29b-41d4-a716-446655440001';
  const sessionId = '770e8400-e29b-41d4-a716-446655440002';
  const imageId = '880e8400-e29b-41d4-a716-446655440003';
  const userId = 'user-123';

  const mockSession = {
    id: sessionId,
    orgId,
    siteId,
    vehicleId: 'vehicle-123',
    operatorId: 'operator-123',
    deviceId: 'device-123',
    status: 'active' as const,
    mode: 'studio360' as const,
    shotList: { studio360: { frameCount: 24, angleStep: 15 }, stills: [] },
    startedAt: new Date(),
    completedAt: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockImage = {
    id: imageId,
    orgId,
    siteId,
    sessionId,
    vehicleId: 'vehicle-123',
    storageKey: `org/${orgId}/site/${siteId}/session/${sessionId}/test.jpg`,
    hashSha256: 'abc123def456hash',
    status: 'processed' as const,
    qcVersion: 1,
    createdAt: new Date(),
    publishedAt: undefined as Date | undefined,
    updatedAt: new Date(),
  };

  const mockStatusCounts = {
    pending: 2,
    processing: 1,
    processed: 5,
    published: 3,
    failed: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listImages', () => {
    it('should list images for a session', async () => {
      const images = [mockImage, { ...mockImage, id: 'img-2' }];
      vi.mocked(sessionsRepository.findById).mockResolvedValue(mockSession);
      vi.mocked(imagesRepository.findFiltered).mockResolvedValue(images);
      vi.mocked(imagesRepository.countByStatusForSession).mockResolvedValue(mockStatusCounts);

      const result = await listImages({ orgId, sessionId });

      expect(sessionsRepository.findById).toHaveBeenCalledWith(sessionId, { orgId });
      expect(imagesRepository.findFiltered).toHaveBeenCalledWith(
        { orgId },
        { sessionId, status: undefined }
      );
      expect(result).toEqual({
        data: images,
        total: 2,
        statusCounts: mockStatusCounts,
      });
    });

    it('should filter by status', async () => {
      vi.mocked(sessionsRepository.findById).mockResolvedValue(mockSession);
      vi.mocked(imagesRepository.findFiltered).mockResolvedValue([mockImage]);
      vi.mocked(imagesRepository.countByStatusForSession).mockResolvedValue(mockStatusCounts);

      await listImages({ orgId, sessionId, status: 'processed' });

      expect(imagesRepository.findFiltered).toHaveBeenCalledWith(
        { orgId },
        { sessionId, status: 'processed' }
      );
    });

    it('should throw NotFoundError when session does not exist', async () => {
      vi.mocked(sessionsRepository.findById).mockResolvedValue(null);

      await expect(listImages({ orgId, sessionId })).rejects.toThrow(NotFoundError);
      expect(imagesRepository.findFiltered).not.toHaveBeenCalled();
    });
  });

  describe('getImage', () => {
    it('should return image when found', async () => {
      vi.mocked(imagesRepository.findById).mockResolvedValue(mockImage);

      const result = await getImage({ imageId, orgId });

      expect(imagesRepository.findById).toHaveBeenCalledWith(imageId, { orgId });
      expect(result).toEqual(mockImage);
    });

    it('should throw NotFoundError when image not found', async () => {
      vi.mocked(imagesRepository.findById).mockResolvedValue(null);

      await expect(getImage({ imageId, orgId })).rejects.toThrow(NotFoundError);
    });
  });

  describe('publishImage', () => {
    it('should publish processed image successfully', async () => {
      const publishedAt = new Date();
      const publishedImage = { ...mockImage, status: 'published' as const, publishedAt };

      vi.mocked(imagesRepository.findById).mockResolvedValue(mockImage);
      vi.mocked(imagesRepository.publish).mockResolvedValue(publishedImage);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      const result = await publishImage({ imageId, orgId, userId });

      expect(imagesRepository.findById).toHaveBeenCalledWith(imageId, { orgId });
      expect(imagesRepository.publish).toHaveBeenCalledWith(imageId, { orgId });
      expect(eventsRepository.create).toHaveBeenCalledWith({
        orgId,
        entityType: 'image',
        entityId: imageId,
        type: 'published',
        actorId: userId,
        actorType: 'user',
      });
      expect(result).toEqual({
        id: imageId,
        status: 'published',
        publishedAt,
      });
    });

    it('should use system actor when no userId provided', async () => {
      const publishedAt = new Date();
      const publishedImage = { ...mockImage, status: 'published' as const, publishedAt };

      vi.mocked(imagesRepository.findById).mockResolvedValue(mockImage);
      vi.mocked(imagesRepository.publish).mockResolvedValue(publishedImage);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      await publishImage({ imageId, orgId });

      expect(eventsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: undefined,
          actorType: 'system',
        })
      );
    });

    it('should throw NotFoundError when image not found', async () => {
      vi.mocked(imagesRepository.findById).mockResolvedValue(null);

      await expect(publishImage({ imageId, orgId })).rejects.toThrow(NotFoundError);
      expect(imagesRepository.publish).not.toHaveBeenCalled();
    });

    it('should throw AppError when image status is not processed', async () => {
      const pendingImage = { ...mockImage, status: 'pending' as const };
      vi.mocked(imagesRepository.findById).mockResolvedValue(pendingImage);

      await expect(publishImage({ imageId, orgId })).rejects.toThrow(AppError);
      await expect(publishImage({ imageId, orgId })).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: 'INVALID_STATUS',
      });

      expect(imagesRepository.publish).not.toHaveBeenCalled();
    });

    it('should throw AppError for already published image', async () => {
      const publishedImage = { ...mockImage, status: 'published' as const };
      vi.mocked(imagesRepository.findById).mockResolvedValue(publishedImage);

      await expect(publishImage({ imageId, orgId })).rejects.toMatchObject({
        code: 'INVALID_STATUS',
      });
    });

    it('should throw NotFoundError if publish returns null', async () => {
      vi.mocked(imagesRepository.findById).mockResolvedValue(mockImage);
      vi.mocked(imagesRepository.publish).mockResolvedValue(null);

      await expect(publishImage({ imageId, orgId })).rejects.toThrow(NotFoundError);
    });
  });

  describe('bulkPublish', () => {
    const imageIds = ['img-1', 'img-2', 'img-3'];

    it('should publish all valid images', async () => {
      const processedImages = imageIds.map((id) => ({ ...mockImage, id }));
      vi.mocked(imagesRepository.findById)
        .mockResolvedValueOnce(processedImages[0])
        .mockResolvedValueOnce(processedImages[1])
        .mockResolvedValueOnce(processedImages[2]);
      vi.mocked(imagesRepository.bulkPublish).mockResolvedValue(3);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      const result = await bulkPublish(imageIds, orgId, userId);

      expect(imagesRepository.bulkPublish).toHaveBeenCalledWith(imageIds, { orgId });
      expect(result).toEqual({ published: 3, failed: [] });
    });

    it('should skip images that are not processed', async () => {
      const pendingImage = { ...mockImage, id: 'img-2', status: 'pending' as const };
      vi.mocked(imagesRepository.findById)
        .mockResolvedValueOnce(mockImage)
        .mockResolvedValueOnce(pendingImage)
        .mockResolvedValueOnce({ ...mockImage, id: 'img-3' });
      vi.mocked(imagesRepository.bulkPublish).mockResolvedValue(2);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      const result = await bulkPublish(imageIds, orgId);

      expect(imagesRepository.bulkPublish).toHaveBeenCalledWith(['img-1', 'img-3'], { orgId });
      expect(result).toEqual({ published: 2, failed: ['img-2'] });
    });

    it('should skip images that do not exist', async () => {
      vi.mocked(imagesRepository.findById)
        .mockResolvedValueOnce(mockImage)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockImage, id: 'img-3' });
      vi.mocked(imagesRepository.bulkPublish).mockResolvedValue(2);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      const result = await bulkPublish(imageIds, orgId, userId);

      expect(result.failed).toContain('img-2');
      expect(result.published).toBe(2);
    });

    it('should not call bulkPublish if all images invalid', async () => {
      vi.mocked(imagesRepository.findById).mockResolvedValue(null);

      const result = await bulkPublish(imageIds, orgId);

      expect(imagesRepository.bulkPublish).not.toHaveBeenCalled();
      expect(result).toEqual({ published: 0, failed: imageIds });
    });

    it('should log event with metadata for bulk publish', async () => {
      vi.mocked(imagesRepository.findById).mockResolvedValue(mockImage);
      vi.mocked(imagesRepository.bulkPublish).mockResolvedValue(3);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      await bulkPublish(imageIds, orgId, userId);

      expect(eventsRepository.create).toHaveBeenCalledWith({
        orgId,
        entityType: 'session',
        entityId: imageIds[0],
        type: 'published',
        actorId: userId,
        actorType: 'user',
        meta: { count: 3, imageIds },
      });
    });
  });

  describe('getImagesBySession', () => {
    it('should return all images for session', async () => {
      const images = [
        mockImage,
        { ...mockImage, id: 'img-2' },
        { ...mockImage, id: 'img-3' },
      ];
      vi.mocked(imagesRepository.findBySession).mockResolvedValue(images);

      const result = await getImagesBySession(sessionId, orgId);

      expect(imagesRepository.findBySession).toHaveBeenCalledWith(sessionId, { orgId });
      expect(result).toEqual(images);
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no images', async () => {
      vi.mocked(imagesRepository.findBySession).mockResolvedValue([]);

      const result = await getImagesBySession(sessionId, orgId);

      expect(result).toEqual([]);
    });
  });
});
