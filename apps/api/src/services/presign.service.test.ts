import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPresignedUrl } from './presign.service.js';
import { NotFoundError, AppError } from '../middleware/error-handler.js';
import { HTTP_STATUS } from '@360-imaging/shared';

// Mock uuid to return predictable values
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

// Mock dependencies
vi.mock('../db/index.js', () => ({
  sessionsRepository: {
    findById: vi.fn(),
  },
  eventsRepository: {
    create: vi.fn(),
  },
}));

vi.mock('../lib/s3.js', () => ({
  createPresignedUploadUrl: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { sessionsRepository, eventsRepository } from '../db/index.js';
import { createPresignedUploadUrl } from '../lib/s3.js';

describe('Presign Service', () => {
  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const siteId = '660e8400-e29b-41d4-a716-446655440001';
  const sessionId = '770e8400-e29b-41d4-a716-446655440002';
  const deviceId = 'device-123';

  const mockActiveSession = {
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

  const mockPresignResult = {
    uploadUrl: 'https://s3.example.com/presigned-url',
    storageKey: `org/${orgId}/site/${siteId}/session/${sessionId}/mock-uuid-1234.jpg`,
    headers: {
      'Content-Type': 'image/jpeg',
      'x-amz-checksum-sha256': 'abc123hash',
    },
    expiresAt: new Date(Date.now() + 900000),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPresignedUrl', () => {
    it('should create presigned URL for jpeg upload', async () => {
      vi.mocked(sessionsRepository.findById).mockResolvedValue(mockActiveSession);
      vi.mocked(createPresignedUploadUrl).mockResolvedValue(mockPresignResult);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      const result = await createPresignedUrl({
        orgId,
        sessionId,
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        contentSha256: 'abc123hash',
        deviceId,
      });

      expect(sessionsRepository.findById).toHaveBeenCalledWith(sessionId, { orgId });
      expect(createPresignedUploadUrl).toHaveBeenCalledWith({
        orgId,
        siteId,
        sessionId,
        filename: 'mock-uuid-1234.jpg',
        contentType: 'image/jpeg',
        contentSha256: 'abc123hash',
      });

      expect(result).toEqual({
        uploadUrl: mockPresignResult.uploadUrl,
        storageKey: mockPresignResult.storageKey,
        headers: mockPresignResult.headers,
        expiresAt: mockPresignResult.expiresAt,
      });
    });

    it('should create presigned URL for heic upload', async () => {
      vi.mocked(sessionsRepository.findById).mockResolvedValue(mockActiveSession);
      vi.mocked(createPresignedUploadUrl).mockResolvedValue({
        ...mockPresignResult,
        storageKey: `org/${orgId}/site/${siteId}/session/${sessionId}/mock-uuid-1234.heic`,
      });
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      await createPresignedUrl({
        orgId,
        sessionId,
        fileName: 'photo.heic',
        contentType: 'image/heic',
        contentSha256: 'abc123hash',
      });

      expect(createPresignedUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'mock-uuid-1234.heic',
          contentType: 'image/heic',
        })
      );
    });

    it('should log upload_started event with device actor', async () => {
      vi.mocked(sessionsRepository.findById).mockResolvedValue(mockActiveSession);
      vi.mocked(createPresignedUploadUrl).mockResolvedValue(mockPresignResult);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      await createPresignedUrl({
        orgId,
        sessionId,
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        contentSha256: 'abc123hash',
        deviceId,
      });

      expect(eventsRepository.create).toHaveBeenCalledWith({
        orgId,
        entityType: 'session',
        entityId: sessionId,
        type: 'upload_started',
        actorId: deviceId,
        actorType: 'device',
        meta: {
          fileName: 'photo.jpg',
          contentType: 'image/jpeg',
          storageKey: mockPresignResult.storageKey,
        },
      });
    });

    it('should log upload_started event with system actor when no deviceId', async () => {
      vi.mocked(sessionsRepository.findById).mockResolvedValue(mockActiveSession);
      vi.mocked(createPresignedUploadUrl).mockResolvedValue(mockPresignResult);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      await createPresignedUrl({
        orgId,
        sessionId,
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        contentSha256: 'abc123hash',
      });

      expect(eventsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: undefined,
          actorType: 'system',
        })
      );
    });

    it('should throw NotFoundError when session does not exist', async () => {
      vi.mocked(sessionsRepository.findById).mockResolvedValue(null);

      await expect(
        createPresignedUrl({
          orgId,
          sessionId,
          fileName: 'photo.jpg',
          contentType: 'image/jpeg',
          contentSha256: 'abc123hash',
        })
      ).rejects.toThrow(NotFoundError);

      expect(createPresignedUploadUrl).not.toHaveBeenCalled();
      expect(eventsRepository.create).not.toHaveBeenCalled();
    });

    it('should throw AppError when session is not active', async () => {
      const completedSession = { ...mockActiveSession, status: 'complete' as const };
      vi.mocked(sessionsRepository.findById).mockResolvedValue(completedSession);

      await expect(
        createPresignedUrl({
          orgId,
          sessionId,
          fileName: 'photo.jpg',
          contentType: 'image/jpeg',
          contentSha256: 'abc123hash',
        })
      ).rejects.toThrow(AppError);

      await expect(
        createPresignedUrl({
          orgId,
          sessionId,
          fileName: 'photo.jpg',
          contentType: 'image/jpeg',
          contentSha256: 'abc123hash',
        })
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: 'SESSION_NOT_ACTIVE',
      });

      expect(createPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('should throw AppError for abandoned session', async () => {
      const abandonedSession = { ...mockActiveSession, status: 'abandoned' as const };
      vi.mocked(sessionsRepository.findById).mockResolvedValue(abandonedSession);

      await expect(
        createPresignedUrl({
          orgId,
          sessionId,
          fileName: 'photo.jpg',
          contentType: 'image/jpeg',
          contentSha256: 'abc123hash',
        })
      ).rejects.toMatchObject({
        code: 'SESSION_NOT_ACTIVE',
      });
    });

    it('should propagate S3 errors', async () => {
      vi.mocked(sessionsRepository.findById).mockResolvedValue(mockActiveSession);
      vi.mocked(createPresignedUploadUrl).mockRejectedValue(new Error('S3 error'));

      await expect(
        createPresignedUrl({
          orgId,
          sessionId,
          fileName: 'photo.jpg',
          contentType: 'image/jpeg',
          contentSha256: 'abc123hash',
        })
      ).rejects.toThrow('S3 error');
    });
  });
});
