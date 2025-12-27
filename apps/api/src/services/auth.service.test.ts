import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authenticateDevice, authenticateUser, refreshDeviceToken } from './auth.service.js';
import { AppError } from '../middleware/error-handler.js';
import { HTTP_STATUS, JWT_EXPIRY } from '@360-imaging/shared';

// Mock dependencies
vi.mock('../db/index.js', () => ({
  organizationsRepository: {
    exists: vi.fn(),
  },
  devicesRepository: {
    findOrCreate: vi.fn(),
    updateLastSeen: vi.fn(),
  },
  usersRepository: {
    findByEmailWithSiteAccess: vi.fn(),
  },
}));

vi.mock('../lib/jwt.js', () => ({
  signDeviceToken: vi.fn(),
  signUserToken: vi.fn(),
}));

vi.mock('../lib/oidc.js', () => ({
  verifyOidcToken: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import mocked modules
import { organizationsRepository, devicesRepository, usersRepository } from '../db/index.js';
import { signDeviceToken, signUserToken } from '../lib/jwt.js';
import { verifyOidcToken } from '../lib/oidc.js';

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticateDevice', () => {
    const validRequest = {
      orgId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'ios' as const,
      model: 'iPhone 15 Pro',
      appVersion: '1.0.0',
    };

    const mockDevice = {
      id: 'device-123',
      orgId: validRequest.orgId,
      platform: validRequest.platform,
      model: validRequest.model,
      appVersion: validRequest.appVersion,
      registeredAt: new Date(),
      lastSeen: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should authenticate device successfully when org exists', async () => {
      const mockToken = 'mock.jwt.token';

      vi.mocked(organizationsRepository.exists).mockResolvedValue(true);
      vi.mocked(devicesRepository.findOrCreate).mockResolvedValue(mockDevice);
      vi.mocked(signDeviceToken).mockResolvedValue(mockToken);

      const result = await authenticateDevice(validRequest);

      expect(organizationsRepository.exists).toHaveBeenCalledWith(validRequest.orgId);
      expect(devicesRepository.findOrCreate).toHaveBeenCalledWith(
        validRequest.orgId,
        validRequest.platform,
        validRequest.model,
        validRequest.appVersion
      );
      expect(signDeviceToken).toHaveBeenCalledWith(mockDevice.id, validRequest.orgId);

      expect(result).toEqual({
        deviceId: mockDevice.id,
        accessToken: mockToken,
        expiresIn: JWT_EXPIRY.DEVICE,
      });
    });

    it('should throw error when organization does not exist', async () => {
      vi.mocked(organizationsRepository.exists).mockResolvedValue(false);

      await expect(authenticateDevice(validRequest)).rejects.toThrow(AppError);
      await expect(authenticateDevice(validRequest)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: 'INVALID_ORG',
      });

      expect(devicesRepository.findOrCreate).not.toHaveBeenCalled();
      expect(signDeviceToken).not.toHaveBeenCalled();
    });

    it('should handle different platforms', async () => {
      const platforms = ['ios', 'android', 'edge'] as const;

      for (const platform of platforms) {
        vi.clearAllMocks();

        const request = { ...validRequest, platform };
        const device = { ...mockDevice, platform };

        vi.mocked(organizationsRepository.exists).mockResolvedValue(true);
        vi.mocked(devicesRepository.findOrCreate).mockResolvedValue(device);
        vi.mocked(signDeviceToken).mockResolvedValue('token');

        const result = await authenticateDevice(request);

        expect(devicesRepository.findOrCreate).toHaveBeenCalledWith(
          request.orgId,
          platform,
          request.model,
          request.appVersion
        );
        expect(result.deviceId).toBe(device.id);
      }
    });

    it('should propagate database errors', async () => {
      vi.mocked(organizationsRepository.exists).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(authenticateDevice(validRequest)).rejects.toThrow('Database connection failed');
    });

    it('should propagate JWT signing errors', async () => {
      vi.mocked(organizationsRepository.exists).mockResolvedValue(true);
      vi.mocked(devicesRepository.findOrCreate).mockResolvedValue(mockDevice);
      vi.mocked(signDeviceToken).mockRejectedValue(new Error('JWT signing failed'));

      await expect(authenticateDevice(validRequest)).rejects.toThrow('JWT signing failed');
    });
  });

  describe('authenticateUser', () => {
    const originalEnv = process.env;

    const mockTokenPayload = {
      email: 'user@example.com',
      sub: 'auth0|123456',
      iss: 'https://auth.example.com/',
      aud: 'client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };

    const mockUser = {
      id: 'user-123',
      orgId: 'org-456',
      email: 'user@example.com',
      name: 'Test User',
      role: 'operator' as const,
      siteIds: ['site-1', 'site-2'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      process.env = { ...originalEnv };
      process.env.DEFAULT_ORG_ID = 'org-456';
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should authenticate user successfully when token is valid and user exists', async () => {
      const mockToken = 'mock.jwt.token';

      vi.mocked(verifyOidcToken).mockResolvedValue(mockTokenPayload);
      vi.mocked(usersRepository.findByEmailWithSiteAccess).mockResolvedValue(mockUser);
      vi.mocked(signUserToken).mockResolvedValue(mockToken);

      const result = await authenticateUser('valid-id-token');

      expect(verifyOidcToken).toHaveBeenCalledWith('valid-id-token');
      expect(usersRepository.findByEmailWithSiteAccess).toHaveBeenCalledWith(
        mockTokenPayload.email,
        { orgId: 'org-456' }
      );
      expect(signUserToken).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.orgId,
        mockUser.siteIds,
        mockUser.role
      );

      expect(result).toEqual({
        userId: mockUser.id,
        accessToken: mockToken,
        expiresIn: JWT_EXPIRY.USER,
      });
    });

    it('should throw CONFIG_ERROR when DEFAULT_ORG_ID is not set', async () => {
      delete process.env.DEFAULT_ORG_ID;
      vi.mocked(verifyOidcToken).mockResolvedValue(mockTokenPayload);

      await expect(authenticateUser('valid-id-token')).rejects.toThrow(AppError);
      await expect(authenticateUser('valid-id-token')).rejects.toMatchObject({
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: 'CONFIG_ERROR',
      });
    });

    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      vi.mocked(verifyOidcToken).mockResolvedValue(mockTokenPayload);
      vi.mocked(usersRepository.findByEmailWithSiteAccess).mockResolvedValue(null);

      await expect(authenticateUser('valid-id-token')).rejects.toThrow(AppError);
      await expect(authenticateUser('valid-id-token')).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: 'USER_NOT_FOUND',
      });

      expect(signUserToken).not.toHaveBeenCalled();
    });

    it('should propagate OIDC verification errors', async () => {
      const oidcError = new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        'INVALID_TOKEN',
        'Token has expired'
      );
      vi.mocked(verifyOidcToken).mockRejectedValue(oidcError);

      await expect(authenticateUser('expired-token')).rejects.toThrow(AppError);
      await expect(authenticateUser('expired-token')).rejects.toMatchObject({
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        code: 'INVALID_TOKEN',
      });

      expect(usersRepository.findByEmailWithSiteAccess).not.toHaveBeenCalled();
    });
  });

  describe('refreshDeviceToken', () => {
    const deviceId = 'device-123';
    const orgId = '550e8400-e29b-41d4-a716-446655440000';

    it('should refresh token successfully', async () => {
      const mockToken = 'new.jwt.token';

      vi.mocked(devicesRepository.updateLastSeen).mockResolvedValue(undefined);
      vi.mocked(signDeviceToken).mockResolvedValue(mockToken);

      const result = await refreshDeviceToken(deviceId, orgId);

      expect(devicesRepository.updateLastSeen).toHaveBeenCalledWith(deviceId, orgId);
      expect(signDeviceToken).toHaveBeenCalledWith(deviceId, orgId);

      expect(result).toEqual({
        deviceId,
        accessToken: mockToken,
        expiresIn: JWT_EXPIRY.DEVICE,
      });
    });

    it('should propagate errors from updateLastSeen', async () => {
      vi.mocked(devicesRepository.updateLastSeen).mockRejectedValue(
        new Error('Device not found')
      );

      await expect(refreshDeviceToken(deviceId, orgId)).rejects.toThrow('Device not found');
      expect(signDeviceToken).not.toHaveBeenCalled();
    });
  });
});
