import { Router, type Router as RouterType } from 'express';
import { authenticate, requireUser, requireRole } from '../middleware/auth.js';
import { defaultRateLimit } from '../middleware/rate-limit.js';
import * as imagesService from '../services/images.service.js';
import { ValidationError } from '../middleware/error-handler.js';
import { isValidUUID, HTTP_STATUS } from '@360-imaging/shared';
import type { ImageStatus } from '@360-imaging/shared';

export const imagesRouter: RouterType = Router();

imagesRouter.use(authenticate);
imagesRouter.use(requireUser);
imagesRouter.use(defaultRateLimit);

// GET /images - List images for a session
imagesRouter.get('/', async (req, res, next) => {
  try {
    const { sessionId, status } = req.query;

    if (!sessionId || !isValidUUID(sessionId as string)) {
      throw new ValidationError('Valid session_id required');
    }

    const images = await imagesService.listImages({
      orgId: req.auth!.orgId,
      sessionId: sessionId as string,
      status: status as ImageStatus | undefined,
    });

    res.status(HTTP_STATUS.OK).json(images);
  } catch (error) {
    next(error);
  }
});

// GET /images/:id - Get single image
imagesRouter.get('/:id', async (req, res, next) => {
  try {
    const image = await imagesService.getImage({
      imageId: req.params.id,
      orgId: req.auth!.orgId,
    });

    res.status(HTTP_STATUS.OK).json(image);
  } catch (error) {
    next(error);
  }
});

// POST /images/:id/publish - Publish an image
imagesRouter.post('/:id/publish', requireRole('reviewer', 'admin'), async (req, res, next) => {
  try {
    const result = await imagesService.publishImage({
      imageId: req.params.id,
      orgId: req.auth!.orgId,
    });

    res.status(HTTP_STATUS.OK).json(result);
  } catch (error) {
    next(error);
  }
});
