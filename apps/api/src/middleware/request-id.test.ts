import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { requestId } from './request-id.js';

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid-1234'),
}));

describe('Request ID Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      headers: {},
    };

    mockRes = {
      setHeader: vi.fn(),
    };

    mockNext = vi.fn();
  });

  it('should generate UUID when no x-request-id header', () => {
    requestId(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.requestId).toBe('generated-uuid-1234');
    expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', 'generated-uuid-1234');
    expect(mockNext).toHaveBeenCalled();
  });

  it('should use existing x-request-id header', () => {
    mockReq.headers = { 'x-request-id': 'existing-request-id' };

    requestId(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.requestId).toBe('existing-request-id');
    expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', 'existing-request-id');
    expect(mockNext).toHaveBeenCalled();
  });

  it('should set response header with request ID', () => {
    requestId(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String));
  });

  it('should call next middleware', () => {
    requestId(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should handle empty x-request-id header by generating new one', () => {
    mockReq.headers = { 'x-request-id': '' };

    requestId(mockReq as Request, mockRes as Response, mockNext);

    // Empty string is falsy, so should generate new UUID
    expect(mockReq.requestId).toBe('generated-uuid-1234');
  });

  it('should preserve request ID across the request lifecycle', () => {
    const customId = 'custom-trace-id-abc';
    mockReq.headers = { 'x-request-id': customId };

    requestId(mockReq as Request, mockRes as Response, mockNext);

    // Both request and response should have same ID
    expect(mockReq.requestId).toBe(customId);
    expect(mockRes.setHeader).toHaveBeenCalledWith('x-request-id', customId);
  });
});
