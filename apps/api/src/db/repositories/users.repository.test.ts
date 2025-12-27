import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mockClient is available during mock hoisting
const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    query: vi.fn(),
    release: vi.fn(),
  },
}));

// Mock the db module before importing
vi.mock('../index.js', () => ({
  query: vi.fn(),
  db: {
    connect: vi.fn().mockImplementation(() => Promise.resolve(mockClient)),
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { UsersRepository, usersRepository } from './users.repository.js';
import { query, db } from '../index.js';

describe('UsersRepository', () => {
  const orgId = 'org-123';
  const userId = 'user-456';
  const siteId = 'site-789';

  const mockUserRow = {
    id: userId,
    org_id: orgId,
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-02'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockUserRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findByEmail('test@example.com', { orgId });

      expect(result).not.toBeNull();
      expect(result?.email).toBe('test@example.com');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('email = $2'),
        [orgId, 'test@example.com']
      );
    });

    it('should return null when email not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findByEmail('notfound@example.com', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('findByIdWithSiteAccess', () => {
    it('should find user with site IDs', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockUserRow, site_ids: ['site-1', 'site-2'] }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findByIdWithSiteAccess(userId, { orgId });

      expect(result).not.toBeNull();
      expect(result?.siteIds).toEqual(['site-1', 'site-2']);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('user_site_access'),
        [userId, orgId]
      );
    });

    it('should return null when user not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findByIdWithSiteAccess('nonexistent', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('findByEmailWithSiteAccess', () => {
    it('should find user by email with site IDs', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockUserRow, site_ids: ['site-1'] }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findByEmailWithSiteAccess('test@example.com', { orgId });

      expect(result).not.toBeNull();
      expect(result?.email).toBe('test@example.com');
      expect(result?.siteIds).toEqual(['site-1']);
    });

    it('should return null when email not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findByEmailWithSiteAccess('notfound@example.com', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('findByRole', () => {
    it('should find all users with specific role', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockUserRow, { ...mockUserRow, id: 'user-2' }],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findByRole('admin', { orgId });

      expect(result).toHaveLength(2);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('role = $2'),
        [orgId, 'admin']
      );
    });

    it('should return empty array when no users with role', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findByRole('operator', { orgId });

      expect(result).toEqual([]);
    });
  });

  describe('findBySite', () => {
    it('should find users with access to site', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockUserRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findBySite(siteId, { orgId });

      expect(result).toHaveLength(1);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('user_site_access'),
        [orgId, siteId]
      );
    });
  });

  describe('createWithSiteAccess', () => {
    it('should create user with site access in transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockUserRow] }) // INSERT user
        .mockResolvedValueOnce({}) // INSERT user_site_access
        .mockResolvedValueOnce({}); // COMMIT

      const result = await usersRepository.createWithSiteAccess(
        { orgId, email: 'new@example.com', name: 'New User', role: 'operator' },
        ['site-1', 'site-2']
      );

      expect(result.email).toBe('test@example.com');
      expect(result.siteIds).toEqual(['site-1', 'site-2']);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should create user without site access when siteIds empty', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockUserRow] }) // INSERT user
        .mockResolvedValueOnce({}); // COMMIT

      const result = await usersRepository.createWithSiteAccess(
        { orgId, email: 'new@example.com', role: 'admin' },
        []
      );

      expect(result).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledTimes(3); // BEGIN, INSERT, COMMIT
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('DB Error')); // INSERT fails

      await expect(
        usersRepository.createWithSiteAccess(
          { orgId, email: 'error@example.com', role: 'operator' },
          ['site-1']
        )
      ).rejects.toThrow('DB Error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('updateSiteAccess', () => {
    it('should update user site access in transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: userId }] }) // User exists check
        .mockResolvedValueOnce({}) // DELETE old access
        .mockResolvedValueOnce({}) // INSERT new access
        .mockResolvedValueOnce({}); // COMMIT

      await usersRepository.updateSiteAccess(userId, ['site-new-1', 'site-new-2'], { orgId });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_site_access'),
        [userId]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw error when user not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // User not found

      await expect(
        usersRepository.updateSiteAccess('nonexistent', ['site-1'], { orgId })
      ).rejects.toThrow('User not found');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should clear access when siteIds empty', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: userId }] }) // User exists
        .mockResolvedValueOnce({}) // DELETE access
        .mockResolvedValueOnce({}); // COMMIT

      await usersRepository.updateSiteAccess(userId, [], { orgId });

      expect(mockClient.query).toHaveBeenCalledTimes(4); // No INSERT call
    });
  });

  describe('hasAccessToSite', () => {
    it('should return true when user has access', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ exists: true }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.hasAccessToSite(userId, siteId, { orgId });

      expect(result).toBe(true);
    });

    it('should return false when user has no access', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ exists: false }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.hasAccessToSite(userId, 'other-site', { orgId });

      expect(result).toBe(false);
    });
  });

  describe('mapRow', () => {
    it('should correctly map database row to entity', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockUserRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findByEmail('test@example.com', { orgId });

      expect(result).toEqual({
        id: userId,
        orgId,
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });
    });

    it('should handle undefined name', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockUserRow, name: undefined }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await usersRepository.findByEmail('test@example.com', { orgId });

      expect(result?.name).toBeUndefined();
    });
  });
});
