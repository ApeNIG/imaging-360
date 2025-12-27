import * as jose from 'jose';
import type { DeviceJwtPayload, UserJwtPayload } from '@360-imaging/shared';
import { JWT_EXPIRY } from '@360-imaging/shared';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'development-secret-min-32-chars!');
const JWT_ISSUER = 'imaging-api';
const JWT_AUDIENCE = 'imaging-app';

export async function signDeviceToken(deviceId: string, orgId: string): Promise<string> {
  return new jose.SignJWT({ orgId, role: 'device' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(deviceId)
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(`${JWT_EXPIRY.DEVICE}s`)
    .sign(JWT_SECRET);
}

export async function signUserToken(
  userId: string,
  orgId: string,
  siteIds: string[],
  role: string
): Promise<string> {
  return new jose.SignJWT({ orgId, siteIds, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(`${JWT_EXPIRY.USER}s`)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<DeviceJwtPayload | UserJwtPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  return payload as unknown as DeviceJwtPayload | UserJwtPayload;
}
