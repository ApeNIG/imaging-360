import type { CreateEventRequest, ActorType, EntityType, EventType } from '@360-imaging/shared';
import { eventsRepository } from '../db/index.js';
import { logger } from '../lib/logger.js';

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

  const event = await eventsRepository.create({
    orgId,
    entityType: entityType as EntityType,
    entityId,
    type: type as EventType,
    actorId,
    actorType,
    message,
    meta,
  });

  logger.debug({ eventId: event.id, entityType, type }, 'Event created');

  return { id: event.id };
}

export async function createBatchEvents(params: CreateBatchEventsParams) {
  const { orgId, actorId, actorType, events } = params;

  if (events.length === 0) {
    return { accepted: 0 };
  }

  const mappedEvents = events.map((e) => ({
    orgId,
    entityType: e.entityType as EntityType,
    entityId: e.entityId,
    type: e.type as EventType,
    actorId,
    actorType,
    message: e.message,
    meta: e.meta,
  }));

  const count = await eventsRepository.createBatch(mappedEvents);

  logger.info({ count, actorId }, 'Batch events created');

  return { accepted: count };
}

export async function getEventsByEntity(
  entityType: EntityType,
  entityId: string,
  orgId: string
) {
  const events = await eventsRepository.findByEntity(entityType, entityId, { orgId });
  return { data: events, total: events.length };
}

export async function getSessionTimeline(sessionId: string, orgId: string) {
  const events = await eventsRepository.findSessionTimeline(sessionId, { orgId });
  return { data: events, total: events.length };
}
