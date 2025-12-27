import { Router } from 'express';
import { authDeviceRateLimit } from '../middleware/rate-limit.js';
import * as authService from '../services/auth.service.js';
import { ValidationError } from '../middleware/error-handler.js';
import { HTTP_STATUS } from '@360-imaging/shared';

export const authRouter = Router();

// POST /auth/device - Device enrollment/refresh
authRouter.post('/device', authDeviceRateLimit, async (req, res, next) => {
  try {
    const { orgId, platform, model, appVersion } = req.body;

    if (!orgId || !platform || !model || !appVersion) {
      throw new ValidationError('Missing required fields', {
        required: ['orgId', 'platform', 'model', 'appVersion'],
      });
    }

    if (!['ios', 'android', 'edge'].includes(platform)) {
      throw new ValidationError('Invalid platform', {
        allowed: ['ios', 'android', 'edge'],
      });
    }

    const result = await authService.authenticateDevice({
      orgId,
      platform,
      model,
      appVersion,
    });

    res.status(HTTP_STATUS.OK).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /auth/login - User login via OIDC
authRouter.post('/login', async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      throw new ValidationError('Missing id_token');
    }

    const result = await authService.authenticateUser(idToken);

    res.status(HTTP_STATUS.OK).json(result);
  } catch (error) {
    next(error);
  }
});
