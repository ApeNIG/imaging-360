import sharp from 'sharp';
import { logger } from '../lib/logger.js';
import { QC_THRESHOLDS } from '@360-imaging/shared';
import type { QCResult, QCStatus } from '@360-imaging/shared';

interface QCCheckResult {
  sharpness: { score: number; status: QCStatus };
  exposure: { status: QCStatus; clippedHighlights?: number; clippedShadows?: number };
}

export async function runQualityChecks(imageBuffer: Buffer): Promise<QCCheckResult> {
  const startTime = Date.now();

  const [sharpnessResult, exposureResult] = await Promise.all([
    checkSharpness(imageBuffer),
    checkExposure(imageBuffer),
  ]);

  const duration = Date.now() - startTime;
  logger.info({ duration, sharpness: sharpnessResult.status, exposure: exposureResult.status }, 'QC complete');

  return {
    sharpness: sharpnessResult,
    exposure: exposureResult,
  };
}

async function checkSharpness(imageBuffer: Buffer): Promise<{ score: number; status: QCStatus }> {
  // Convert to grayscale and calculate Laplacian variance
  // This is a simplified implementation - real production would use OpenCV

  const image = sharp(imageBuffer);

  // Get raw grayscale pixel data
  const { data, info } = await image
    .grayscale()
    .resize(800, 600, { fit: 'inside' }) // Resize for faster processing
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Calculate variance using Laplacian-like approach
  // Simple edge detection via pixel differences
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < info.height - 1; y++) {
    for (let x = 1; x < info.width - 1; x++) {
      const idx = y * info.width + x;

      // Laplacian approximation: center pixel minus neighbors
      const center = data[idx];
      const top = data[(y - 1) * info.width + x];
      const bottom = data[(y + 1) * info.width + x];
      const left = data[y * info.width + (x - 1)];
      const right = data[y * info.width + (x + 1)];

      const laplacian = 4 * center - top - bottom - left - right;
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  // Map variance to score (higher variance = sharper image)
  const score = Math.sqrt(variance);

  let status: QCStatus;
  if (score < QC_THRESHOLDS.SHARPNESS.FAIL) {
    status = 'fail';
  } else if (score < QC_THRESHOLDS.SHARPNESS.WARN) {
    status = 'warn';
  } else {
    status = 'pass';
  }

  logger.debug({ score, status }, 'Sharpness check');

  return { score: Math.round(score), status };
}

async function checkExposure(imageBuffer: Buffer): Promise<{
  status: QCStatus;
  clippedHighlights?: number;
  clippedShadows?: number;
}> {
  const image = sharp(imageBuffer);

  // Get histogram data by analyzing pixel distribution
  const { data, info } = await image
    .grayscale()
    .resize(400, 300, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = info.width * info.height;
  let clippedDark = 0;
  let clippedBright = 0;

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value <= 5) clippedDark++;
    if (value >= 250) clippedBright++;
  }

  const clippedHighlights = clippedBright / totalPixels;
  const clippedShadows = clippedDark / totalPixels;

  const threshold = QC_THRESHOLDS.EXPOSURE.CLIPPING_THRESHOLD;
  let status: QCStatus = 'pass';

  if (clippedHighlights > threshold || clippedShadows > threshold) {
    status = 'fail';
  } else if (clippedHighlights > threshold / 2 || clippedShadows > threshold / 2) {
    status = 'warn';
  }

  logger.debug({ clippedHighlights, clippedShadows, status }, 'Exposure check');

  return {
    status,
    clippedHighlights: Math.round(clippedHighlights * 100) / 100,
    clippedShadows: Math.round(clippedShadows * 100) / 100,
  };
}
