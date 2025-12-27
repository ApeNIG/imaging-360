import * as jose from 'jose';
import { AppError } from '../middleware/error-handler.js';
import { HTTP_STATUS } from '@360-imaging/shared';
import { logger } from './logger.js';

export interface OidcTokenPayload {
  email: string;
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
}

// Cache JWKS per issuer for performance
const jwksCache = new Map<string, jose.JWTVerifyGetKey>();

function getJwks(issuer: string): jose.JWTVerifyGetKey {
  if (!jwksCache.has(issuer)) {
    const jwksUri = new URL('.well-known/jwks.json', issuer).toString();
    jwksCache.set(issuer, jose.createRemoteJWKSet(new URL(jwksUri)));
  }
  return jwksCache.get(issuer)!;
}

/**
 * Verify an OIDC ID token from Auth0
 *
 * @param idToken - The ID token to verify
 * @returns The verified token payload with email claim
 * @throws AppError if token is invalid or missing required claims
 */
export async function verifyOidcToken(idToken: string): Promise<OidcTokenPayload> {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;

  if (!issuer || !clientId) {
    throw new AppError(
      HTTP_STATUS.NOT_IMPLEMENTED,
      'NOT_IMPLEMENTED',
      'OIDC authentication not configured'
    );
  }

  try {
    const jwks = getJwks(issuer);

    const { payload } = await jose.jwtVerify(idToken, jwks, {
      issuer,
      audience: clientId,
    });

    // Ensure email claim exists
    if (!payload.email || typeof payload.email !== 'string') {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        'INVALID_TOKEN',
        'Token missing email claim'
      );
    }

    logger.debug({ sub: payload.sub, email: payload.email }, 'OIDC token verified');

    return {
      email: payload.email as string,
      sub: payload.sub!,
      iss: payload.iss!,
      aud: payload.aud!,
      exp: payload.exp!,
      iat: payload.iat!,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof jose.errors.JWTExpired) {
      logger.warn('OIDC token expired');
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        'INVALID_TOKEN',
        'Token has expired'
      );
    }

    if (error instanceof jose.errors.JWTClaimValidationFailed) {
      logger.warn({ error: (error as Error).message }, 'OIDC token validation failed');
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        'INVALID_TOKEN',
        'Token validation failed'
      );
    }

    logger.error({ error }, 'OIDC token verification error');
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      'INVALID_TOKEN',
      'Invalid or malformed token'
    );
  }
}
