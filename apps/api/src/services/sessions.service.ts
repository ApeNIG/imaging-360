import { v4 as uuidv4 } from 'uuid';
import { query, withOrgContext } from '../db/index.js';
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { DEFAULT_SHOT_LIST } from '@360-imaging/shared';
import type { Session, SessionWithDetails, CaptureMode, SessionStatus, ShotList } from '@360-imaging/shared';

interface ListSessionsParams {
  orgId: string;
  siteId?: string;
  status?: string;
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
  completedAt?: Date;
  abandonedAt?: Date;
}

export async function listSessions(params: ListSessionsParams) {
  const { orgId, siteId, status, vehicleId, limit, offset, userSiteIds } = params;

  let whereClause = 'WHERE s.org_id = $1';
  const queryParams: unknown[] = [orgId];
  let paramIndex = 2;

  if (siteId) {
    whereClause += ` AND s.site_id = $${paramIndex}`;
    queryParams.push(siteId);
    paramIndex++;
  }

  if (status) {
    whereClause += ` AND s.status = $${paramIndex}`;
    queryParams.push(status);
    paramIndex++;
  }

  if (vehicleId) {
    whereClause += ` AND s.vehicle_id = $${paramIndex}`;
    queryParams.push(vehicleId);
    paramIndex++;
  }

  // Filter by user's accessible sites
  if (userSiteIds && userSiteIds.length > 0) {
    whereClause += ` AND s.site_id = ANY($${paramIndex})`;
    queryParams.push(userSiteIds);
    paramIndex++;
  }

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM sessions s ${whereClause}`,
    queryParams
  );

  const total = parseInt(countResult.rows[0].count, 10);

  queryParams.push(limit, offset);

  const result = await query<SessionWithDetails>(
    `SELECT
      s.*,
      v.vin, v.stock,
      u.name as operator_name,
      si.name as site_name,
      (SELECT COUNT(*) FROM images WHERE session_id = s.id) as image_count
     FROM sessions s
     LEFT JOIN vehicles v ON s.vehicle_id = v.id
     LEFT JOIN users u ON s.operator_id = u.id
     LEFT JOIN sites si ON s.site_id = si.id
     ${whereClause}
     ORDER BY s.status = 'active' DESC, s.started_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    queryParams
  );

  return {
    data: result.rows.map(mapSessionRow),
    total,
    limit,
    offset,
  };
}

export async function createSession(params: CreateSessionParams) {
  const { orgId, siteId, vehicle, mode, shotList, operatorId, deviceId } = params;

  // Get or create vehicle
  let vehicleId: string;

  if (vehicle.vin) {
    const existingVehicle = await query<{ id: string }>(
      'SELECT id FROM vehicles WHERE org_id = $1 AND vin = $2',
      [orgId, vehicle.vin]
    );

    if (existingVehicle.rowCount && existingVehicle.rowCount > 0) {
      vehicleId = existingVehicle.rows[0].id;
    } else {
      vehicleId = uuidv4();
      await query(
        `INSERT INTO vehicles (id, org_id, site_id, vin, stock)
         VALUES ($1, $2, $3, $4, $5)`,
        [vehicleId, orgId, siteId, vehicle.vin, vehicle.stock || null]
      );
    }
  } else {
    // Use stock number
    const existingVehicle = await query<{ id: string }>(
      'SELECT id FROM vehicles WHERE org_id = $1 AND site_id = $2 AND stock = $3',
      [orgId, siteId, vehicle.stock]
    );

    if (existingVehicle.rowCount && existingVehicle.rowCount > 0) {
      vehicleId = existingVehicle.rows[0].id;
    } else {
      vehicleId = uuidv4();
      await query(
        `INSERT INTO vehicles (id, org_id, site_id, stock)
         VALUES ($1, $2, $3, $4)`,
        [vehicleId, orgId, siteId, vehicle.stock]
      );
    }
  }

  // Create session
  const sessionId = uuidv4();
  const finalShotList = shotList || (mode === 'studio360' ? { studio360: DEFAULT_SHOT_LIST.studio360 } : { stills: DEFAULT_SHOT_LIST.stills });

  const result = await query<Session>(
    `INSERT INTO sessions (id, org_id, site_id, vehicle_id, mode, shot_list, operator_id, device_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [sessionId, orgId, siteId, vehicleId, mode, JSON.stringify(finalShotList), operatorId, deviceId]
  );

  return mapSessionRow(result.rows[0]);
}

export async function getSession(params: { sessionId: string; orgId: string }) {
  const { sessionId, orgId } = params;

  const result = await query<SessionWithDetails>(
    `SELECT
      s.*,
      v.vin, v.stock, v.meta as vehicle_meta,
      u.id as operator_id, u.name as operator_name,
      si.id as site_id, si.name as site_name,
      d.id as device_id, d.model as device_model
     FROM sessions s
     LEFT JOIN vehicles v ON s.vehicle_id = v.id
     LEFT JOIN users u ON s.operator_id = u.id
     LEFT JOIN sites si ON s.site_id = si.id
     LEFT JOIN devices d ON s.device_id = d.id
     WHERE s.id = $1 AND s.org_id = $2`,
    [sessionId, orgId]
  );

  if (result.rowCount === 0) {
    throw new NotFoundError('Session');
  }

  return mapSessionRow(result.rows[0]);
}

export async function updateSession(params: UpdateSessionParams) {
  const { sessionId, orgId, status, completedAt, abandonedAt } = params;

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    updates.push(`status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  if (completedAt) {
    updates.push(`completed_at = $${paramIndex}`);
    values.push(completedAt);
    paramIndex++;
  }

  if (abandonedAt) {
    updates.push(`abandoned_at = $${paramIndex}`);
    values.push(abandonedAt);
    paramIndex++;
  }

  if (updates.length === 0) {
    return getSession({ sessionId, orgId });
  }

  values.push(sessionId, orgId);

  const result = await query<Session>(
    `UPDATE sessions SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND org_id = $${paramIndex + 1}
     RETURNING *`,
    values
  );

  if (result.rowCount === 0) {
    throw new NotFoundError('Session');
  }

  return mapSessionRow(result.rows[0]);
}

function mapSessionRow(row: any): SessionWithDetails {
  return {
    id: row.id,
    orgId: row.org_id,
    siteId: row.site_id,
    vehicleId: row.vehicle_id,
    mode: row.mode,
    shotList: row.shot_list,
    operatorId: row.operator_id,
    deviceId: row.device_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    abandonedAt: row.abandoned_at,
    vehicle: row.vin || row.stock ? {
      id: row.vehicle_id,
      vin: row.vin,
      stock: row.stock,
      orgId: row.org_id,
      siteId: row.site_id,
      meta: row.vehicle_meta || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : undefined,
    operator: row.operator_name ? {
      id: row.operator_id,
      name: row.operator_name,
    } : undefined,
    site: row.site_name ? {
      id: row.site_id,
      name: row.site_name,
    } : undefined,
    imageCount: row.image_count ? parseInt(row.image_count, 10) : undefined,
  };
}
