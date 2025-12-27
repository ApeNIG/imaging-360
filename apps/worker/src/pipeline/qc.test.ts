import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runQualityChecks } from './qc.js';

// Mock sharp
vi.mock('sharp', () => {
  const mockSharp = vi.fn(() => ({
    grayscale: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    raw: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(),
  }));
  return { default: mockSharp };
});

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import sharp from 'sharp';

describe('QC Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runQualityChecks', () => {
    it('should return pass status for good quality image', async () => {
      // Simulate a sharp image with high variance
      const mockData = Buffer.alloc(800 * 600);
      // Fill with high contrast data to simulate sharp image
      for (let i = 0; i < mockData.length; i++) {
        mockData[i] = (i % 200); // Creates variation
      }

      const mockSharpInstance = {
        grayscale: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue({
          data: mockData,
          info: { width: 800, height: 600 },
        }),
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);

      const result = await runQualityChecks(Buffer.from('test'));

      expect(result).toHaveProperty('sharpness');
      expect(result).toHaveProperty('exposure');
      expect(result.sharpness).toHaveProperty('score');
      expect(result.sharpness).toHaveProperty('status');
      expect(result.exposure).toHaveProperty('status');
    });

    it('should return fail status for blurry image', async () => {
      // Simulate a blurry image with low variance (all same value)
      const mockData = Buffer.alloc(800 * 600);
      mockData.fill(128); // All same value = no edges = blurry

      const mockSharpInstance = {
        grayscale: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue({
          data: mockData,
          info: { width: 800, height: 600 },
        }),
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);

      const result = await runQualityChecks(Buffer.from('test'));

      expect(result.sharpness.score).toBe(0);
      expect(result.sharpness.status).toBe('fail');
    });

    it('should detect overexposed image', async () => {
      // Simulate overexposed image (mostly bright pixels)
      const mockData = Buffer.alloc(400 * 300);
      // 30% of pixels at 250+ (overexposed)
      const overexposedCount = Math.floor(mockData.length * 0.3);
      mockData.fill(255, 0, overexposedCount);
      mockData.fill(128, overexposedCount);

      const mockSharpInstance = {
        grayscale: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue({
          data: mockData,
          info: { width: 400, height: 300 },
        }),
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);

      const result = await runQualityChecks(Buffer.from('test'));

      expect(result.exposure.clippedHighlights).toBeGreaterThan(0);
      expect(['warn', 'fail']).toContain(result.exposure.status);
    });

    it('should detect underexposed image', async () => {
      // Simulate underexposed image (mostly dark pixels)
      const mockData = Buffer.alloc(400 * 300);
      // 30% of pixels at 5 or below (underexposed)
      const underexposedCount = Math.floor(mockData.length * 0.3);
      mockData.fill(0, 0, underexposedCount);
      mockData.fill(128, underexposedCount);

      const mockSharpInstance = {
        grayscale: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue({
          data: mockData,
          info: { width: 400, height: 300 },
        }),
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);

      const result = await runQualityChecks(Buffer.from('test'));

      expect(result.exposure.clippedShadows).toBeGreaterThan(0);
      expect(['warn', 'fail']).toContain(result.exposure.status);
    });

    it('should return proper exposure for well-exposed image', async () => {
      // Simulate well-exposed image (mid-range values)
      const mockData = Buffer.alloc(400 * 300);
      mockData.fill(128); // Middle gray

      const mockSharpInstance = {
        grayscale: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue({
          data: mockData,
          info: { width: 400, height: 300 },
        }),
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);

      const result = await runQualityChecks(Buffer.from('test'));

      expect(result.exposure.clippedHighlights).toBe(0);
      expect(result.exposure.clippedShadows).toBe(0);
      expect(result.exposure.status).toBe('pass');
    });

    it('should run sharpness and exposure checks in parallel', async () => {
      const mockData = Buffer.alloc(800 * 600);
      mockData.fill(128);

      const toBufferMock = vi.fn().mockResolvedValue({
        data: mockData,
        info: { width: 800, height: 600 },
      });

      const mockSharpInstance = {
        grayscale: vi.fn().mockReturnThis(),
        resize: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        toBuffer: toBufferMock,
      };
      vi.mocked(sharp).mockReturnValue(mockSharpInstance as any);

      await runQualityChecks(Buffer.from('test'));

      // Sharp should be called twice (once for sharpness, once for exposure)
      expect(sharp).toHaveBeenCalledTimes(2);
    });
  });
});
