import { v4 as uuidv4 } from 'uuid';
import { query, withOrgContext } from '../db/index.js';
import { signDeviceToken, signUserToken } from '../lib/jwt.js';
import { AppError, NotFoundError } from '../middleware/error-handler.js';
import { JWT_EXPIRY, HTTP_STATUS } from '@360-imaging/shared';
import type { DeviceAuthRequest, DeviceAuthResponse, UserLoginResponse } from '@360-imaging/shared';

export async function authenticateDevice(params: DeviceAuthRequest): Promise<DeviceAuthResponse> {
  const { orgId, platform, model, appVersion } = params;

  // Verify org exists
  const orgResult = await query<{ id: string }>('SELECT id FROM organizations WHERE id = $1', [orgId]);

  if (orgResult.rowCount === 0) {
    throw new AppError(HTTP_STATUS.BAD_REQUEST, 'INVALID_ORG', 'Organization not found');
  }

  // Upsert device
  const deviceId = uuidv4();
  const result = await query<{ id: string }>(
    `INSERT INTO devices (id, org_id, platform, model, app_version, last_seen)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET
       app_version = EXCLUDED.app_version,
       last_seen = now()
     RETURNING id`,
    [deviceId, orgId, platform, model, appVersion]
  );

  const finalDeviceId = result.rows[0].id;
  const accessToken = await signDeviceToken(finalDeviceId, orgId);

  return {
    deviceId: finalDeviceId,
    accessToken,
    expiresIn: JWT_EXPIRY.DEVICE,
  };
}

export async function authenticateUser(idToken: string): Promise<UserLoginResponse> {
  // TODO: Implement OIDC token verification
  // For now, this is a placeholder that should be replaced with actual OIDC verification
  // using the configured OIDC provider (Auth0, Cognito, etc.)

  // 1. Verify the idToken with the OIDC provider
  // 2. Extract email and other claims from the token
  // 3. Look up the user in our database

  // Placeholder: In production, decode and verify the OIDC token
  // const decoded = await verifyOidcToken(idToken);
  // const email = decoded.email;

  throw new AppError(
    HTTP_STATUS.NOT_IMPLEMENTED,
    'NOT_IMPLEMENTED',
    'OIDC authentication not yet configured. Please set up your OIDC provider.'
  );

  // Example implementation once OIDC is configured:
  /*
  const userResult = await query<{ id: string; org_id: string; role: string }>(
    'SELECT id, org_id, role FROM users WHERE email = $1',
    [email]
  );

  if (userResult.rowCount === 0) {
    throw new AppError(HTTP_STATUS.FORBIDDEN, 'USER_NOT_FOUND', 'User not found in any organization');
  }

  const user = userResult.rows[0];

  // Get user's site access
  const sitesResult = await query<{ site_id: string }>(
    'SELECT site_id FROM user_site_access WHERE user_id = $1',
    [user.id]
  );

  const siteIds = sitesResult.rows.map(r => r.site_id);

  const accessToken = await signUserToken(user.id, user.org_id, siteIds, user.role);

  return {
    userId: user.id,
    accessToken,
    expiresIn: JWT_EXPIRY.USER,
  };
  */
}
