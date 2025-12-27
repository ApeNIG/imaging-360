import type { S3EventRecord, ProcessingResult } from '@360-imaging/shared';
import { logger } from '../lib/logger.js';
import { parseS3Key, downloadImage } from '../lib/s3.js';
import { generateThumbnails } from './thumbnails.js';
import { runQualityChecks } from './qc.js';
import { checkDuplicate } from './dedup.js';
import { saveImageRecord } from './save.js';

export async function processImage(record: S3EventRecord): Promise<ProcessingResult> {
  const startTime = Date.now();

  try {
    // Parse S3 key to extract org/site/session info
    const { orgId, siteId, sessionId, filename } = parseS3Key(record.key);

    logger.info({ orgId, siteId, sessionId, filename }, 'Starting image pipeline');

    // Download original image
    const imageBuffer = await downloadImage(record.key);

    // Run pipeline stages in parallel where possible
    const [thumbnailResult, qcResult, dedupResult] = await Promise.all([
      generateThumbnails(record.key, imageBuffer),
      runQualityChecks(imageBuffer),
      checkDuplicate(imageBuffer, orgId),
    ]);

    // Determine final status based on QC
    const qcPassed = qcResult.sharpness.status !== 'fail' &&
                     qcResult.exposure.status !== 'fail';
    const status = qcPassed ? 'processed' : 'failed';

    // Save image record to database
    const imageId = await saveImageRecord({
      orgId,
      siteId,
      sessionId,
      storageKey: record.key,
      hashSha256: thumbnailResult.hash,
      width: thumbnailResult.width,
      height: thumbnailResult.height,
      exif: thumbnailResult.exif,
      thumbKeys: thumbnailResult.thumbKeys,
      qc: {
        ...qcResult,
        duplicateOf: dedupResult.duplicateOf,
      },
      qcVersion: 1,
      status,
      phash: dedupResult.phash,
    });

    const duration = Date.now() - startTime;
    logger.info({ imageId, status, duration }, 'Pipeline complete');

    return {
      status: 'success',
      imageId,
      thumbnails: thumbnailResult.thumbKeys,
      qc: qcResult,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({ error, key: record.key, duration }, 'Pipeline failed');

    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
