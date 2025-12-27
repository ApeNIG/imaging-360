import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signDeviceToken, signUserToken, verifyToken } from './jwt.js';
import { JWT_EXPIRY } from '@360-imaging/shared';
import * as jose from 'jose';

describe('JWT Library', () => {
  const deviceId = 'device-123';
  const userId = 'user-456';
  const orgId = 'org-789';
  const siteIds = ['site-1', 'site-2'];

  describe('signDeviceToken', () => {
    it('should create a valid JWT for device', async () => {
      const token = await signDeviceToken(deviceId, orgId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should include device claims in token', async () => {
      const token = await signDeviceToken(deviceId, orgId);
      const payload = await verifyToken(token);

      expect(payload.sub).toBe(deviceId);
      expect(payload.orgId).toBe(orgId);
      expect(payload.role).toBe('device');
    });

    it('should set correct expiration time', async () => {
      const token = await signDeviceToken(deviceId, orgId);
      const payload = await verifyToken(token);

      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + JWT_EXPIRY.DEVICE;

      // Allow 5 seconds tolerance
      expect(payload.exp).toBeGreaterThan(now);
      expect(payload.exp).toBeLessThanOrEqual(expectedExp + 5);
    });

    it('should include issued at timestamp', async () => {
      const token = await signDeviceToken(deviceId, orgId);
      const payload = await verifyToken(token);

      const now = Math.floor(Date.now() / 1000);

      expect(payload.iat).toBeDefined();
      expect(payload.iat).toBeLessThanOrEqual(now + 1);
      expect(payload.iat).toBeGreaterThan(now - 5);
    });
  });

  describe('signUserToken', () => {
    it('should create a valid JWT for user', async () => {
      const token = await signUserToken(userId, orgId, siteIds, 'admin');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include user claims in token', async () => {
      const token = await signUserToken(userId, orgId, siteIds, 'admin');
      const payload = await verifyToken(token);

      expect(payload.sub).toBe(userId);
      expect(payload.orgId).toBe(orgId);
      expect(payload.role).toBe('admin');
    });

    it('should include siteIds in token', async () => {
      const token = await signUserToken(userId, orgId, siteIds, 'reviewer');
      const payload = await verifyToken(token) as { siteIds: string[] };

      expect(payload.siteIds).toEqual(siteIds);
    });

    it('should handle different roles', async () => {
      const roles = ['admin', 'reviewer', 'operator'];

      for (const role of roles) {
        const token = await signUserToken(userId, orgId, siteIds, role);
        const payload = await verifyToken(token);

        expect(payload.role).toBe(role);
      }
    });

    it('should set correct expiration time for user', async () => {
      const token = await signUserToken(userId, orgId, siteIds, 'admin');
      const payload = await verifyToken(token);

      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + JWT_EXPIRY.USER;

      expect(payload.exp).toBeGreaterThan(now);
      expect(payload.exp).toBeLessThanOrEqual(expectedExp + 5);
    });

    it('should handle empty siteIds array', async () => {
      const token = await signUserToken(userId, orgId, [], 'admin');
      const payload = await verifyToken(token) as { siteIds: string[] };

      expect(payload.siteIds).toEqual([]);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid device token', async () => {
      const token = await signDeviceToken(deviceId, orgId);
      const payload = await verifyToken(token);

      expect(payload).toBeDefined();
      expect(payload.sub).toBe(deviceId);
    });

    it('should verify valid user token', async () => {
      const token = await signUserToken(userId, orgId, siteIds, 'admin');
      const payload = await verifyToken(token);

      expect(payload).toBeDefined();
      expect(payload.sub).toBe(userId);
    });

    it('should reject malformed token', async () => {
      await expect(verifyToken('invalid.token')).rejects.toThrow();
    });

    it('should reject token with invalid signature', async () => {
      const token = await signDeviceToken(deviceId, orgId);
      // Tamper with the signature
      const parts = token.split('.');
      parts[2] = 'invalid-signature';
      const tamperedToken = parts.join('.');

      await expect(verifyToken(tamperedToken)).rejects.toThrow();
    });

    it('should reject empty token', async () => {
      await expect(verifyToken('')).rejects.toThrow();
    });

    it('should reject token with wrong issuer', async () => {
      // Create a token with wrong issuer using jose directly
      const secret = new TextEncoder().encode('development-secret-min-32-chars!');

      const wrongIssuerToken = await new jose.SignJWT({ orgId, role: 'device' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(deviceId)
        .setIssuedAt()
        .setIssuer('wrong-issuer')
        .setAudience('imaging-app')
        .setExpirationTime('1h')
        .sign(secret);

      await expect(verifyToken(wrongIssuerToken)).rejects.toThrow();
    });

    it('should reject token with wrong audience', async () => {
      const secret = new TextEncoder().encode('development-secret-min-32-chars!');

      const wrongAudienceToken = await new jose.SignJWT({ orgId, role: 'device' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(deviceId)
        .setIssuedAt()
        .setIssuer('imaging-api')
        .setAudience('wrong-audience')
        .setExpirationTime('1h')
        .sign(secret);

      await expect(verifyToken(wrongAudienceToken)).rejects.toThrow();
    });
  });

  describe('Token round-trip', () => {
    it('should sign and verify device token successfully', async () => {
      const token = await signDeviceToken(deviceId, orgId);
      const payload = await verifyToken(token);

      expect(payload.sub).toBe(deviceId);
      expect(payload.orgId).toBe(orgId);
      expect(payload.role).toBe('device');
    });

    it('should sign and verify user token successfully', async () => {
      const token = await signUserToken(userId, orgId, siteIds, 'reviewer');
      const payload = await verifyToken(token) as { sub: string; orgId: string; siteIds: string[]; role: string };

      expect(payload.sub).toBe(userId);
      expect(payload.orgId).toBe(orgId);
      expect(payload.siteIds).toEqual(siteIds);
      expect(payload.role).toBe('reviewer');
    });
  });
});
