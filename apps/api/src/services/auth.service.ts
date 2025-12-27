import { signDeviceToken, signUserToken } from '../lib/jwt.js';
import { verifyOidcToken } from '../lib/oidc.js';
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
  // Verify the OIDC ID token
  const tokenPayload = await verifyOidcToken(idToken);

  // Get org ID from environment (single-tenant for now)
  const orgId = process.env.DEFAULT_ORG_ID;
  if (!orgId) {
    throw new AppError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'CONFIG_ERROR',
      'DEFAULT_ORG_ID not configured'
    );
  }

  // Look up user by email
  const user = await usersRepository.findByEmailWithSiteAccess(tokenPayload.email, { orgId });
  if (!user) {
    logger.warn({ email: tokenPayload.email, orgId }, 'User login attempted but user not found');
    throw new AppError(
      HTTP_STATUS.FORBIDDEN,
      'USER_NOT_FOUND',
      'No account found for this email. Please contact your administrator.'
    );
  }

  logger.info({ userId: user.id, email: tokenPayload.email, orgId }, 'User authenticated via OIDC');

  // Generate internal JWT with user's role and site access
  const accessToken = await signUserToken(user.id, user.orgId, user.siteIds, user.role);

  return {
    userId: user.id,
    accessToken,
    expiresIn: JWT_EXPIRY.USER,
  };
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
