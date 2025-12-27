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

import { SitesRepository, sitesRepository } from './sites.repository.js';
import { query } from '../index.js';

describe('SitesRepository', () => {
  const orgId = 'org-123';
  const siteId = 'site-456';
  const userId = 'user-789';

  const mockSiteRow = {
    id: siteId,
    org_id: orgId,
    name: 'Main Dealership',
    slug: 'main-dealership',
    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' },
    timezone: 'America/Chicago',
    settings: { defaultCapture: '360' },
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-02'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findBySlug', () => {
    it('should find site by slug', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockSiteRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sitesRepository.findBySlug('main-dealership', { orgId });

      expect(result).not.toBeNull();
      expect(result?.slug).toBe('main-dealership');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('slug = $2'),
        [orgId, 'main-dealership']
      );
    });

    it('should return null when slug not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sitesRepository.findBySlug('nonexistent', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('findAccessibleByUser', () => {
    it('should find sites user has access to', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockSiteRow, { ...mockSiteRow, id: 'site-2', name: 'Branch' }],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sitesRepository.findAccessibleByUser(userId, { orgId });

      expect(result).toHaveLength(2);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('user_site_access'),
        [orgId, userId]
      );
    });

    it('should return empty array when user has no access', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sitesRepository.findAccessibleByUser('no-access-user', { orgId });

      expect(result).toEqual([]);
    });
  });

  describe('findAllInOrg', () => {
    it('should find all sites in org', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockSiteRow, { ...mockSiteRow, id: 'site-2' }],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sitesRepository.findAllInOrg({ orgId });

      expect(result).toHaveLength(2);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY name'),
        [orgId]
      );
    });
  });

  describe('create', () => {
    it('should create a new site', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockSiteRow],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await sitesRepository.create({
        orgId,
        name: 'Main Dealership',
        slug: 'main-dealership',
        timezone: 'America/Chicago',
        address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' },
        settings: { defaultCapture: '360' },
      });

      expect(result.id).toBe(siteId);
      expect(result.name).toBe('Main Dealership');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sites'),
        expect.any(Array)
      );
    });

    it('should use default timezone when not provided', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockSiteRow, timezone: 'America/New_York' }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      await sitesRepository.create({
        orgId,
        name: 'Test Site',
        slug: 'test-site',
      });

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['America/New_York'])
      );
    });
  });

  describe('userHasAccess', () => {
    it('should return true for admin user', async () => {
      // First call: check if user is admin
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ role: 'admin' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Second call: check if site belongs to org
        .mockResolvedValueOnce({
          rows: [{ id: siteId }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const result = await sitesRepository.userHasAccess(userId, siteId, { orgId });

      expect(result).toBe(true);
    });

    it('should return true for non-admin with explicit access', async () => {
      // First call: user is not admin
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ role: 'operator' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        // Second call: check user_site_access
        .mockResolvedValueOnce({
          rows: [{ exists: true }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const result = await sitesRepository.userHasAccess(userId, siteId, { orgId });

      expect(result).toBe(true);
    });

    it('should return false for non-admin without access', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ role: 'operator' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ exists: false }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const result = await sitesRepository.userHasAccess(userId, 'other-site', { orgId });

      expect(result).toBe(false);
    });

    it('should return false for admin when site not in org', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [{ role: 'admin' }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });

      const result = await sitesRepository.userHasAccess(userId, 'other-org-site', { orgId });

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return site statistics', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{
          session_count: '50',
          image_count: '1500',
          vehicle_count: '200',
          active_session_count: '5',
        }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const stats = await sitesRepository.getStats(siteId, { orgId });

      expect(stats.sessionCount).toBe(50);
      expect(stats.imageCount).toBe(1500);
      expect(stats.vehicleCount).toBe(200);
      expect(stats.activeSessionCount).toBe(5);
    });

    it('should return zeros for empty site', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{
          session_count: '0',
          image_count: '0',
          vehicle_count: '0',
          active_session_count: '0',
        }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const stats = await sitesRepository.getStats('empty-site', { orgId });

      expect(stats.sessionCount).toBe(0);
      expect(stats.imageCount).toBe(0);
      expect(stats.vehicleCount).toBe(0);
      expect(stats.activeSessionCount).toBe(0);
    });
  });

  describe('mapRow', () => {
    it('should correctly map database row to entity', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockSiteRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sitesRepository.findBySlug('main-dealership', { orgId });

      expect(result).toEqual({
        id: siteId,
        orgId,
        name: 'Main Dealership',
        slug: 'main-dealership',
        address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701' },
        timezone: 'America/Chicago',
        settings: { defaultCapture: '360' },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });
    });

    it('should handle missing address', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockSiteRow, address: null }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sitesRepository.findBySlug('main-dealership', { orgId });

      expect(result?.address).toBeNull();
    });
  });
});
