import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkDuplicate } from './dedup.js';

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

describe('Dedup Pipeline', () => {
  const orgId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkDuplicate', () => {
    it('should return empty result when no duplicate found', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });

      const imageBuffer = Buffer.from('unique-image-content');
      const result = await checkDuplicate(imageBuffer, orgId);

      expect(result).toEqual({});
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM images'),
        expect.arrayContaining([orgId])
      );
    });

    it('should return duplicateOf when exact duplicate found', async () => {
      const existingImageId = 'existing-image-id-123';
      vi.mocked(query).mockResolvedValue({
        rows: [{ id: existingImageId }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const imageBuffer = Buffer.from('duplicate-image-content');
      const result = await checkDuplicate(imageBuffer, orgId);

      expect(result).toEqual({
        duplicateOf: existingImageId,
      });
    });

    it('should compute SHA-256 hash correctly', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });

      const imageBuffer = Buffer.from('test-content');
      await checkDuplicate(imageBuffer, orgId);

      // Verify query was called with correct hash
      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          orgId,
          expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 produces 64 hex chars
        ])
      );
    });

    it('should scope duplicate check to org', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });

      const differentOrgId = 'different-org-id';
      await checkDuplicate(Buffer.from('content'), differentOrgId);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('org_id = $1'),
        expect.arrayContaining([differentOrgId])
      );
    });

    it('should handle database errors', async () => {
      vi.mocked(query).mockRejectedValue(new Error('Database connection failed'));

      await expect(checkDuplicate(Buffer.from('content'), orgId)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should use LIMIT 1 for efficiency', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });

      await checkDuplicate(Buffer.from('content'), orgId);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 1'),
        expect.any(Array)
      );
    });
  });
});
