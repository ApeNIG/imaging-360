import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing
vi.mock('../index.js', () => ({
  query: vi.fn(),
  db: { connect: vi.fn() },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { ImagesRepository, imagesRepository } from './images.repository.js';
import { query } from '../index.js';

describe('ImagesRepository', () => {
  const orgId = 'org-123';
  const siteId = 'site-456';
  const sessionId = 'session-789';
  const vehicleId = 'vehicle-111';

  const mockImageRow = {
    id: 'img-1',
    org_id: orgId,
    site_id: siteId,
    session_id: sessionId,
    vehicle_id: vehicleId,
    angle_deg: 45,
    shot_name: 'front_quarter',
    hash_sha256: 'abc123hash',
    phash: 'phash123',
    width: 1920,
    height: 1080,
    exif: { cameraMake: 'iPhone' },
    storage_key: 'org/123/site/456/session/789/img.jpg',
    thumb_keys: { '150': 'thumb_150.jpg', '400': 'thumb_400.jpg' },
    qc: { sharpness: { score: 0.85, status: 'pass' }, exposure: { status: 'pass' } },
    qc_version: 1,
    status: 'processed',
    created_at: new Date('2024-01-01'),
    published_at: null,
    updated_at: new Date('2024-01-02'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findBySession', () => {
    it('should find images ordered by angle then created date', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockImageRow, { ...mockImageRow, id: 'img-2', angle_deg: 90 }],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await imagesRepository.findBySession(sessionId, { orgId });

      expect(result).toHaveLength(2);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY COALESCE(angle_deg, 999)'),
        [orgId, sessionId]
      );
    });

    it('should return empty array when no images found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await imagesRepository.findBySession('empty-session', { orgId });

      expect(result).toEqual([]);
    });
  });

  describe('findFiltered', () => {
    it('should filter by sessionId', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockImageRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await imagesRepository.findFiltered(
        { orgId },
        { sessionId }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('session_id'),
        expect.arrayContaining([orgId, sessionId])
      );
    });

    it('should filter by status', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockImageRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await imagesRepository.findFiltered(
        { orgId },
        { status: 'published' }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.arrayContaining([orgId, 'published'])
      );
    });

    it('should filter by vehicleId', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await imagesRepository.findFiltered(
        { orgId },
        { vehicleId }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('vehicle_id'),
        expect.arrayContaining([orgId, vehicleId])
      );
    });

    it('should apply pagination', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await imagesRepository.findFiltered(
        { orgId },
        {},
        { limit: 20, offset: 40 }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/LIMIT.*OFFSET/),
        expect.arrayContaining([orgId, 20, 40])
      );
    });
  });

  describe('findByHash', () => {
    it('should find image by SHA256 hash', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockImageRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await imagesRepository.findByHash('abc123hash', { orgId });

      expect(result).not.toBeNull();
      expect(result?.hashSha256).toBe('abc123hash');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('hash_sha256'),
        [orgId, 'abc123hash']
      );
    });

    it('should return null when hash not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await imagesRepository.findByHash('nonexistent', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('createOrUpdate', () => {
    it('should create new image record', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockImageRow],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await imagesRepository.createOrUpdate({
        orgId,
        siteId,
        sessionId,
        vehicleId,
        storageKey: 'org/123/img.jpg',
        hashSha256: 'abc123hash',
        status: 'pending',
      });

      expect(result.id).toBe('img-1');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO images'),
        expect.any(Array)
      );
    });

    it('should upsert on hash conflict', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockImageRow],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      await imagesRepository.createOrUpdate({
        orgId,
        siteId,
        sessionId,
        vehicleId,
        storageKey: 'org/123/img.jpg',
        hashSha256: 'abc123hash',
        status: 'processed',
      });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (hash_sha256) DO UPDATE'),
        expect.any(Array)
      );
    });

    it('should include optional fields when provided', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockImageRow],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      await imagesRepository.createOrUpdate({
        orgId,
        siteId,
        sessionId,
        vehicleId,
        storageKey: 'org/123/img.jpg',
        hashSha256: 'abc123hash',
        angleDeg: 45,
        shotName: 'front_quarter',
        width: 1920,
        height: 1080,
        exif: { cameraMake: 'Test' },
        thumbKeys: { '150': 'thumb.jpg' },
        qc: { sharpness: { score: 0.9, status: 'pass' } },
        qcVersion: 1,
        status: 'processed',
      });

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([45, 'front_quarter', 1920, 1080])
      );
    });
  });

  describe('updateProcessingResult', () => {
    it('should update image with processing results', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockImageRow, status: 'processed' }],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await imagesRepository.updateProcessingResult('img-1', orgId, {
        width: 1920,
        height: 1080,
        thumbKeys: { '150': 'thumb.jpg' },
        qc: { sharpness: { score: 0.85, status: 'pass' } },
        qcVersion: 1,
        status: 'processed',
        phash: 'phash123',
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe('processed');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE images SET'),
        expect.any(Array)
      );
    });

    it('should return null when image not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await imagesRepository.updateProcessingResult('nonexistent', orgId, {
        status: 'processed',
      });

      expect(result).toBeNull();
    });
  });

  describe('publish', () => {
    it('should publish image', async () => {
      const now = new Date();
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockImageRow, status: 'published', published_at: now }],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await imagesRepository.publish('img-1', { orgId });

      expect(result).not.toBeNull();
      expect(result?.status).toBe('published');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'published'"),
        ['img-1', orgId]
      );
    });

    it('should return null when image not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await imagesRepository.publish('nonexistent', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('bulkPublish', () => {
    it('should bulk publish multiple images', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 5,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const ids = ['img-1', 'img-2', 'img-3', 'img-4', 'img-5'];
      const count = await imagesRepository.bulkPublish(ids, { orgId });

      expect(count).toBe(5);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('id = ANY($1)'),
        [ids, orgId]
      );
    });

    it('should return 0 when no images matched', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const count = await imagesRepository.bulkPublish(['nonexistent'], { orgId });

      expect(count).toBe(0);
    });
  });

  describe('countBySession', () => {
    it('should count images in session', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ count: '42' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const count = await imagesRepository.countBySession(sessionId, { orgId });

      expect(count).toBe(42);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*)'),
        [orgId, sessionId]
      );
    });

    it('should return 0 for empty session', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ count: '0' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const count = await imagesRepository.countBySession('empty-session', { orgId });

      expect(count).toBe(0);
    });
  });

  describe('countByStatusForSession', () => {
    it('should count images grouped by status', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [
          { status: 'pending', count: '5' },
          { status: 'processing', count: '2' },
          { status: 'processed', count: '10' },
          { status: 'published', count: '3' },
        ],
        rowCount: 4,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const counts = await imagesRepository.countByStatusForSession(sessionId, { orgId });

      expect(counts.pending).toBe(5);
      expect(counts.processing).toBe(2);
      expect(counts.processed).toBe(10);
      expect(counts.published).toBe(3);
      expect(counts.failed).toBe(0);
    });

    it('should return zeros for all statuses when session empty', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const counts = await imagesRepository.countByStatusForSession('empty', { orgId });

      expect(counts.pending).toBe(0);
      expect(counts.processing).toBe(0);
      expect(counts.processed).toBe(0);
      expect(counts.published).toBe(0);
      expect(counts.failed).toBe(0);
    });
  });

  describe('mapRow', () => {
    it('should correctly map database row to entity', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockImageRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await imagesRepository.findBySession(sessionId, { orgId });

      expect(result[0]).toEqual({
        id: 'img-1',
        orgId,
        siteId,
        sessionId,
        vehicleId,
        angleDeg: 45,
        shotName: 'front_quarter',
        hashSha256: 'abc123hash',
        phash: 'phash123',
        width: 1920,
        height: 1080,
        exif: { cameraMake: 'iPhone' },
        storageKey: 'org/123/site/456/session/789/img.jpg',
        thumbKeys: { '150': 'thumb_150.jpg', '400': 'thumb_400.jpg' },
        qc: { sharpness: { score: 0.85, status: 'pass' }, exposure: { status: 'pass' } },
        qcVersion: 1,
        status: 'processed',
        createdAt: new Date('2024-01-01'),
        publishedAt: null,
        updatedAt: new Date('2024-01-02'),
      });
    });
  });
});
