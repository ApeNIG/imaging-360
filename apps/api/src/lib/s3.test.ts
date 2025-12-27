import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRESIGN_EXPIRY_SECONDS, STORAGE_PATHS } from '@360-imaging/shared';

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({})),
  PutObjectCommand: vi.fn().mockImplementation((params) => ({ input: params })),
  GetObjectCommand: vi.fn().mockImplementation((params) => ({ input: params })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

import { createPresignedUploadUrl, createPresignedDownloadUrl } from './s3.js';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

describe('S3 Library', () => {
  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const siteId = '660e8400-e29b-41d4-a716-446655440001';
  const sessionId = '770e8400-e29b-41d4-a716-446655440002';
  const filename = 'photo.jpg';
  const contentType = 'image/jpeg';
  const contentSha256 = 'abc123def456hash';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPresignedUploadUrl', () => {
    it('should generate presigned upload URL', async () => {
      const result = await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId,
        filename,
        contentType,
        contentSha256,
      });

      expect(result.uploadUrl).toBe('https://s3.example.com/presigned-url');
      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('should generate correct storage key', async () => {
      const result = await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId,
        filename,
        contentType,
        contentSha256,
      });

      const expectedKey = STORAGE_PATHS.original(orgId, siteId, sessionId, filename);
      expect(result.storageKey).toBe(expectedKey);
    });

    it('should create PutObjectCommand with correct params', async () => {
      await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId,
        filename,
        contentType,
        contentSha256,
      });

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: expect.any(String),
        Key: expect.stringContaining(`org/${orgId}/site/${siteId}/session/${sessionId}`),
        ContentType: contentType,
        ChecksumSHA256: contentSha256,
        Metadata: {
          'org-id': orgId,
          'site-id': siteId,
          'session-id': sessionId,
        },
      });
    });

    it('should return headers with content type and checksum', async () => {
      const result = await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId,
        filename,
        contentType,
        contentSha256,
      });

      expect(result.headers).toEqual({
        'Content-Type': contentType,
        'x-amz-checksum-sha256': contentSha256,
      });
    });

    it('should set expiration time correctly', async () => {
      const beforeCall = Date.now();
      const result = await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId,
        filename,
        contentType,
        contentSha256,
      });
      const afterCall = Date.now();

      const expectedMin = beforeCall + PRESIGN_EXPIRY_SECONDS * 1000;
      const expectedMax = afterCall + PRESIGN_EXPIRY_SECONDS * 1000;

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('should use correct expiry for getSignedUrl', async () => {
      await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId,
        filename,
        contentType,
        contentSha256,
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: PRESIGN_EXPIRY_SECONDS }
      );
    });

    it('should handle HEIC content type', async () => {
      await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId,
        filename: 'photo.heic',
        contentType: 'image/heic',
        contentSha256,
      });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'image/heic',
        })
      );
    });

    it('should include filename in storage key', async () => {
      const customFilename = 'custom-uuid-1234.jpg';
      const result = await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId,
        filename: customFilename,
        contentType,
        contentSha256,
      });

      expect(result.storageKey).toContain(customFilename);
    });
  });

  describe('createPresignedDownloadUrl', () => {
    it('should generate presigned download URL', async () => {
      const storageKey = 'org/123/site/456/session/789/photo.jpg';
      const result = await createPresignedDownloadUrl(storageKey);

      expect(result).toBe('https://s3.example.com/presigned-url');
    });

    it('should create GetObjectCommand with correct params', async () => {
      const storageKey = 'org/123/site/456/session/789/photo.jpg';
      await createPresignedDownloadUrl(storageKey);

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: expect.any(String),
        Key: storageKey,
      });
    });

    it('should use default expiry of 1 hour', async () => {
      const storageKey = 'org/123/site/456/session/789/photo.jpg';
      await createPresignedDownloadUrl(storageKey);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 }
      );
    });

    it('should accept custom expiry', async () => {
      const storageKey = 'org/123/site/456/session/789/photo.jpg';
      const customExpiry = 7200; // 2 hours
      await createPresignedDownloadUrl(storageKey, customExpiry);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: customExpiry }
      );
    });

    it('should handle thumbnail paths', async () => {
      const thumbKey = 'org/123/site/456/session/789/thumbs/photo_150.jpg';
      await createPresignedDownloadUrl(thumbKey);

      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: thumbKey,
        })
      );
    });
  });

  describe('Storage path generation', () => {
    it('should generate consistent storage paths', async () => {
      const result1 = await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId,
        filename,
        contentType,
        contentSha256,
      });

      const result2 = await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId,
        filename,
        contentType,
        contentSha256,
      });

      expect(result1.storageKey).toBe(result2.storageKey);
    });

    it('should generate different paths for different sessions', async () => {
      const result1 = await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId: 'session-1',
        filename,
        contentType,
        contentSha256,
      });

      const result2 = await createPresignedUploadUrl({
        orgId,
        siteId,
        sessionId: 'session-2',
        filename,
        contentType,
        contentSha256,
      });

      expect(result1.storageKey).not.toBe(result2.storageKey);
    });

    it('should generate different paths for different orgs', async () => {
      const result1 = await createPresignedUploadUrl({
        orgId: 'org-1',
        siteId,
        sessionId,
        filename,
        contentType,
        contentSha256,
      });

      const result2 = await createPresignedUploadUrl({
        orgId: 'org-2',
        siteId,
        sessionId,
        filename,
        contentType,
        contentSha256,
      });

      expect(result1.storageKey).not.toBe(result2.storageKey);
    });
  });
});
