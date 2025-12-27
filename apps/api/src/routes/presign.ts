import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { presignRateLimit } from '../middleware/rate-limit.js';
import * as presignService from '../services/presign.service.js';
import { ValidationError } from '../middleware/error-handler.js';
import { validatePresignRequest, HTTP_STATUS } from '@360-imaging/shared';

export const presignRouter = Router();

presignRouter.use(authenticate);
presignRouter.use(presignRateLimit);

// POST /presign - Get presigned upload URL
presignRouter.post('/', async (req, res, next) => {
  try {
    const validation = validatePresignRequest(req.body);

    if (!validation.valid) {
      throw new ValidationError('Invalid request', { errors: validation.errors });
    }

    const result = await presignService.createPresignedUrl({
      orgId: req.auth!.orgId,
      sessionId: req.body.sessionId,
      fileName: req.body.fileName,
      contentType: req.body.contentType,
      contentSha256: req.body.contentSha256,
    });

    res.status(HTTP_STATUS.OK).json(result);
  } catch (error) {
    next(error);
  }
});
