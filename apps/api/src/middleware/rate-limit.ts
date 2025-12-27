import rateLimit from 'express-rate-limit';
import { RATE_LIMITS } from '@360-imaging/shared';

export const authDeviceRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: RATE_LIMITS.AUTH_DEVICE,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
    },
  },
});

export const presignRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMITS.PRESIGN,
  keyGenerator: (req) => req.auth?.sub || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many presign requests, please try again later',
    },
  },
});

export const eventsRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMITS.EVENTS,
  keyGenerator: (req) => req.auth?.sub || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many events, please try again later',
    },
  },
});

export const defaultRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMITS.DEFAULT,
  keyGenerator: (req) => req.auth?.sub || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
    },
  },
});
