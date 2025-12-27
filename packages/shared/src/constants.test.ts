import { describe, it, expect } from 'vitest';
import {
  API_VERSION,
  HTTP_STATUS,
  JWT_EXPIRY,
  PRESIGN_EXPIRY_SECONDS,
  RATE_LIMITS,
  ALLOWED_CONTENT_TYPES,
  THUMBNAIL_SIZES,
  STORAGE_PATHS,
  QC_THRESHOLDS,
  QC_VERSION,
  DEFAULT_SHOT_LIST,
  SESSION_TIMEOUT_HOURS,
  PORTAL_POLL_INTERVAL_MS,
  UPLOAD_RETRY,
  BURST_CAPTURE,
} from './constants.js';

describe('Constants', () => {
  describe('API_VERSION', () => {
    it('should be v1', () => {
      expect(API_VERSION).toBe('v1');
    });
  });

  describe('HTTP_STATUS', () => {
    it('should have correct success codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.NO_CONTENT).toBe(204);
    });

    it('should have correct client error codes', () => {
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.CONFLICT).toBe(409);
      expect(HTTP_STATUS.UNPROCESSABLE_ENTITY).toBe(422);
      expect(HTTP_STATUS.TOO_MANY_REQUESTS).toBe(429);
    });

    it('should have correct server error codes', () => {
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
      expect(HTTP_STATUS.NOT_IMPLEMENTED).toBe(501);
    });
  });

  describe('JWT_EXPIRY', () => {
    it('should have device expiry of 30 days in seconds', () => {
      expect(JWT_EXPIRY.DEVICE).toBe(30 * 24 * 60 * 60);
    });

    it('should have user expiry of 8 hours in seconds', () => {
      expect(JWT_EXPIRY.USER).toBe(8 * 60 * 60);
    });
  });

  describe('PRESIGN_EXPIRY_SECONDS', () => {
    it('should be 15 minutes in seconds', () => {
      expect(PRESIGN_EXPIRY_SECONDS).toBe(15 * 60);
    });
  });

  describe('RATE_LIMITS', () => {
    it('should have limits defined', () => {
      expect(RATE_LIMITS.AUTH_DEVICE).toBe(100);
      expect(RATE_LIMITS.PRESIGN).toBe(500);
      expect(RATE_LIMITS.EVENTS).toBe(1000);
      expect(RATE_LIMITS.DEFAULT).toBe(300);
    });
  });

  describe('ALLOWED_CONTENT_TYPES', () => {
    it('should allow jpeg and heic', () => {
      expect(ALLOWED_CONTENT_TYPES).toContain('image/jpeg');
      expect(ALLOWED_CONTENT_TYPES).toContain('image/heic');
    });

    it('should have exactly 2 types', () => {
      expect(ALLOWED_CONTENT_TYPES).toHaveLength(2);
    });
  });

  describe('THUMBNAIL_SIZES', () => {
    it('should have 3 sizes', () => {
      expect(THUMBNAIL_SIZES).toHaveLength(3);
    });

    it('should contain expected sizes', () => {
      expect(THUMBNAIL_SIZES).toContain(150);
      expect(THUMBNAIL_SIZES).toContain(600);
      expect(THUMBNAIL_SIZES).toContain(1200);
    });

    it('should be in ascending order', () => {
      const sorted = [...THUMBNAIL_SIZES].sort((a, b) => a - b);
      expect(THUMBNAIL_SIZES).toEqual(sorted);
    });
  });

  describe('STORAGE_PATHS', () => {
    const orgId = 'org-123';
    const siteId = 'site-456';
    const sessionId = 'sess-789';
    const filename = 'photo.jpg';

    describe('original', () => {
      it('should generate correct path for original images', () => {
        const path = STORAGE_PATHS.original(orgId, siteId, sessionId, filename);
        expect(path).toBe('org/org-123/site/site-456/session/sess-789/photo.jpg');
      });

      it('should handle different filenames', () => {
        const path = STORAGE_PATHS.original(orgId, siteId, sessionId, '45deg.heic');
        expect(path).toBe('org/org-123/site/site-456/session/sess-789/45deg.heic');
      });
    });

    describe('thumbnail', () => {
      it('should generate correct path for thumbnails', () => {
        const path = STORAGE_PATHS.thumbnail(orgId, siteId, sessionId, filename, 150);
        expect(path).toBe('org/org-123/site/site-456/session/sess-789/thumbs/photo.jpg_150.jpg');
      });

      it('should work with all thumbnail sizes', () => {
        for (const size of THUMBNAIL_SIZES) {
          const path = STORAGE_PATHS.thumbnail(orgId, siteId, sessionId, filename, size);
          expect(path).toContain(`thumbs/${filename}_${size}.jpg`);
        }
      });
    });
  });

  describe('QC_THRESHOLDS', () => {
    it('should have sharpness thresholds', () => {
      expect(QC_THRESHOLDS.SHARPNESS.FAIL).toBe(100);
      expect(QC_THRESHOLDS.SHARPNESS.WARN).toBe(300);
      expect(QC_THRESHOLDS.SHARPNESS.WARN).toBeGreaterThan(QC_THRESHOLDS.SHARPNESS.FAIL);
    });

    it('should have exposure clipping threshold', () => {
      expect(QC_THRESHOLDS.EXPOSURE.CLIPPING_THRESHOLD).toBe(0.05);
    });
  });

  describe('QC_VERSION', () => {
    it('should be 1', () => {
      expect(QC_VERSION).toBe(1);
    });
  });

  describe('DEFAULT_SHOT_LIST', () => {
    it('should have studio360 config', () => {
      expect(DEFAULT_SHOT_LIST.studio360.frameCount).toBe(24);
      expect(DEFAULT_SHOT_LIST.studio360.angleStep).toBe(15);
    });

    it('should have stills list with required and optional shots', () => {
      expect(DEFAULT_SHOT_LIST.stills.length).toBeGreaterThan(0);

      const requiredShots = DEFAULT_SHOT_LIST.stills.filter(s => s.required);
      const optionalShots = DEFAULT_SHOT_LIST.stills.filter(s => !s.required);

      expect(requiredShots.length).toBeGreaterThan(0);
      expect(optionalShots.length).toBeGreaterThan(0);
    });

    it('should have expected required shots', () => {
      const requiredNames = DEFAULT_SHOT_LIST.stills
        .filter(s => s.required)
        .map(s => s.name);

      expect(requiredNames).toContain('front_3q');
      expect(requiredNames).toContain('rear_3q');
      expect(requiredNames).toContain('driver_side');
      expect(requiredNames).toContain('interior_front');
    });
  });

  describe('SESSION_TIMEOUT_HOURS', () => {
    it('should be 24 hours', () => {
      expect(SESSION_TIMEOUT_HOURS).toBe(24);
    });
  });

  describe('PORTAL_POLL_INTERVAL_MS', () => {
    it('should be 3 seconds', () => {
      expect(PORTAL_POLL_INTERVAL_MS).toBe(3000);
    });
  });

  describe('UPLOAD_RETRY', () => {
    it('should have exponential backoff config', () => {
      expect(UPLOAD_RETRY.MAX_ATTEMPTS).toBe(5);
      expect(UPLOAD_RETRY.INITIAL_DELAY_MS).toBe(1000);
      expect(UPLOAD_RETRY.MAX_DELAY_MS).toBe(30000);
      expect(UPLOAD_RETRY.BACKOFF_MULTIPLIER).toBe(2);
    });

    it('should have reasonable max delay', () => {
      // After 5 retries with multiplier 2: 1000 * 2^4 = 16000ms
      // Max should cap it
      expect(UPLOAD_RETRY.MAX_DELAY_MS).toBeGreaterThan(UPLOAD_RETRY.INITIAL_DELAY_MS);
    });
  });

  describe('BURST_CAPTURE', () => {
    it('should have burst config', () => {
      expect(BURST_CAPTURE.FRAME_COUNT).toBe(5);
      expect(BURST_CAPTURE.INTERVAL_MS).toBe(100);
    });

    it('should have reasonable interval for burst capture', () => {
      // Total burst time should be less than 1 second
      const totalBurstTime = BURST_CAPTURE.FRAME_COUNT * BURST_CAPTURE.INTERVAL_MS;
      expect(totalBurstTime).toBeLessThan(1000);
    });
  });
});
