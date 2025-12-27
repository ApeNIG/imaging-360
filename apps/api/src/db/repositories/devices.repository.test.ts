import { describe, it, expect, vi, beforeEach } from 'vitest';
import { devicesRepository } from './devices.repository.js';

// Mock the query function
vi.mock('../index.js', () => ({
  query: vi.fn(),
  db: {
    connect: vi.fn(),
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

import { query } from '../index.js';

describe('Devices Repository', () => {
  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const siteId = '660e8400-e29b-41d4-a716-446655440001';
  const deviceId = 'device-123';

  const mockDeviceRow = {
    id: deviceId,
    org_id: orgId,
    site_id: siteId,
    platform: 'ios',
    model: 'iPhone 15 Pro',
    app_version: '1.0.0',
    registered_at: new Date('2024-01-01T10:00:00Z'),
    last_seen: new Date('2024-01-15T10:00:00Z'),
    created_at: new Date('2024-01-01T10:00:00Z'),
    updated_at: new Date('2024-01-15T10:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findOrCreate', () => {
    it('should return existing device and update last_seen', async () => {
      const updatedRow = { ...mockDeviceRow, last_seen: new Date() };

      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [mockDeviceRow],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [updatedRow],
          rowCount: 1,
          command: 'UPDATE',
          oid: 0,
          fields: [],
        });

      const result = await devicesRepository.findOrCreate(
        orgId,
        'ios',
        'iPhone 15 Pro',
        '1.1.0'
      );

      expect(query).toHaveBeenCalledTimes(2);
      // First call: SELECT
      expect(query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('SELECT * FROM devices'),
        [orgId, 'ios', 'iPhone 15 Pro']
      );
      // Second call: UPDATE last_seen
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE devices'),
        ['1.1.0', deviceId]
      );

      expect(result.id).toBe(deviceId);
    });

    it('should create new device when not found', async () => {
      const newDeviceRow = {
        ...mockDeviceRow,
        id: 'new-device-id',
        platform: 'android',
        model: 'Pixel 8',
      };

      vi.mocked(query)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
          command: 'SELECT',
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [newDeviceRow],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });

      const result = await devicesRepository.findOrCreate(
        orgId,
        'android',
        'Pixel 8',
        '1.0.0'
      );

      expect(query).toHaveBeenCalledTimes(2);
      // Second call: INSERT
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO devices'),
        [orgId, 'android', 'Pixel 8', '1.0.0']
      );

      expect(result.id).toBe('new-device-id');
      expect(result.platform).toBe('android');
    });

    it('should handle all platform types', async () => {
      const platforms = ['ios', 'android', 'edge'] as const;

      for (const platform of platforms) {
        vi.clearAllMocks();

        vi.mocked(query)
          .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] })
          .mockResolvedValueOnce({
            rows: [{ ...mockDeviceRow, platform }],
            rowCount: 1,
            command: 'INSERT',
            oid: 0,
            fields: [],
          });

        const result = await devicesRepository.findOrCreate(
          orgId,
          platform,
          'Test Model',
          '1.0.0'
        );

        expect(result.platform).toBe(platform);
      }
    });
  });

  describe('findById', () => {
    it('should find device by ID with org scoping', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockDeviceRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await devicesRepository.findById(deviceId, { orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND org_id = $2'),
        [deviceId, orgId]
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe(deviceId);
      expect(result?.platform).toBe('ios');
    });

    it('should return null when device not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await devicesRepository.findById('non-existent', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('updateLastSeen', () => {
    it('should update last_seen timestamp', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      await devicesRepository.updateLastSeen(deviceId, orgId);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('last_seen = NOW()'),
        [deviceId, orgId]
      );
    });

    it('should scope update to org', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      await devicesRepository.updateLastSeen(deviceId, 'different-org');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('org_id = $2'),
        [deviceId, 'different-org']
      );
    });
  });

  describe('findBySite', () => {
    it('should find devices by site with org scoping', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockDeviceRow, { ...mockDeviceRow, id: 'device-456' }],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await devicesRepository.findBySite(siteId, { orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('org_id = $1 AND site_id = $2'),
        [orgId, siteId]
      );

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no devices at site', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await devicesRepository.findBySite(siteId, { orgId });

      expect(result).toEqual([]);
    });
  });

  describe('findActive', () => {
    it('should find devices seen in last 24 hours', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockDeviceRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await devicesRepository.findActive({ orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("last_seen > NOW() - INTERVAL '24 hours'"),
        [orgId]
      );

      expect(result).toHaveLength(1);
    });

    it('should return empty array when no active devices', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await devicesRepository.findActive({ orgId });

      expect(result).toEqual([]);
    });

    it('should order by last_seen descending', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await devicesRepository.findActive({ orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY last_seen DESC'),
        expect.any(Array)
      );
    });
  });

  describe('mapRow', () => {
    it('should correctly map database row to entity', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockDeviceRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await devicesRepository.findById(deviceId, { orgId });

      expect(result).toEqual({
        id: deviceId,
        orgId: orgId,
        siteId: siteId,
        platform: 'ios',
        model: 'iPhone 15 Pro',
        appVersion: '1.0.0',
        registeredAt: mockDeviceRow.registered_at,
        lastSeen: mockDeviceRow.last_seen,
        createdAt: mockDeviceRow.created_at,
        updatedAt: mockDeviceRow.updated_at,
      });
    });

    it('should handle optional fields being null', async () => {
      const rowWithNulls = {
        ...mockDeviceRow,
        site_id: null,
        model: null,
        app_version: null,
        last_seen: null,
      };

      vi.mocked(query).mockResolvedValue({
        rows: [rowWithNulls],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await devicesRepository.findById(deviceId, { orgId });

      expect(result?.siteId).toBeNull();
      expect(result?.model).toBeNull();
      expect(result?.appVersion).toBeNull();
      expect(result?.lastSeen).toBeNull();
    });
  });
});
