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

import { OrganizationsRepository, organizationsRepository } from './organizations.repository.js';
import { query } from '../index.js';

describe('OrganizationsRepository', () => {
  const orgId = 'org-123';

  const mockOrgRow = {
    id: orgId,
    name: 'Test Dealership',
    slug: 'test-dealership',
    settings: { theme: 'dark', locale: 'en-US' },
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-02'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('should find organization by ID', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockOrgRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await organizationsRepository.findById(orgId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(orgId);
      expect(result?.name).toBe('Test Dealership');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('id = $1'),
        [orgId]
      );
    });

    it('should return null when ID not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await organizationsRepository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('should find organization by slug', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockOrgRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await organizationsRepository.findBySlug('test-dealership');

      expect(result).not.toBeNull();
      expect(result?.slug).toBe('test-dealership');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('slug = $1'),
        ['test-dealership']
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

      const result = await organizationsRepository.findBySlug('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true when organization exists', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ exists: true }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await organizationsRepository.exists(orgId);

      expect(result).toBe(true);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS'),
        [orgId]
      );
    });

    it('should return false when organization does not exist', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ exists: false }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await organizationsRepository.exists('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('create', () => {
    it('should create a new organization', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockOrgRow],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await organizationsRepository.create({
        name: 'Test Dealership',
        slug: 'test-dealership',
        settings: { theme: 'dark' },
      });

      expect(result.id).toBe(orgId);
      expect(result.name).toBe('Test Dealership');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO organizations'),
        expect.any(Array)
      );
    });

    it('should use empty settings when not provided', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockOrgRow, settings: {} }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      await organizationsRepository.create({
        name: 'Minimal Org',
        slug: 'minimal-org',
      });

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['Minimal Org', 'minimal-org', '{}'])
      );
    });
  });

  describe('updateSettings', () => {
    it('should update organization settings', async () => {
      const newSettings = { theme: 'light', notifications: true };
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockOrgRow, settings: newSettings }],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await organizationsRepository.updateSettings(orgId, newSettings);

      expect(result).not.toBeNull();
      expect(result?.settings).toEqual(newSettings);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE organizations'),
        [orgId, JSON.stringify(newSettings)]
      );
    });

    it('should return null when organization not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await organizationsRepository.updateSettings('nonexistent', {});

      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return organization statistics', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{
          site_count: '5',
          user_count: '25',
          device_count: '10',
          session_count: '500',
          image_count: '15000',
        }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const stats = await organizationsRepository.getStats(orgId);

      expect(stats.siteCount).toBe(5);
      expect(stats.userCount).toBe(25);
      expect(stats.deviceCount).toBe(10);
      expect(stats.sessionCount).toBe(500);
      expect(stats.imageCount).toBe(15000);
    });

    it('should return zeros for new organization', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{
          site_count: '0',
          user_count: '0',
          device_count: '0',
          session_count: '0',
          image_count: '0',
        }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const stats = await organizationsRepository.getStats('new-org');

      expect(stats.siteCount).toBe(0);
      expect(stats.userCount).toBe(0);
      expect(stats.deviceCount).toBe(0);
      expect(stats.sessionCount).toBe(0);
      expect(stats.imageCount).toBe(0);
    });
  });

  describe('mapRow', () => {
    it('should correctly map database row to entity', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockOrgRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await organizationsRepository.findById(orgId);

      expect(result).toEqual({
        id: orgId,
        name: 'Test Dealership',
        slug: 'test-dealership',
        settings: { theme: 'dark', locale: 'en-US' },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });
    });

    it('should handle null settings as empty object', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockOrgRow, settings: null }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await organizationsRepository.findById(orgId);

      expect(result?.settings).toEqual({});
    });
  });
});
