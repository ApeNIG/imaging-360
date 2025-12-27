import type { Event, EntityType, EventType, ActorType } from '@360-imaging/shared';
import { query } from '../index.js';
import {
  BaseRepository,
  QueryOptions,
  PaginationOptions,
  mapEntityToSnake,
} from './base.repository.js';

interface EventEntity extends Event {
  createdAt: Date;
}

export interface EventFilter {
  entityType?: EntityType;
  entityId?: string;
  type?: EventType;
  actorId?: string;
  since?: Date;
}

export class EventsRepository extends BaseRepository<EventEntity> {
  protected tableName = 'events';
  protected columns = [
    'id',
    'org_id',
    'entity_type',
    'entity_id',
    'type',
    'actor_id',
    'actor_type',
    'message',
    'meta',
    'created_at',
  ];

  protected mapRow(row: Record<string, unknown>): EventEntity {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      entityType: row.entity_type as EntityType,
      entityId: row.entity_id as string,
      type: row.type as EventType,
      actorId: row.actor_id as string | undefined,
      actorType: row.actor_type as ActorType | undefined,
      message: row.message as string | undefined,
      meta: row.meta as Record<string, unknown> | undefined,
      createdAt: row.created_at as Date,
    };
  }

  protected mapEntity(entity: Partial<EventEntity>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    if (entity.orgId !== undefined) mapped.org_id = entity.orgId;
    if (entity.entityType !== undefined) mapped.entity_type = entity.entityType;
    if (entity.entityId !== undefined) mapped.entity_id = entity.entityId;
    if (entity.type !== undefined) mapped.type = entity.type;
    if (entity.actorId !== undefined) mapped.actor_id = entity.actorId;
    if (entity.actorType !== undefined) mapped.actor_type = entity.actorType;
    if (entity.message !== undefined) mapped.message = entity.message;
    if (entity.meta) mapped.meta = JSON.stringify(entity.meta);

    return mapped;
  }

  /**
   * Create a single event
   */
  async create(data: {
    orgId: string;
    entityType: EntityType;
    entityId: string;
    type: EventType;
    actorId?: string;
    actorType?: ActorType;
    message?: string;
    meta?: Record<string, unknown>;
  }): Promise<EventEntity> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO events (org_id, entity_type, entity_id, type, actor_id, actor_type, message, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.orgId,
        data.entityType,
        data.entityId,
        data.type,
        data.actorId ?? null,
        data.actorType ?? null,
        data.message ?? null,
        data.meta ? JSON.stringify(data.meta) : null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Batch insert events
   */
  async createBatch(
    events: Array<{
      orgId: string;
      entityType: EntityType;
      entityId: string;
      type: EventType;
      actorId?: string;
      actorType?: ActorType;
      message?: string;
      meta?: Record<string, unknown>;
    }>
  ): Promise<number> {
    if (events.length === 0) return 0;

    // Build multi-row insert
    const values: unknown[] = [];
    const valueRows: string[] = [];

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const offset = i * 8;
      valueRows.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
      );
      values.push(
        e.orgId,
        e.entityType,
        e.entityId,
        e.type,
        e.actorId ?? null,
        e.actorType ?? null,
        e.message ?? null,
        e.meta ? JSON.stringify(e.meta) : null
      );
    }

    const result = await query(
      `INSERT INTO events (org_id, entity_type, entity_id, type, actor_id, actor_type, message, meta)
       VALUES ${valueRows.join(', ')}`,
      values
    );

    return result.rowCount ?? 0;
  }

  /**
   * Find events with filters
   */
  async findFiltered(
    opts: QueryOptions,
    filters: EventFilter,
    pagination?: PaginationOptions
  ): Promise<EventEntity[]> {
    const params: unknown[] = [opts.orgId];
    let sql = `SELECT * FROM events WHERE org_id = $1`;

    if (filters.entityType) {
      sql += ` AND entity_type = $${params.length + 1}`;
      params.push(filters.entityType);
    }

    if (filters.entityId) {
      sql += ` AND entity_id = $${params.length + 1}`;
      params.push(filters.entityId);
    }

    if (filters.type) {
      sql += ` AND type = $${params.length + 1}`;
      params.push(filters.type);
    }

    if (filters.actorId) {
      sql += ` AND actor_id = $${params.length + 1}`;
      params.push(filters.actorId);
    }

    if (filters.since) {
      sql += ` AND created_at >= $${params.length + 1}`;
      params.push(filters.since);
    }

    sql += ` ORDER BY created_at DESC`;

    if (pagination?.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(pagination.limit);
    }
    if (pagination?.offset) {
      sql += ` OFFSET $${params.length + 1}`;
      params.push(pagination.offset);
    }

    const result = await query<Record<string, unknown>>(sql, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Get events for entity
   */
  async findByEntity(
    entityType: EntityType,
    entityId: string,
    opts: QueryOptions
  ): Promise<EventEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM events
       WHERE org_id = $1 AND entity_type = $2 AND entity_id = $3
       ORDER BY created_at DESC`,
      [opts.orgId, entityType, entityId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Get recent events for session timeline
   */
  async findSessionTimeline(
    sessionId: string,
    opts: QueryOptions
  ): Promise<EventEntity[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM events
       WHERE org_id = $1 AND (
         (entity_type = 'session' AND entity_id = $2) OR
         (entity_type = 'image' AND entity_id IN (SELECT id FROM images WHERE session_id = $2))
       )
       ORDER BY created_at DESC
       LIMIT 100`,
      [opts.orgId, sessionId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Count events by type for entity
   */
  async countByTypeForEntity(
    entityType: EntityType,
    entityId: string,
    opts: QueryOptions
  ): Promise<Record<string, number>> {
    const result = await query<{ type: string; count: string }>(
      `SELECT type, COUNT(*) as count FROM events
       WHERE org_id = $1 AND entity_type = $2 AND entity_id = $3
       GROUP BY type`,
      [opts.orgId, entityType, entityId]
    );

    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.type] = parseInt(row.count, 10);
    }
    return counts;
  }
}

export const eventsRepository = new EventsRepository();
