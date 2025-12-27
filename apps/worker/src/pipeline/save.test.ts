import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveImageRecord } from './save.js';

// Mock dependencies
vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { query } from '../lib/db.js';

describe('Save Pipeline', () => {
  const baseParams = {
    orgId: '550e8400-e29b-41d4-a716-446655440000',
    siteId: '660e8400-e29b-41d4-a716-446655440001',
    sessionId: '770e8400-e29b-41d4-a716-446655440002',
    storageKey: 'org/org-id/site/site-id/session/sess-id/photo.jpg',
    hashSha256: 'abc123def456',
    width: 4000,
    height: 3000,
    thumbKeys: { '150': 'thumb_150.jpg', '600': 'thumb_600.jpg' },
    qc: {
      sharpness: { score: 85, status: 'pass' as const },
      exposure: { status: 'pass' as const },
    },
    qcVersion: 1,
    status: 'processed' as const,
  };

  const vehicleId = 'vehicle-123';
  const imageId = 'image-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveImageRecord', () => {
    it('should save image record successfully', async () => {
      // Mock session lookup
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ vehicle_id: vehicleId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        // Mock image insert
        .mockResolvedValueOnce({
          rows: [{ id: imageId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        // Mock event insert
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      const result = await saveImageRecord(baseParams);

      expect(result).toBe(imageId);
      expect(query).toHaveBeenCalledTimes(3);
    });

    it('should throw error when session not found', async () => {
      vi.mocked(query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      await expect(saveImageRecord(baseParams)).rejects.toThrow('Session not found');
    });

    it('should extract angle from filename with deg suffix', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ vehicle_id: vehicleId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: imageId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      const paramsWithAngle = {
        ...baseParams,
        storageKey: 'org/org-id/site/site-id/session/sess-id/45deg.jpg',
      };

      await saveImageRecord(paramsWithAngle);

      // Verify angle was extracted (second query should contain 45)
      const insertCall = vi.mocked(query).mock.calls[1];
      expect(insertCall[1]).toContain(45);
    });

    it('should extract shot name from filename', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ vehicle_id: vehicleId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: imageId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      // Note: regex only matches [a-z_]+ so no digits allowed in shot names
      const paramsWithShot = {
        ...baseParams,
        storageKey: 'org/org-id/site/site-id/session/sess-id/front_quarter.jpg',
      };

      await saveImageRecord(paramsWithShot);

      // Verify shot name was extracted
      const insertCall = vi.mocked(query).mock.calls[1];
      expect(insertCall[1]).toContain('front_quarter');
    });

    it('should log processing_complete event for processed status', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ vehicle_id: vehicleId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: imageId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      await saveImageRecord(baseParams);

      // Verify event insert
      const eventCall = vi.mocked(query).mock.calls[2];
      expect(eventCall[0]).toContain('INSERT INTO events');
      expect(eventCall[1]).toContain('processing_complete');
    });

    it('should log processing_failed event for failed status', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ vehicle_id: vehicleId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: imageId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      const failedParams = {
        ...baseParams,
        status: 'failed' as const,
        qc: {
          sharpness: { score: 10, status: 'fail' as const },
          exposure: { status: 'pass' as const },
        },
      };

      await saveImageRecord(failedParams);

      const eventCall = vi.mocked(query).mock.calls[2];
      expect(eventCall[1]).toContain('processing_failed');
    });

    it('should handle EXIF data', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ vehicle_id: vehicleId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: imageId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      const paramsWithExif = {
        ...baseParams,
        exif: {
          cameraMake: 'Apple',
          cameraModel: 'iPhone 15 Pro',
        },
      };

      await saveImageRecord(paramsWithExif);

      const insertCall = vi.mocked(query).mock.calls[1];
      // EXIF should be JSON stringified
      expect(insertCall[1]).toContainEqual(expect.stringContaining('Apple'));
    });

    it('should use ON CONFLICT for idempotent upsert', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ vehicle_id: vehicleId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: imageId }],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: '',
          oid: 0,
          fields: [],
        });

      await saveImageRecord(baseParams);

      const insertCall = vi.mocked(query).mock.calls[1];
      expect(insertCall[0]).toContain('ON CONFLICT');
      expect(insertCall[0]).toContain('DO UPDATE SET');
    });
  });
});
