import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEvent, createBatchEvents, getEventsByEntity, getSessionTimeline } from './events.service.js';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  eventsRepository: {
    create: vi.fn(),
    createBatch: vi.fn(),
    findByEntity: vi.fn(),
    findSessionTimeline: vi.fn(),
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { eventsRepository } from '../db/index.js';

describe('Events Service', () => {
  const orgId = '550e8400-e29b-41d4-a716-446655440000';
  const sessionId = '770e8400-e29b-41d4-a716-446655440002';
  const actorId = 'user-123';

  const mockEvent = {
    id: 'event-1',
    orgId,
    entityType: 'session' as const,
    entityId: sessionId,
    type: 'session_started' as const,
    actorId,
    actorType: 'user' as const,
    message: null,
    meta: null,
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createEvent', () => {
    it('should create event successfully', async () => {
      vi.mocked(eventsRepository.create).mockResolvedValue(mockEvent);

      const result = await createEvent({
        orgId,
        entityType: 'session',
        entityId: sessionId,
        type: 'session_started',
        actorId,
        actorType: 'user',
      });

      expect(eventsRepository.create).toHaveBeenCalledWith({
        orgId,
        entityType: 'session',
        entityId: sessionId,
        type: 'session_started',
        actorId,
        actorType: 'user',
        message: undefined,
        meta: undefined,
      });

      expect(result).toEqual({ id: mockEvent.id });
    });

    it('should create event with message and meta', async () => {
      const meta = { key: 'value' };
      const message = 'Test message';

      vi.mocked(eventsRepository.create).mockResolvedValue({
        ...mockEvent,
        message,
        meta,
      });

      const result = await createEvent({
        orgId,
        entityType: 'image',
        entityId: 'image-123',
        type: 'upload_started',
        actorId: 'device-456',
        actorType: 'device',
        message,
        meta,
      });

      expect(eventsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message,
          meta,
          actorType: 'device',
        })
      );

      expect(result).toEqual({ id: mockEvent.id });
    });

    it('should propagate repository errors', async () => {
      vi.mocked(eventsRepository.create).mockRejectedValue(new Error('Database error'));

      await expect(
        createEvent({
          orgId,
          entityType: 'session',
          entityId: sessionId,
          type: 'session_started',
          actorId,
          actorType: 'user',
        })
      ).rejects.toThrow('Database error');
    });
  });

  describe('createBatchEvents', () => {
    it('should create batch events successfully', async () => {
      vi.mocked(eventsRepository.createBatch).mockResolvedValue(3);

      const events = [
        { entityType: 'session', entityId: sessionId, type: 'upload_started' },
        { entityType: 'session', entityId: sessionId, type: 'upload_completed' },
        { entityType: 'session', entityId: sessionId, type: 'qc_passed' },
      ];

      const result = await createBatchEvents({
        orgId,
        actorId,
        actorType: 'device',
        events,
      });

      expect(eventsRepository.createBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            orgId,
            entityType: 'session',
            entityId: sessionId,
            actorId,
            actorType: 'device',
          }),
        ])
      );

      expect(result).toEqual({ accepted: 3 });
    });

    it('should return 0 accepted for empty events array', async () => {
      const result = await createBatchEvents({
        orgId,
        actorId,
        actorType: 'user',
        events: [],
      });

      expect(eventsRepository.createBatch).not.toHaveBeenCalled();
      expect(result).toEqual({ accepted: 0 });
    });

    it('should map all event properties correctly', async () => {
      vi.mocked(eventsRepository.createBatch).mockResolvedValue(1);

      const events = [
        {
          entityType: 'image',
          entityId: 'img-1',
          type: 'published',
          message: 'Published by user',
          meta: { source: 'portal' },
        },
      ];

      await createBatchEvents({
        orgId,
        actorId: 'system',
        actorType: 'system',
        events,
      });

      expect(eventsRepository.createBatch).toHaveBeenCalledWith([
        {
          orgId,
          entityType: 'image',
          entityId: 'img-1',
          type: 'published',
          actorId: 'system',
          actorType: 'system',
          message: 'Published by user',
          meta: { source: 'portal' },
        },
      ]);
    });
  });

  describe('getEventsByEntity', () => {
    it('should return events for entity', async () => {
      const events = [mockEvent, { ...mockEvent, id: 'event-2', type: 'session_completed' }];
      vi.mocked(eventsRepository.findByEntity).mockResolvedValue(events);

      const result = await getEventsByEntity('session', sessionId, orgId);

      expect(eventsRepository.findByEntity).toHaveBeenCalledWith('session', sessionId, { orgId });
      expect(result).toEqual({
        data: events,
        total: 2,
      });
    });

    it('should return empty array when no events', async () => {
      vi.mocked(eventsRepository.findByEntity).mockResolvedValue([]);

      const result = await getEventsByEntity('image', 'non-existent', orgId);

      expect(result).toEqual({
        data: [],
        total: 0,
      });
    });
  });

  describe('getSessionTimeline', () => {
    it('should return session timeline events', async () => {
      const timelineEvents = [
        { ...mockEvent, type: 'session_started' },
        { ...mockEvent, id: 'event-2', type: 'upload_started' },
        { ...mockEvent, id: 'event-3', type: 'upload_completed' },
      ];
      vi.mocked(eventsRepository.findSessionTimeline).mockResolvedValue(timelineEvents);

      const result = await getSessionTimeline(sessionId, orgId);

      expect(eventsRepository.findSessionTimeline).toHaveBeenCalledWith(sessionId, { orgId });
      expect(result).toEqual({
        data: timelineEvents,
        total: 3,
      });
    });

    it('should return empty timeline for session with no events', async () => {
      vi.mocked(eventsRepository.findSessionTimeline).mockResolvedValue([]);

      const result = await getSessionTimeline('new-session', orgId);

      expect(result).toEqual({
        data: [],
        total: 0,
      });
    });
  });
});
