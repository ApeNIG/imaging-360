import { Router } from 'express';
import { authenticate, requireUser } from '../middleware/auth.js';
import { sitesRepository } from '../db/repositories/index.js';
import type { UserJwtPayload } from '@360-imaging/shared';
import { HTTP_STATUS } from '@360-imaging/shared';

export const sitesRouter = Router();

// All sites routes require user authentication
sitesRouter.use(authenticate, requireUser);

/**
 * GET /sites - Get all accessible sites
 */
sitesRouter.get('/', async (req, res) => {
  const auth = req.auth as UserJwtPayload;

  try {
    let sites;

    // Admin gets all sites in org, others get their accessible sites
    if (auth.role === 'admin') {
      sites = await sitesRepository.findAllInOrg({ orgId: auth.orgId });
    } else {
      sites = await sitesRepository.findAccessibleByUser(auth.sub, {
        orgId: auth.orgId,
      });
    }

    return res.json({
      data: sites,
      meta: {
        total: sites.length,
      },
    });
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch sites',
      },
      requestId: req.requestId,
    });
  }
});

/**
 * GET /sites/:id - Get site by ID
 */
sitesRouter.get('/:id', async (req, res) => {
  const auth = req.auth as UserJwtPayload;
  const { id } = req.params;

  try {
    // Check user has access
    if (auth.role !== 'admin' && !auth.siteIds.includes(id)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: {
          code: 'FORBIDDEN',
          message: 'No access to this site',
        },
        requestId: req.requestId,
      });
    }

    const site = await sitesRepository.findById(id, { orgId: auth.orgId });

    if (!site) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Site not found',
        },
        requestId: req.requestId,
      });
    }

    return res.json(site);
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch site',
      },
      requestId: req.requestId,
    });
  }
});

/**
 * GET /sites/:id/stats - Get site statistics
 */
sitesRouter.get('/:id/stats', async (req, res) => {
  const auth = req.auth as UserJwtPayload;
  const { id } = req.params;

  try {
    // Check user has access
    if (auth.role !== 'admin' && !auth.siteIds.includes(id)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: {
          code: 'FORBIDDEN',
          message: 'No access to this site',
        },
        requestId: req.requestId,
      });
    }

    const stats = await sitesRepository.getStats(id, { orgId: auth.orgId });
    return res.json(stats);
  } catch (error) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch site stats',
      },
      requestId: req.requestId,
    });
  }
});
