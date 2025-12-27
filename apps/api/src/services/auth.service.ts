import { signDeviceToken, signUserToken } from '../lib/jwt.js';
import { AppError } from '../middleware/error-handler.js';
import { JWT_EXPIRY, HTTP_STATUS } from '@360-imaging/shared';
import type { DeviceAuthRequest, DeviceAuthResponse, UserLoginResponse, Platform } from '@360-imaging/shared';
import { organizationsRepository, devicesRepository, usersRepository } from '../db/index.js';
import { logger } from '../lib/logger.js';

export async function authenticateDevice(params: DeviceAuthRequest): Promise<DeviceAuthResponse> {
  const { orgId, platform, model, appVersion } = params;

  // Verify org exists
  const orgExists = await organizationsRepository.exists(orgId);
  if (!orgExists) {
    logger.warn({ orgId }, 'Device auth attempted with invalid org');
    throw new AppError(HTTP_STATUS.BAD_REQUEST, 'INVALID_ORG', 'Organization not found');
  }

  // Find or create device
  const device = await devicesRepository.findOrCreate(
    orgId,
    platform as Platform,
    model,
    appVersion
  );

  logger.info({ deviceId: device.id, orgId, platform }, 'Device authenticated');

  // Generate JWT
  const accessToken = await signDeviceToken(device.id, orgId);

  return {
    deviceId: device.id,
    accessToken,
    expiresIn: JWT_EXPIRY.DEVICE,
  };
}

export async function authenticateUser(idToken: string): Promise<UserLoginResponse> {
  // TODO: Implement OIDC token verification with configured provider
  // For now, this is a placeholder. The OIDC provider must be configured
  // in environment variables (OIDC_ISSUER, OIDC_CLIENT_ID, etc.)

  const oidcIssuer = process.env.OIDC_ISSUER;
  if (!oidcIssuer) {
    throw new AppError(
      HTTP_STATUS.NOT_IMPLEMENTED,
      'NOT_IMPLEMENTED',
      'OIDC authentication not yet configured. Please set OIDC_ISSUER environment variable.'
    );
  }

  // In production, verify the idToken with the OIDC provider:
  // const decoded = await verifyOidcToken(idToken, oidcIssuer);
  // For now, we'll throw until OIDC is configured

  throw new AppError(
    HTTP_STATUS.NOT_IMPLEMENTED,
    'NOT_IMPLEMENTED',
    'OIDC token verification not yet implemented. Configure your OIDC provider.'
  );

  // Implementation pattern for when OIDC is ready:
  // 1. Verify token with OIDC provider
  // 2. Extract email from verified token
  // 3. Look up user with site access
  // 4. Generate app JWT
  //
  // const email = decoded.email;
  // const orgId = decoded.org_id || process.env.DEFAULT_ORG_ID;
  //
  // const user = await usersRepository.findByEmailWithSiteAccess(email, { orgId });
  // if (!user) {
  //   throw new AppError(HTTP_STATUS.FORBIDDEN, 'USER_NOT_FOUND', 'User not found');
  // }
  //
  // const accessToken = await signUserToken(user.id, user.orgId, user.siteIds, user.role);
  // return { userId: user.id, accessToken, expiresIn: JWT_EXPIRY.USER };
}

/**
 * Refresh a device token (called when approaching expiry)
 */
export async function refreshDeviceToken(
  deviceId: string,
  orgId: string
): Promise<DeviceAuthResponse> {
  // Verify device exists and update last_seen
  await devicesRepository.updateLastSeen(deviceId, orgId);

  // Generate new token
  const accessToken = await signDeviceToken(deviceId, orgId);

  return {
    deviceId,
    accessToken,
    expiresIn: JWT_EXPIRY.DEVICE,
  };
}
