import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.js';
import type { DeviceJwtPayload, UserJwtPayload, UserRole } from '@360-imaging/shared';
import { HTTP_STATUS } from '@360-imaging/shared';

declare global {
  namespace Express {
    interface Request {
      auth?: DeviceJwtPayload | UserJwtPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      },
      requestId: req.requestId,
    });
  }

  const token = authHeader.slice(7);

  try {
    req.auth = await verifyToken(token);
    next();
  } catch (error) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      },
      requestId: req.requestId,
    });
  }
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || req.auth.role === 'device') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      error: {
        code: 'FORBIDDEN',
        message: 'User authentication required',
      },
      requestId: req.requestId,
    });
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || req.auth.role === 'device') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: {
          code: 'FORBIDDEN',
          message: 'User authentication required',
        },
        requestId: req.requestId,
      });
    }

    if (!roles.includes(req.auth.role as UserRole)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: {
          code: 'FORBIDDEN',
          message: `Required role: ${roles.join(' or ')}`,
        },
        requestId: req.requestId,
      });
    }

    next();
  };
}

// Check if user has access to a specific site
export function requireSiteAccess(getSiteId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    const siteId = getSiteId(req);

    if (!siteId) {
      return next();
    }

    if (!req.auth || req.auth.role === 'device') {
      // Devices are org-scoped, not site-scoped
      return next();
    }

    const userAuth = req.auth as UserJwtPayload;

    if (!userAuth.siteIds.includes(siteId)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: {
          code: 'FORBIDDEN',
          message: 'No access to this site',
        },
        requestId: req.requestId,
      });
    }

    next();
  };
}
