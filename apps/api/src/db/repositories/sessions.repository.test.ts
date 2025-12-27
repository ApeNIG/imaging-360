import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sessionsRepository } from './sessions.repository.js';

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

describe('Sessions Repository', () => {
  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const siteId = '660e8400-e29b-41d4-a716-446655440001';
  const sessionId = '770e8400-e29b-41d4-a716-446655440002';
  const vehicleId = '880e8400-e29b-41d4-a716-446655440003';
  const operatorId = '990e8400-e29b-41d4-a716-446655440004';
  const deviceId = 'device-123';

  const mockSessionRow = {
    id: sessionId,
    org_id: orgId,
    site_id: siteId,
    vehicle_id: vehicleId,
    mode: 'studio360',
    shot_list: { studio360: { frameCount: 24 } },
    operator_id: operatorId,
    device_id: deviceId,
    started_at: new Date('2024-01-01T10:00:00Z'),
    completed_at: null,
    status: 'active',
    abandoned_at: null,
    created_at: new Date('2024-01-01T10:00:00Z'),
    updated_at: new Date('2024-01-01T10:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new session', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockSessionRow],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.create(
        orgId,
        siteId,
        vehicleId,
        'studio360',
        operatorId,
        deviceId,
        { studio360: { frameCount: 24 } }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions'),
        expect.arrayContaining([orgId, siteId, vehicleId, 'studio360'])
      );

      expect(result.id).toBe(sessionId);
      expect(result.orgId).toBe(orgId);
      expect(result.mode).toBe('studio360');
    });

    it('should create session without shot list', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockSessionRow, shot_list: null }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      await sessionsRepository.create(
        orgId,
        siteId,
        vehicleId,
        'stills',
        operatorId,
        deviceId
      );

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null]) // shot_list should be null
      );
    });
  });

  describe('findById', () => {
    it('should find session by ID with org scoping', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockSessionRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.findById(sessionId, { orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND org_id = $2'),
        [sessionId, orgId]
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe(sessionId);
      expect(result?.orgId).toBe(orgId);
    });

    it('should return null when session not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.findById('non-existent', { orgId });

      expect(result).toBeNull();
    });

    it('should return null when session exists but in different org', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.findById(sessionId, {
        orgId: 'different-org',
      });

      expect(result).toBeNull();
    });
  });

  describe('findByIdWithDetails', () => {
    const mockDetailedRow = {
      ...mockSessionRow,
      vin: '1HGBH41JXMN109186',
      stock: 'STK001',
      vehicle_meta: {},
      user_id: operatorId,
      operator_name: 'Test Operator',
      site_id_ref: siteId,
      site_name: 'Test Site',
      image_count: '5',
    };

    it('should return session with vehicle, operator, and site details', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockDetailedRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.findByIdWithDetails(sessionId, { orgId });

      expect(result).not.toBeNull();
      expect(result?.vehicle).toBeDefined();
      expect(result?.vehicle?.vin).toBe('1HGBH41JXMN109186');
      expect(result?.operator).toBeDefined();
      expect(result?.operator?.name).toBe('Test Operator');
      expect(result?.site).toBeDefined();
      expect(result?.site?.name).toBe('Test Site');
      expect(result?.imageCount).toBe(5);
    });

    it('should return null when session not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.findByIdWithDetails('non-existent', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('findFiltered', () => {
    it('should filter by site', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await sessionsRepository.findFiltered(
        { orgId },
        { siteId },
        { limit: 10, offset: 0 }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('s.site_id = $'),
        expect.arrayContaining([orgId, siteId])
      );
    });

    it('should filter by status', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await sessionsRepository.findFiltered(
        { orgId },
        { status: 'active' },
        { limit: 10 }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('s.status = $'),
        expect.arrayContaining([orgId, 'active'])
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

      await sessionsRepository.findFiltered(
        { orgId },
        {},
        { limit: 20, offset: 40 }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/LIMIT \$\d+.*OFFSET \$\d+/),
        expect.arrayContaining([orgId, 20, 40])
      );
    });

    it('should scope by accessible siteIds', async () => {
      const siteIds = [siteId, 'other-site-id'];
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await sessionsRepository.findFiltered(
        { orgId, siteIds },
        {},
        {}
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('s.site_id = ANY($'),
        expect.arrayContaining([orgId, siteIds])
      );
    });
  });

  describe('updateStatus', () => {
    it('should update status to complete with timestamp', async () => {
      const completedRow = { ...mockSessionRow, status: 'complete', completed_at: new Date() };
      vi.mocked(query).mockResolvedValue({
        rows: [completedRow],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.updateStatus(sessionId, 'complete', { orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('completed_at = NOW()'),
        expect.arrayContaining(['complete', sessionId, orgId])
      );

      expect(result?.status).toBe('complete');
    });

    it('should update status to abandoned with timestamp', async () => {
      const abandonedRow = { ...mockSessionRow, status: 'abandoned', abandoned_at: new Date() };
      vi.mocked(query).mockResolvedValue({
        rows: [abandonedRow],
        rowCount: 1,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      await sessionsRepository.updateStatus(sessionId, 'abandoned', { orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('abandoned_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should return null when session not found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.updateStatus('non-existent', 'complete', { orgId });

      expect(result).toBeNull();
    });
  });

  describe('countByStatus', () => {
    it('should return counts grouped by status', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [
          { status: 'active', count: '5' },
          { status: 'complete', count: '10' },
          { status: 'abandoned', count: '2' },
        ],
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.countByStatus({ orgId });

      expect(result).toEqual({
        active: 5,
        complete: 10,
        abandoned: 2,
        failed: 0,
      });
    });

    it('should return zeros when no sessions exist', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.countByStatus({ orgId });

      expect(result).toEqual({
        active: 0,
        complete: 0,
        abandoned: 0,
        failed: 0,
      });
    });
  });

  describe('findActiveByDevice', () => {
    it('should find active sessions for device', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockSessionRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.findActiveByDevice(deviceId, { orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'active'"),
        [orgId, deviceId]
      );

      expect(result).toHaveLength(1);
      expect(result[0].deviceId).toBe(deviceId);
    });

    it('should return empty array when no active sessions', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await sessionsRepository.findActiveByDevice(deviceId, { orgId });

      expect(result).toEqual([]);
    });
  });
});
