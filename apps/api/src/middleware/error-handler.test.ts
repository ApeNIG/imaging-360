import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  errorHandler,
} from './error-handler.js';
import { HTTP_STATUS } from '@360-imaging/shared';

// Mock logger
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger } from '../lib/logger.js';

describe('Error Handler Middleware', () => {
  describe('AppError', () => {
    it('should create error with all properties', () => {
      const error = new AppError(400, 'TEST_ERROR', 'Test message', { field: 'value' });

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.details).toEqual({ field: 'value' });
      expect(error.name).toBe('AppError');
    });

    it('should be instance of Error', () => {
      const error = new AppError(500, 'ERROR', 'message');
      expect(error).toBeInstanceOf(Error);
    });

    it('should work without details', () => {
      const error = new AppError(400, 'ERROR', 'message');
      expect(error.details).toBeUndefined();
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with BAD_REQUEST status', () => {
      const error = new ValidationError('Invalid input');

      expect(error.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid input');
    });

    it('should include validation details', () => {
      const details = { fields: ['email', 'password'] };
      const error = new ValidationError('Validation failed', details);

      expect(error.details).toEqual(details);
    });

    it('should be instance of AppError', () => {
      const error = new ValidationError('message');
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource name', () => {
      const error = new NotFoundError('User');

      expect(error.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('User not found');
    });

    it('should work with different resource names', () => {
      expect(new NotFoundError('Session').message).toBe('Session not found');
      expect(new NotFoundError('Image').message).toBe('Image not found');
      expect(new NotFoundError('Vehicle').message).toBe('Vehicle not found');
    });

    it('should be instance of AppError', () => {
      const error = new NotFoundError('Resource');
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.statusCode).toBe(HTTP_STATUS.CONFLICT);
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toBe('Resource already exists');
    });

    it('should be instance of AppError', () => {
      const error = new ConflictError('message');
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('errorHandler', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.clearAllMocks();

      mockReq = {
        requestId: 'test-request-id',
        path: '/test/path',
        method: 'GET',
      };

      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      mockNext = vi.fn();
    });

    it('should handle AppError with correct status and response', () => {
      const error = new AppError(400, 'BAD_INPUT', 'Invalid data', { field: 'email' });

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'BAD_INPUT',
          message: 'Invalid data',
          details: { field: 'email' },
        },
        requestId: 'test-request-id',
      });
    });

    it('should handle ValidationError', () => {
      const error = new ValidationError('Field required', { fields: ['name'] });

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Field required',
          details: { fields: ['name'] },
        },
        requestId: 'test-request-id',
      });
    });

    it('should handle NotFoundError', () => {
      const error = new NotFoundError('Session');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.NOT_FOUND);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'NOT_FOUND',
          message: 'Session not found',
          details: undefined,
        },
        requestId: 'test-request-id',
      });
    });

    it('should handle ConflictError', () => {
      const error = new ConflictError('Duplicate entry');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.CONFLICT);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'CONFLICT',
          message: 'Duplicate entry',
          details: undefined,
        },
        requestId: 'test-request-id',
      });
    });

    it('should handle unexpected errors with 500 status', () => {
      const error = new Error('Database connection failed');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
        requestId: 'test-request-id',
      });
    });

    it('should log unexpected errors', () => {
      const error = new Error('Something went wrong');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
          requestId: 'test-request-id',
          path: '/test/path',
          method: 'GET',
        }),
        'Unhandled error'
      );
    });

    it('should not log AppError instances', () => {
      const error = new AppError(400, 'EXPECTED', 'Expected error');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle error without details', () => {
      const error = new AppError(500, 'SERVER_ERROR', 'Server error');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'SERVER_ERROR',
          message: 'Server error',
          details: undefined,
        },
        requestId: 'test-request-id',
      });
    });
  });
});
