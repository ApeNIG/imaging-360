import { describe, it, expect, vi } from 'vitest';

// Mock logger before importing s3 module
vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { parseS3Key } from './s3.js';

describe('S3 Utilities', () => {
  describe('parseS3Key', () => {
    it('should parse valid S3 key', () => {
      const key = 'org/org-123/site/site-456/session/sess-789/photo.jpg';
      const result = parseS3Key(key);

      expect(result).toEqual({
        orgId: 'org-123',
        siteId: 'site-456',
        sessionId: 'sess-789',
        filename: 'photo.jpg',
      });
    });

    it('should parse key with UUID-style IDs', () => {
      const key = 'org/550e8400-e29b-41d4-a716-446655440000/site/660e8400-e29b-41d4-a716-446655440001/session/770e8400-e29b-41d4-a716-446655440002/image.heic';
      const result = parseS3Key(key);

      expect(result).toEqual({
        orgId: '550e8400-e29b-41d4-a716-446655440000',
        siteId: '660e8400-e29b-41d4-a716-446655440001',
        sessionId: '770e8400-e29b-41d4-a716-446655440002',
        filename: 'image.heic',
      });
    });

    it('should parse key with angle in filename', () => {
      const key = 'org/org-123/site/site-456/session/sess-789/45deg.jpg';
      const result = parseS3Key(key);

      expect(result.filename).toBe('45deg.jpg');
    });

    it('should throw error for invalid key format - missing org prefix', () => {
      const key = 'invalid/org-123/site/site-456/session/sess-789/photo.jpg';

      expect(() => parseS3Key(key)).toThrow('Invalid S3 key format');
    });

    it('should throw error for invalid key format - missing site prefix', () => {
      const key = 'org/org-123/invalid/site-456/session/sess-789/photo.jpg';

      expect(() => parseS3Key(key)).toThrow('Invalid S3 key format');
    });

    it('should throw error for invalid key format - missing session prefix', () => {
      const key = 'org/org-123/site/site-456/invalid/sess-789/photo.jpg';

      expect(() => parseS3Key(key)).toThrow('Invalid S3 key format');
    });

    it('should throw error for too short key', () => {
      const key = 'org/org-123/site/site-456';

      expect(() => parseS3Key(key)).toThrow('Invalid S3 key format');
    });

    it('should handle filename with multiple dots', () => {
      const key = 'org/org-123/site/site-456/session/sess-789/photo.edited.final.jpg';
      const result = parseS3Key(key);

      expect(result.filename).toBe('photo.edited.final.jpg');
    });
  });
});
