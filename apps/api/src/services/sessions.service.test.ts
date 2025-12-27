import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listSessions,
  createSession,
  getSession,
  updateSession,
  getActiveSessionsForDevice,
} from './sessions.service.js';
import { NotFoundError } from '../middleware/error-handler.js';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  sessionsRepository: {
    findFiltered: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    findByIdWithDetails: vi.fn(),
    updateStatus: vi.fn(),
    findActiveByDevice: vi.fn(),
  },
  vehiclesRepository: {
    findOrCreate: vi.fn(),
  },
  eventsRepository: {
    create: vi.fn(),
  },
  QueryOptions: {},
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { sessionsRepository, vehiclesRepository, eventsRepository } from '../db/index.js';

describe('Sessions Service', () => {
  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const siteId = '660e8400-e29b-41d4-a716-446655440001';
  const sessionId = '770e8400-e29b-41d4-a716-446655440002';
  const vehicleId = '880e8400-e29b-41d4-a716-446655440003';
  const operatorId = '990e8400-e29b-41d4-a716-446655440004';
  const deviceId = 'device-123';

  const mockShotList = {
    studio360: { frameCount: 24, angleStep: 15 },
    stills: [] as Array<{ name: string; required: boolean }>,
  };

  const mockSession = {
    id: sessionId,
    orgId,
    siteId,
    vehicleId,
    mode: 'studio360' as const,
    shotList: mockShotList,
    operatorId,
    deviceId,
    startedAt: new Date(),
    completedAt: undefined,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVehicle = {
    id: vehicleId,
    orgId,
    siteId,
    vin: '1HGBH41JXMN109186',
    stock: 'STK001',
    meta: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSessionWithDetails = {
    ...mockSession,
    vehicle: mockVehicle,
    operator: { id: operatorId, name: 'Test Operator' },
    site: { id: siteId, name: 'Test Site' },
    imageCount: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listSessions', () => {
    it('should list sessions with pagination', async () => {
      const mockSessions = [mockSessionWithDetails];
      vi.mocked(sessionsRepository.findFiltered).mockResolvedValue(mockSessions);
      vi.mocked(sessionsRepository.count).mockResolvedValue(1);

      const result = await listSessions({
        orgId,
        limit: 10,
        offset: 0,
      });

      expect(sessionsRepository.findFiltered).toHaveBeenCalledWith(
        { orgId, siteIds: undefined },
        { siteId: undefined, status: undefined, vehicleId: undefined },
        { limit: 10, offset: 0 }
      );
      expect(result).toEqual({
        data: mockSessions,
        total: 1,
        limit: 10,
        offset: 0,
      });
    });

    it('should filter by siteId', async () => {
      vi.mocked(sessionsRepository.findFiltered).mockResolvedValue([]);
      vi.mocked(sessionsRepository.count).mockResolvedValue(0);

      await listSessions({
        orgId,
        siteId,
        limit: 10,
        offset: 0,
      });

      expect(sessionsRepository.findFiltered).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ siteId }),
        expect.anything()
      );
    });

    it('should filter by status', async () => {
      vi.mocked(sessionsRepository.findFiltered).mockResolvedValue([]);
      vi.mocked(sessionsRepository.count).mockResolvedValue(0);

      await listSessions({
        orgId,
        status: 'active',
        limit: 10,
        offset: 0,
      });

      expect(sessionsRepository.findFiltered).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'active' }),
        expect.anything()
      );
    });

    it('should scope by userSiteIds', async () => {
      const userSiteIds = [siteId, 'another-site-id'];
      vi.mocked(sessionsRepository.findFiltered).mockResolvedValue([]);
      vi.mocked(sessionsRepository.count).mockResolvedValue(0);

      await listSessions({
        orgId,
        userSiteIds,
        limit: 10,
        offset: 0,
      });

      expect(sessionsRepository.findFiltered).toHaveBeenCalledWith(
        { orgId, siteIds: userSiteIds },
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('createSession', () => {
    it('should create session with studio360 mode and default shot list', async () => {
      vi.mocked(vehiclesRepository.findOrCreate).mockResolvedValue(mockVehicle);
      vi.mocked(sessionsRepository.create).mockResolvedValue(mockSession);
      vi.mocked(sessionsRepository.findByIdWithDetails).mockResolvedValue(mockSessionWithDetails);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      const result = await createSession({
        orgId,
        siteId,
        vehicle: { vin: '1HGBH41JXMN109186', stock: 'STK001' },
        mode: 'studio360',
        operatorId,
        deviceId,
      });

      expect(vehiclesRepository.findOrCreate).toHaveBeenCalledWith(
        orgId,
        siteId,
        '1HGBH41JXMN109186',
        'STK001'
      );

      expect(sessionsRepository.create).toHaveBeenCalledWith(
        orgId,
        siteId,
        vehicleId,
        'studio360',
        operatorId,
        deviceId,
        expect.objectContaining({ studio360: expect.any(Object) })
      );

      expect(eventsRepository.create).toHaveBeenCalledWith({
        orgId,
        entityType: 'session',
        entityId: sessionId,
        type: 'session_started',
        actorId: operatorId,
        actorType: 'user',
        meta: { mode: 'studio360', vehicleId },
      });

      expect(result).toEqual(mockSessionWithDetails);
    });

    it('should create session with stills mode and default shot list', async () => {
      const stillsSession = { ...mockSession, mode: 'stills' as const };
      vi.mocked(vehiclesRepository.findOrCreate).mockResolvedValue(mockVehicle);
      vi.mocked(sessionsRepository.create).mockResolvedValue(stillsSession);
      vi.mocked(sessionsRepository.findByIdWithDetails).mockResolvedValue({
        ...mockSessionWithDetails,
        mode: 'stills',
      });
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      await createSession({
        orgId,
        siteId,
        vehicle: { vin: '1HGBH41JXMN109186' },
        mode: 'stills',
        operatorId,
        deviceId,
      });

      expect(sessionsRepository.create).toHaveBeenCalledWith(
        orgId,
        siteId,
        vehicleId,
        'stills',
        operatorId,
        deviceId,
        expect.objectContaining({ stills: expect.any(Array) })
      );
    });

    it('should use custom shot list when provided', async () => {
      const customShotList = { studio360: { frameCount: 36, intervalDeg: 10 } };
      vi.mocked(vehiclesRepository.findOrCreate).mockResolvedValue(mockVehicle);
      vi.mocked(sessionsRepository.create).mockResolvedValue(mockSession);
      vi.mocked(sessionsRepository.findByIdWithDetails).mockResolvedValue(mockSessionWithDetails);
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      await createSession({
        orgId,
        siteId,
        vehicle: { stock: 'STK001' },
        mode: 'studio360',
        shotList: customShotList,
        operatorId,
        deviceId,
      });

      expect(sessionsRepository.create).toHaveBeenCalledWith(
        orgId,
        siteId,
        vehicleId,
        'studio360',
        operatorId,
        deviceId,
        customShotList
      );
    });
  });

  describe('getSession', () => {
    it('should return session when found', async () => {
      vi.mocked(sessionsRepository.findByIdWithDetails).mockResolvedValue(mockSessionWithDetails);

      const result = await getSession({ sessionId, orgId });

      expect(sessionsRepository.findByIdWithDetails).toHaveBeenCalledWith(sessionId, { orgId });
      expect(result).toEqual(mockSessionWithDetails);
    });

    it('should throw NotFoundError when session not found', async () => {
      vi.mocked(sessionsRepository.findByIdWithDetails).mockResolvedValue(null);

      await expect(getSession({ sessionId, orgId })).rejects.toThrow(NotFoundError);
      await expect(getSession({ sessionId, orgId })).rejects.toThrow('Session not found');
    });
  });

  describe('updateSession', () => {
    it('should return session without update when no status provided', async () => {
      vi.mocked(sessionsRepository.findByIdWithDetails).mockResolvedValue(mockSessionWithDetails);

      const result = await updateSession({ sessionId, orgId });

      expect(sessionsRepository.updateStatus).not.toHaveBeenCalled();
      expect(result).toEqual(mockSessionWithDetails);
    });

    it('should update status to complete and log event', async () => {
      const completedSession = { ...mockSession, status: 'complete' as const };
      vi.mocked(sessionsRepository.updateStatus).mockResolvedValue(completedSession);
      vi.mocked(sessionsRepository.findByIdWithDetails).mockResolvedValue({
        ...mockSessionWithDetails,
        status: 'complete',
      });
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      await updateSession({ sessionId, orgId, status: 'complete' });

      expect(sessionsRepository.updateStatus).toHaveBeenCalledWith(sessionId, 'complete', { orgId });
      expect(eventsRepository.create).toHaveBeenCalledWith({
        orgId,
        entityType: 'session',
        entityId: sessionId,
        type: 'session_completed',
        actorType: 'system',
      });
    });

    it('should update status to abandoned and log event', async () => {
      const abandonedSession = { ...mockSession, status: 'abandoned' as const };
      vi.mocked(sessionsRepository.updateStatus).mockResolvedValue(abandonedSession);
      vi.mocked(sessionsRepository.findByIdWithDetails).mockResolvedValue({
        ...mockSessionWithDetails,
        status: 'abandoned',
      });
      vi.mocked(eventsRepository.create).mockResolvedValue({} as any);

      await updateSession({ sessionId, orgId, status: 'abandoned' });

      expect(eventsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'session_abandoned' })
      );
    });

    it('should not log event for active status', async () => {
      vi.mocked(sessionsRepository.updateStatus).mockResolvedValue(mockSession);
      vi.mocked(sessionsRepository.findByIdWithDetails).mockResolvedValue(mockSessionWithDetails);

      await updateSession({ sessionId, orgId, status: 'active' });

      expect(eventsRepository.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError when session not found', async () => {
      vi.mocked(sessionsRepository.updateStatus).mockResolvedValue(null);

      await expect(updateSession({ sessionId, orgId, status: 'complete' })).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('getActiveSessionsForDevice', () => {
    it('should return active sessions with details', async () => {
      const activeSessions = [mockSession];
      vi.mocked(sessionsRepository.findActiveByDevice).mockResolvedValue(activeSessions);
      vi.mocked(sessionsRepository.findByIdWithDetails).mockResolvedValue(mockSessionWithDetails);

      const result = await getActiveSessionsForDevice(deviceId, orgId);

      expect(sessionsRepository.findActiveByDevice).toHaveBeenCalledWith(deviceId, { orgId });
      expect(sessionsRepository.findByIdWithDetails).toHaveBeenCalledWith(sessionId, { orgId });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockSessionWithDetails);
    });

    it('should filter out null sessions', async () => {
      const activeSessions = [mockSession, { ...mockSession, id: 'session-2' }];
      vi.mocked(sessionsRepository.findActiveByDevice).mockResolvedValue(activeSessions);
      vi.mocked(sessionsRepository.findByIdWithDetails)
        .mockResolvedValueOnce(mockSessionWithDetails)
        .mockResolvedValueOnce(null);

      const result = await getActiveSessionsForDevice(deviceId, orgId);

      expect(result).toHaveLength(1);
    });

    it('should return empty array when no active sessions', async () => {
      vi.mocked(sessionsRepository.findActiveByDevice).mockResolvedValue([]);

      const result = await getActiveSessionsForDevice(deviceId, orgId);

      expect(result).toEqual([]);
    });
  });
});
