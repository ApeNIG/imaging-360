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

import { EventsRepository, eventsRepository } from './events.repository.js';
import { query } from '../index.js';

describe('EventsRepository', () => {
  const orgId = 'org-123';
  const entityId = 'entity-456';

  const mockEventRow = {
    id: 'event-1',
    org_id: orgId,
    entity_type: 'session',
    entity_id: entityId,
    type: 'session_started',
    actor_id: 'user-1',
    actor_type: 'user',
    message: 'Session started',
    meta: { foo: 'bar' },
    created_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new event', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockEventRow],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await eventsRepository.create({
        orgId,
        entityType: 'session',
        entityId,
        type: 'session_started',
        actorId: 'user-1',
        actorType: 'user',
        message: 'Session started',
        meta: { foo: 'bar' },
      });

      expect(result.id).toBe('event-1');
      expect(result.orgId).toBe(orgId);
      expect(result.entityType).toBe('session');
      expect(result.type).toBe('session_started');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO events'),
        expect.arrayContaining([orgId, 'session', entityId, 'session_started'])
      );
    });

    it('should handle event without optional fields', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [{ ...mockEventRow, actor_id: null, actor_type: null, message: null, meta: null }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const result = await eventsRepository.create({
        orgId,
        entityType: 'image',
        entityId,
        type: 'upload_complete',
      });

      expect(result.actorId).toBeNull();
      expect(result.actorType).toBeNull();
    });
  });

  describe('createBatch', () => {
    it('should batch insert multiple events', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 3,
        command: 'INSERT',
        oid: 0,
        fields: [],
      });

      const events = [
        { orgId, entityType: 'session' as const, entityId: 'sess-1', type: 'session_started' as const },
        { orgId, entityType: 'session' as const, entityId: 'sess-2', type: 'session_started' as const },
        { orgId, entityType: 'session' as const, entityId: 'sess-3', type: 'session_started' as const },
      ];

      const count = await eventsRepository.createBatch(events);

      expect(count).toBe(3);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO events'),
        expect.any(Array)
      );
    });

    it('should return 0 for empty events array', async () => {
      const count = await eventsRepository.createBatch([]);

      expect(count).toBe(0);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('findFiltered', () => {
    it('should find events with filters', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockEventRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await eventsRepository.findFiltered(
        { orgId },
        { entityType: 'session', type: 'session_started' }
      );

      expect(result).toHaveLength(1);
      expect(result[0].entityType).toBe('session');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('entity_type'),
        expect.arrayContaining([orgId, 'session', 'session_started'])
      );
    });

    it('should apply pagination', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockEventRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await eventsRepository.findFiltered(
        { orgId },
        {},
        { limit: 10, offset: 20 }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/LIMIT.*OFFSET/),
        expect.arrayContaining([orgId, 10, 20])
      );
    });

    it('should filter by actorId', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await eventsRepository.findFiltered(
        { orgId },
        { actorId: 'user-1' }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('actor_id'),
        expect.arrayContaining([orgId, 'user-1'])
      );
    });

    it('should filter by since date', async () => {
      const since = new Date('2024-01-01');
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await eventsRepository.findFiltered(
        { orgId },
        { since }
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('created_at >='),
        expect.arrayContaining([orgId, since])
      );
    });
  });

  describe('findByEntity', () => {
    it('should find events for specific entity', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockEventRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await eventsRepository.findByEntity('session', entityId, { orgId });

      expect(result).toHaveLength(1);
      expect(result[0].entityId).toBe(entityId);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('entity_type = $2 AND entity_id = $3'),
        [orgId, 'session', entityId]
      );
    });

    it('should return empty array when no events found', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await eventsRepository.findByEntity('image', 'nonexistent', { orgId });

      expect(result).toEqual([]);
    });
  });

  describe('findSessionTimeline', () => {
    it('should find timeline events for session', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [
          mockEventRow,
          { ...mockEventRow, id: 'event-2', entity_type: 'image', entity_id: 'img-1' },
        ],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const sessionId = 'session-123';
      const result = await eventsRepository.findSessionTimeline(sessionId, { orgId });

      expect(result).toHaveLength(2);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("entity_type = 'session'"),
        [orgId, sessionId]
      );
    });

    it('should include image events in timeline', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      await eventsRepository.findSessionTimeline('sess-1', { orgId });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("entity_type = 'image'"),
        expect.any(Array)
      );
    });
  });

  describe('countByTypeForEntity', () => {
    it('should count events grouped by type', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [
          { type: 'session_started', count: '1' },
          { type: 'session_completed', count: '5' },
          { type: 'upload_complete', count: '10' },
        ],
        rowCount: 3,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const counts = await eventsRepository.countByTypeForEntity('session', entityId, { orgId });

      expect(counts['session_started']).toBe(1);
      expect(counts['session_completed']).toBe(5);
      expect(counts['upload_complete']).toBe(10);
    });

    it('should return empty object when no events', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const counts = await eventsRepository.countByTypeForEntity('session', 'no-events', { orgId });

      expect(counts).toEqual({});
    });
  });

  describe('mapRow', () => {
    it('should correctly map database row to entity', async () => {
      vi.mocked(query).mockResolvedValue({
        rows: [mockEventRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await eventsRepository.findByEntity('session', entityId, { orgId });

      expect(result[0]).toEqual({
        id: 'event-1',
        orgId,
        entityType: 'session',
        entityId,
        type: 'session_started',
        actorId: 'user-1',
        actorType: 'user',
        message: 'Session started',
        meta: { foo: 'bar' },
        createdAt: new Date('2024-01-01'),
      });
    });
  });
});
