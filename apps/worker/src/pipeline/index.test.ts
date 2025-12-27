import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processImage } from './index.js';
import type { S3EventRecord } from '@360-imaging/shared';

// Mock all dependencies
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../lib/s3.js', () => ({
  parseS3Key: vi.fn(),
  downloadImage: vi.fn(),
}));

vi.mock('./thumbnails.js', () => ({
  generateThumbnails: vi.fn(),
}));

vi.mock('./qc.js', () => ({
  runQualityChecks: vi.fn(),
}));

vi.mock('./dedup.js', () => ({
  checkDuplicate: vi.fn(),
}));

vi.mock('./save.js', () => ({
  saveImageRecord: vi.fn(),
}));

import { parseS3Key, downloadImage } from '../lib/s3.js';
import { generateThumbnails } from './thumbnails.js';
import { runQualityChecks } from './qc.js';
import { checkDuplicate } from './dedup.js';
import { saveImageRecord } from './save.js';

describe('Pipeline Orchestrator', () => {
  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const siteId = '660e8400-e29b-41d4-a716-446655440001';
  const sessionId = '770e8400-e29b-41d4-a716-446655440002';
  const imageId = 'image-123';

  const mockRecord: S3EventRecord = {
    bucket: 'test-bucket',
    key: `org/${orgId}/site/${siteId}/session/${sessionId}/photo.jpg`,
    size: 1024000,
    etag: 'abc123',
  };

  const mockThumbnailResult = {
    thumbKeys: { '150': 'thumb_150.jpg', '600': 'thumb_600.jpg' },
    hash: 'sha256hash',
    width: 4000,
    height: 3000,
    exif: undefined,
  };

  const mockQcResult = {
    sharpness: { score: 85, status: 'pass' as const },
    exposure: { status: 'pass' as const, clippedHighlights: 0.01, clippedShadows: 0.02 },
  };

  const mockDedupResult = {};

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(parseS3Key).mockReturnValue({
      orgId,
      siteId,
      sessionId,
      filename: 'photo.jpg',
    });
    vi.mocked(downloadImage).mockResolvedValue(Buffer.from('image-data'));
    vi.mocked(generateThumbnails).mockResolvedValue(mockThumbnailResult);
    vi.mocked(runQualityChecks).mockResolvedValue(mockQcResult);
    vi.mocked(checkDuplicate).mockResolvedValue(mockDedupResult);
    vi.mocked(saveImageRecord).mockResolvedValue(imageId);
  });

  describe('processImage', () => {
    it('should process image successfully through all stages', async () => {
      const result = await processImage(mockRecord);

      expect(result.status).toBe('success');
      expect(result.imageId).toBe(imageId);
      expect(result.thumbnails).toEqual(mockThumbnailResult.thumbKeys);
      expect(result.qc).toEqual(mockQcResult);
    });

    it('should parse S3 key to extract metadata', async () => {
      await processImage(mockRecord);

      expect(parseS3Key).toHaveBeenCalledWith(mockRecord.key);
    });

    it('should download image from S3', async () => {
      await processImage(mockRecord);

      expect(downloadImage).toHaveBeenCalledWith(mockRecord.key);
    });

    it('should run thumbnail, QC, and dedup in parallel', async () => {
      const imageBuffer = Buffer.from('test-image');
      vi.mocked(downloadImage).mockResolvedValue(imageBuffer);

      await processImage(mockRecord);

      expect(generateThumbnails).toHaveBeenCalledWith(mockRecord.key, imageBuffer);
      expect(runQualityChecks).toHaveBeenCalledWith(imageBuffer);
      expect(checkDuplicate).toHaveBeenCalledWith(imageBuffer, orgId);
    });

    it('should save image with processed status when QC passes', async () => {
      await processImage(mockRecord);

      expect(saveImageRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'processed',
          orgId,
          siteId,
          sessionId,
        })
      );
    });

    it('should save image with failed status when sharpness fails', async () => {
      vi.mocked(runQualityChecks).mockResolvedValue({
        sharpness: { score: 10, status: 'fail' },
        exposure: { status: 'pass' },
      });

      await processImage(mockRecord);

      expect(saveImageRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
        })
      );
    });

    it('should save image with failed status when exposure fails', async () => {
      vi.mocked(runQualityChecks).mockResolvedValue({
        sharpness: { score: 85, status: 'pass' },
        exposure: { status: 'fail', clippedHighlights: 0.3, clippedShadows: 0.01 },
      });

      await processImage(mockRecord);

      expect(saveImageRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
        })
      );
    });

    it('should allow warn status to pass QC', async () => {
      vi.mocked(runQualityChecks).mockResolvedValue({
        sharpness: { score: 50, status: 'warn' },
        exposure: { status: 'warn', clippedHighlights: 0.08, clippedShadows: 0.01 },
      });

      await processImage(mockRecord);

      expect(saveImageRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'processed',
        })
      );
    });

    it('should include duplicate info in QC data', async () => {
      vi.mocked(checkDuplicate).mockResolvedValue({
        duplicateOf: 'existing-image-id',
      });

      await processImage(mockRecord);

      expect(saveImageRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          qc: expect.objectContaining({
            duplicateOf: 'existing-image-id',
          }),
        })
      );
    });

    it('should return failed result on error', async () => {
      vi.mocked(downloadImage).mockRejectedValue(new Error('S3 download failed'));

      const result = await processImage(mockRecord);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('S3 download failed');
      expect(result.imageId).toBeUndefined();
    });

    it('should handle parse error gracefully', async () => {
      vi.mocked(parseS3Key).mockImplementation(() => {
        throw new Error('Invalid S3 key format');
      });

      const result = await processImage(mockRecord);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid S3 key format');
    });

    it('should handle save error gracefully', async () => {
      vi.mocked(saveImageRecord).mockRejectedValue(new Error('Database error'));

      const result = await processImage(mockRecord);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Database error');
    });

    it('should pass thumbnail hash and dimensions to save', async () => {
      await processImage(mockRecord);

      expect(saveImageRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          hashSha256: mockThumbnailResult.hash,
          width: mockThumbnailResult.width,
          height: mockThumbnailResult.height,
          thumbKeys: mockThumbnailResult.thumbKeys,
        })
      );
    });

    it('should pass phash from dedup result', async () => {
      vi.mocked(checkDuplicate).mockResolvedValue({
        phash: 'perceptual-hash-123',
      });

      await processImage(mockRecord);

      expect(saveImageRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          phash: 'perceptual-hash-123',
        })
      );
    });
  });
});
