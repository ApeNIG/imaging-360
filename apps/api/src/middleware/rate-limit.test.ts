import { describe, it, expect } from 'vitest';
import { RATE_LIMITS } from '@360-imaging/shared';
import {
  authDeviceRateLimit,
  presignRateLimit,
  eventsRateLimit,
  defaultRateLimit,
} from './rate-limit.js';

describe('Rate Limit Middleware', () => {
  describe('authDeviceRateLimit', () => {
    it('should be a function (middleware)', () => {
      expect(typeof authDeviceRateLimit).toBe('function');
    });

    it('should use AUTH_DEVICE limit from constants', () => {
      // The rate limit is configured with RATE_LIMITS.AUTH_DEVICE
      expect(RATE_LIMITS.AUTH_DEVICE).toBe(100);
    });
  });

  describe('presignRateLimit', () => {
    it('should be a function (middleware)', () => {
      expect(typeof presignRateLimit).toBe('function');
    });

    it('should use PRESIGN limit from constants', () => {
      expect(RATE_LIMITS.PRESIGN).toBe(500);
    });
  });

  describe('eventsRateLimit', () => {
    it('should be a function (middleware)', () => {
      expect(typeof eventsRateLimit).toBe('function');
    });

    it('should use EVENTS limit from constants', () => {
      expect(RATE_LIMITS.EVENTS).toBe(1000);
    });
  });

  describe('defaultRateLimit', () => {
    it('should be a function (middleware)', () => {
      expect(typeof defaultRateLimit).toBe('function');
    });

    it('should use DEFAULT limit from constants', () => {
      expect(RATE_LIMITS.DEFAULT).toBe(300);
    });
  });

  describe('Rate Limit Configuration', () => {
    it('should have appropriate limits relative to each other', () => {
      // Events should have highest limit (most frequent)
      expect(RATE_LIMITS.EVENTS).toBeGreaterThan(RATE_LIMITS.PRESIGN);
      expect(RATE_LIMITS.PRESIGN).toBeGreaterThan(RATE_LIMITS.DEFAULT);
      expect(RATE_LIMITS.DEFAULT).toBeGreaterThan(RATE_LIMITS.AUTH_DEVICE);
    });

    it('should have auth as lowest limit (security)', () => {
      expect(RATE_LIMITS.AUTH_DEVICE).toBeLessThanOrEqual(RATE_LIMITS.DEFAULT);
    });
  });
});
