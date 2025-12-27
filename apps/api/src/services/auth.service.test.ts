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

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import mocked modules
import { organizationsRepository, devicesRepository } from '../db/index.js';
import { signDeviceToken } from '../lib/jwt.js';

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

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should throw NOT_IMPLEMENTED when OIDC_ISSUER is not set', async () => {
      delete process.env.OIDC_ISSUER;

      await expect(authenticateUser('some-id-token')).rejects.toThrow(AppError);
      await expect(authenticateUser('some-id-token')).rejects.toMatchObject({
        statusCode: HTTP_STATUS.NOT_IMPLEMENTED,
        code: 'NOT_IMPLEMENTED',
        message: expect.stringContaining('OIDC authentication not yet configured'),
      });
    });

    it('should throw NOT_IMPLEMENTED when OIDC_ISSUER is set but verification not implemented', async () => {
      process.env.OIDC_ISSUER = 'https://auth.example.com';

      await expect(authenticateUser('some-id-token')).rejects.toThrow(AppError);
      await expect(authenticateUser('some-id-token')).rejects.toMatchObject({
        statusCode: HTTP_STATUS.NOT_IMPLEMENTED,
        code: 'NOT_IMPLEMENTED',
        message: expect.stringContaining('OIDC token verification not yet implemented'),
      });
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
