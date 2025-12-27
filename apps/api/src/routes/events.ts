import { Router, type Router as RouterType } from 'express';
import { authenticate } from '../middleware/auth.js';
import { eventsRateLimit } from '../middleware/rate-limit.js';
import * as eventsService from '../services/events.service.js';
import { ValidationError } from '../middleware/error-handler.js';
import { validateCreateEvent, HTTP_STATUS } from '@360-imaging/shared';

export const eventsRouter: RouterType = Router();

eventsRouter.use(authenticate);
eventsRouter.use(eventsRateLimit);

// POST /events - Create event(s)
eventsRouter.post('/', async (req, res, next) => {
  try {
    // Handle batch events
    if (req.body.events && Array.isArray(req.body.events)) {
      const events = req.body.events;

      for (const event of events) {
        const validation = validateCreateEvent(event);
        if (!validation.valid) {
          throw new ValidationError('Invalid event in batch', { errors: validation.errors });
        }
      }

      const result = await eventsService.createBatchEvents({
        orgId: req.auth!.orgId,
        actorId: req.auth!.sub,
        actorType: req.auth!.role === 'device' ? 'device' : 'user',
        events,
      });

      return res.status(HTTP_STATUS.CREATED).json(result);
    }

    // Handle single event
    const validation = validateCreateEvent(req.body);

    if (!validation.valid) {
      throw new ValidationError('Invalid request', { errors: validation.errors });
    }

    const result = await eventsService.createEvent({
      orgId: req.auth!.orgId,
      actorId: req.auth!.sub,
      actorType: req.auth!.role === 'device' ? 'device' : 'user',
      ...req.body,
    });

    res.status(HTTP_STATUS.CREATED).json(result);
  } catch (error) {
    next(error);
  }
});
