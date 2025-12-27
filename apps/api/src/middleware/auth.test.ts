import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { authenticate, requireUser, requireRole, requireSiteAccess } from './auth.js';
import { HTTP_STATUS } from '@360-imaging/shared';
import type { DeviceJwtPayload, UserJwtPayload } from '@360-imaging/shared';

// Mock jwt module
vi.mock('../lib/jwt.js', () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from '../lib/jwt.js';

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: ReturnType<typeof vi.fn>;

  const mockDevicePayload: DeviceJwtPayload = {
    sub: 'device-123',
    orgId: 'org-456',
    role: 'device',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };

  const mockUserPayload: UserJwtPayload = {
    sub: 'user-123',
    orgId: 'org-456',
    siteIds: ['site-1', 'site-2'],
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      headers: {},
      requestId: 'test-request-id',
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('authenticate', () => {
    it('should reject request without authorization header', async () => {
      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.UNAUTHORIZED);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
        requestId: 'test-request-id',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with non-Bearer authorization', async () => {
      mockReq.headers = { authorization: 'Basic dXNlcjpwYXNz' };

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.UNAUTHORIZED);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with empty Bearer token', async () => {
      mockReq.headers = { authorization: 'Bearer ' };

      vi.mocked(verifyToken).mockRejectedValue(new Error('Invalid token'));

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.UNAUTHORIZED);
    });

    it('should authenticate valid device token', async () => {
      mockReq.headers = { authorization: 'Bearer valid.device.token' };
      vi.mocked(verifyToken).mockResolvedValue(mockDevicePayload);

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(verifyToken).toHaveBeenCalledWith('valid.device.token');
      expect(mockReq.auth).toEqual(mockDevicePayload);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should authenticate valid user token', async () => {
      mockReq.headers = { authorization: 'Bearer valid.user.token' };
      vi.mocked(verifyToken).mockResolvedValue(mockUserPayload);

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.auth).toEqual(mockUserPayload);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject expired token', async () => {
      mockReq.headers = { authorization: 'Bearer expired.token' };
      vi.mocked(verifyToken).mockRejectedValue(new Error('Token expired'));

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.UNAUTHORIZED);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        },
        requestId: 'test-request-id',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockReq.headers = { authorization: 'Bearer invalid.token' };
      vi.mocked(verifyToken).mockRejectedValue(new Error('Invalid signature'));

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.UNAUTHORIZED);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireUser', () => {
    it('should reject request without auth', () => {
      requireUser(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'User authentication required',
        },
        requestId: 'test-request-id',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject device token', () => {
      mockReq.auth = mockDevicePayload;

      requireUser(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow user token', () => {
      mockReq.auth = mockUserPayload;

      requireUser(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow any user role', () => {
      const roles = ['admin', 'reviewer', 'operator'] as const;

      for (const role of roles) {
        vi.clearAllMocks();
        mockReq.auth = { ...mockUserPayload, role };

        requireUser(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      }
    });
  });

  describe('requireRole', () => {
    it('should reject request without auth', () => {
      const middleware = requireRole('admin');

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject device token', () => {
      mockReq.auth = mockDevicePayload;
      const middleware = requireRole('admin');

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
    });

    it('should allow user with required role', () => {
      mockReq.auth = { ...mockUserPayload, role: 'admin' };
      const middleware = requireRole('admin');

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject user without required role', () => {
      mockReq.auth = { ...mockUserPayload, role: 'operator' };
      const middleware = requireRole('admin');

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'Required role: admin',
        },
        requestId: 'test-request-id',
      });
    });

    it('should allow any of multiple roles', () => {
      const middleware = requireRole('admin', 'reviewer');

      mockReq.auth = { ...mockUserPayload, role: 'admin' };
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      vi.clearAllMocks();
      mockReq.auth = { ...mockUserPayload, role: 'reviewer' };
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject if none of multiple roles match', () => {
      mockReq.auth = { ...mockUserPayload, role: 'operator' };
      const middleware = requireRole('admin', 'reviewer');

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'Required role: admin or reviewer',
        },
        requestId: 'test-request-id',
      });
    });
  });

  describe('requireSiteAccess', () => {
    const getSiteId = (req: Request) => req.params?.siteId;

    it('should allow request when no siteId in request', () => {
      mockReq.params = {};
      mockReq.auth = mockUserPayload;
      const middleware = requireSiteAccess(getSiteId);

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow device token (devices are org-scoped)', () => {
      mockReq.params = { siteId: 'site-1' };
      mockReq.auth = mockDevicePayload;
      const middleware = requireSiteAccess(getSiteId);

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow user with access to site', () => {
      mockReq.params = { siteId: 'site-1' };
      mockReq.auth = mockUserPayload;
      const middleware = requireSiteAccess(getSiteId);

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject user without access to site', () => {
      mockReq.params = { siteId: 'site-other' };
      mockReq.auth = mockUserPayload;
      const middleware = requireSiteAccess(getSiteId);

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'FORBIDDEN',
          message: 'No access to this site',
        },
        requestId: 'test-request-id',
      });
    });

    it('should work with custom siteId extractor', () => {
      const customExtractor = (req: Request) => req.body?.siteId;
      mockReq.body = { siteId: 'site-2' };
      mockReq.auth = mockUserPayload;
      const middleware = requireSiteAccess(customExtractor);

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow when no auth (devices pass through)', () => {
      mockReq.params = { siteId: 'site-1' };
      // No auth set
      const middleware = requireSiteAccess(getSiteId);

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
