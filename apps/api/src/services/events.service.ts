import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/index.js';
import type { CreateEventRequest, ActorType } from '@360-imaging/shared';

interface CreateEventParams extends CreateEventRequest {
  orgId: string;
  actorId: string;
  actorType: ActorType;
}

interface CreateBatchEventsParams {
  orgId: string;
  actorId: string;
  actorType: ActorType;
  events: CreateEventRequest[];
}

export async function createEvent(params: CreateEventParams) {
  const { orgId, entityType, entityId, type, actorId, actorType, message, meta } = params;

  const eventId = uuidv4();

  await query(
    `INSERT INTO events (id, org_id, entity_type, entity_id, type, actor_id, actor_type, message, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [eventId, orgId, entityType, entityId, type, actorId, actorType, message || null, meta ? JSON.stringify(meta) : null]
  );

  return { id: eventId };
}

export async function createBatchEvents(params: CreateBatchEventsParams) {
  const { orgId, actorId, actorType, events } = params;

  // Build batch insert
  const values: unknown[] = [];
  const valuePlaceholders: string[] = [];
  let paramIndex = 1;

  for (const event of events) {
    const eventId = uuidv4();
    valuePlaceholders.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8})`
    );
    values.push(
      eventId,
      orgId,
      event.entityType,
      event.entityId,
      event.type,
      actorId,
      actorType,
      event.message || null,
      event.meta ? JSON.stringify(event.meta) : null
    );
    paramIndex += 9;
  }

  await query(
    `INSERT INTO events (id, org_id, entity_type, entity_id, type, actor_id, actor_type, message, meta)
     VALUES ${valuePlaceholders.join(', ')}`,
    values
  );

  return { accepted: events.length };
}
