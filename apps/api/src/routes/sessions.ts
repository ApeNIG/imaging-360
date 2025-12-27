import { Router, type Router as RouterType } from 'express';
import { authenticate, requireSiteAccess } from '../middleware/auth.js';
import { defaultRateLimit } from '../middleware/rate-limit.js';
import * as sessionsService from '../services/sessions.service.js';
import { ValidationError } from '../middleware/error-handler.js';
import { validateCreateSession, HTTP_STATUS } from '@360-imaging/shared';
import type { SessionStatus } from '@360-imaging/shared';

export const sessionsRouter: RouterType = Router();

// All routes require authentication
sessionsRouter.use(authenticate);
sessionsRouter.use(defaultRateLimit);

// GET /sessions - List sessions
sessionsRouter.get('/', async (req, res, next) => {
  try {
    const { siteId, status, vehicleId, limit, offset } = req.query;

    const sessions = await sessionsService.listSessions({
      orgId: req.auth!.orgId,
      siteId: siteId as string | undefined,
      status: status as SessionStatus | undefined,
      vehicleId: vehicleId as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
      userSiteIds: req.auth!.role !== 'device' ? (req.auth as any).siteIds : undefined,
    });

    res.status(HTTP_STATUS.OK).json(sessions);
  } catch (error) {
    next(error);
  }
});

// POST /sessions - Create session
sessionsRouter.post(
  '/',
  requireSiteAccess((req) => req.body.siteId),
  async (req, res, next) => {
    try {
      const validation = validateCreateSession(req.body);

      if (!validation.valid) {
        throw new ValidationError('Invalid request', { errors: validation.errors });
      }

      const session = await sessionsService.createSession({
        orgId: req.auth!.orgId,
        siteId: req.body.siteId,
        vehicle: req.body.vehicle,
        mode: req.body.mode,
        shotList: req.body.shotList,
        operatorId: req.auth!.sub,
        deviceId: req.auth!.role === 'device' ? req.auth!.sub : req.body.deviceId,
      });

      res.status(HTTP_STATUS.CREATED).json(session);
    } catch (error) {
      next(error);
    }
  }
);

// GET /sessions/:id - Get session details
sessionsRouter.get('/:id', async (req, res, next) => {
  try {
    const session = await sessionsService.getSession({
      sessionId: req.params.id,
      orgId: req.auth!.orgId,
    });

    res.status(HTTP_STATUS.OK).json(session);
  } catch (error) {
    next(error);
  }
});

// PATCH /sessions/:id - Update session
sessionsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { status } = req.body;

    const session = await sessionsService.updateSession({
      sessionId: req.params.id,
      orgId: req.auth!.orgId,
      status,
    });

    res.status(HTTP_STATUS.OK).json(session);
  } catch (error) {
    next(error);
  }
});
