import { NotFoundError } from '../middleware/error-handler.js';
import { DEFAULT_SHOT_LIST } from '@360-imaging/shared';
import type { SessionWithDetails, CaptureMode, SessionStatus, ShotList } from '@360-imaging/shared';
import {
  sessionsRepository,
  vehiclesRepository,
  eventsRepository,
  QueryOptions,
} from '../db/index.js';
import { logger } from '../lib/logger.js';

interface ListSessionsParams {
  orgId: string;
  siteId?: string;
  status?: SessionStatus;
  vehicleId?: string;
  limit: number;
  offset: number;
  userSiteIds?: string[];
}

interface CreateSessionParams {
  orgId: string;
  siteId: string;
  vehicle: { vin?: string; stock?: string };
  mode: CaptureMode;
  shotList?: ShotList;
  operatorId: string;
  deviceId: string;
}

interface UpdateSessionParams {
  sessionId: string;
  orgId: string;
  status?: SessionStatus;
}

export async function listSessions(params: ListSessionsParams) {
  const { orgId, siteId, status, vehicleId, limit, offset, userSiteIds } = params;

  const queryOpts: QueryOptions = { orgId, siteIds: userSiteIds };

  const sessions = await sessionsRepository.findFiltered(
    queryOpts,
    { siteId, status, vehicleId },
    { limit, offset }
  );

  const total = await sessionsRepository.count(queryOpts);

  return {
    data: sessions,
    total,
    limit,
    offset,
  };
}

export async function createSession(params: CreateSessionParams): Promise<SessionWithDetails> {
  const { orgId, siteId, vehicle, mode, shotList, operatorId, deviceId } = params;

  // Get or create vehicle
  const vehicleRecord = await vehiclesRepository.findOrCreate(
    orgId,
    siteId,
    vehicle.vin,
    vehicle.stock
  );

  // Create session with default shot list if not provided
  const finalShotList = shotList || (
    mode === 'studio360'
      ? { studio360: DEFAULT_SHOT_LIST.studio360 }
      : { stills: DEFAULT_SHOT_LIST.stills }
  );

  const session = await sessionsRepository.create(
    orgId,
    siteId,
    vehicleRecord.id,
    mode,
    operatorId,
    deviceId,
    finalShotList
  );

  // Log session start event
  await eventsRepository.create({
    orgId,
    entityType: 'session',
    entityId: session.id,
    type: 'session_started',
    actorId: operatorId,
    actorType: 'user',
    meta: { mode, vehicleId: vehicleRecord.id },
  });

  logger.info({ sessionId: session.id, mode, vehicleId: vehicleRecord.id }, 'Session created');

  // Return with details
  return sessionsRepository.findByIdWithDetails(session.id, { orgId }) as Promise<SessionWithDetails>;
}

export async function getSession(params: { sessionId: string; orgId: string }): Promise<SessionWithDetails> {
  const { sessionId, orgId } = params;

  const session = await sessionsRepository.findByIdWithDetails(sessionId, { orgId });

  if (!session) {
    throw new NotFoundError('Session');
  }

  return session;
}

export async function updateSession(params: UpdateSessionParams): Promise<SessionWithDetails> {
  const { sessionId, orgId, status } = params;

  if (!status) {
    return getSession({ sessionId, orgId });
  }

  const updated = await sessionsRepository.updateStatus(sessionId, status, { orgId });

  if (!updated) {
    throw new NotFoundError('Session');
  }

  // Log status change event
  const eventType = status === 'complete' ? 'session_completed' :
                    status === 'abandoned' ? 'session_abandoned' : null;

  if (eventType) {
    await eventsRepository.create({
      orgId,
      entityType: 'session',
      entityId: sessionId,
      type: eventType,
      actorType: 'system',
    });
  }

  logger.info({ sessionId, status }, 'Session status updated');

  return sessionsRepository.findByIdWithDetails(sessionId, { orgId }) as Promise<SessionWithDetails>;
}

export async function getActiveSessionsForDevice(
  deviceId: string,
  orgId: string
): Promise<SessionWithDetails[]> {
  const sessions = await sessionsRepository.findActiveByDevice(deviceId, { orgId });

  // Get details for each session
  const detailed = await Promise.all(
    sessions.map(s => sessionsRepository.findByIdWithDetails(s.id, { orgId }))
  );

  return detailed.filter(Boolean) as SessionWithDetails[];
}
