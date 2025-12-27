import sharp from 'sharp';
import crypto from 'crypto';
import { uploadImage, parseS3Key } from '../lib/s3.js';
import { logger } from '../lib/logger.js';
import type { ThumbKeys, ImageExif, ThumbnailSize } from '@360-imaging/shared';
import { THUMBNAIL_SIZES } from '@360-imaging/shared';

interface ThumbnailResult {
  thumbKeys: ThumbKeys;
  hash: string;
  width: number;
  height: number;
  exif: ImageExif | undefined;
}

export async function generateThumbnails(
  originalKey: string,
  imageBuffer: Buffer
): Promise<ThumbnailResult> {
  const startTime = Date.now();

  // Parse original key to build thumb paths
  const { orgId, siteId, sessionId, filename } = parseS3Key(originalKey);
  const baseName = filename.replace(/\.[^.]+$/, '');

  // Get image metadata
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  // Compute SHA-256 hash
  const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

  // Extract EXIF
  const exif = extractExif(metadata);

  // Generate thumbnails
  const thumbKeys: ThumbKeys = {};

  await Promise.all(
    THUMBNAIL_SIZES.map(async (size: ThumbnailSize) => {
      const thumbBuffer = await image
        .clone()
        .resize(size, size, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      const thumbKey = `org/${orgId}/site/${siteId}/session/${sessionId}/thumbs/${baseName}_${size}.jpg`;

      await uploadImage(thumbKey, thumbBuffer, 'image/jpeg');
      thumbKeys[String(size) as keyof ThumbKeys] = thumbKey;

      logger.debug({ size, key: thumbKey }, 'Thumbnail generated');
    })
  );

  const duration = Date.now() - startTime;
  logger.info({ duration, sizes: THUMBNAIL_SIZES.length }, 'Thumbnails complete');

  return {
    thumbKeys,
    hash,
    width: metadata.width || 0,
    height: metadata.height || 0,
    exif,
  };
}

function extractExif(metadata: sharp.Metadata): ImageExif | undefined {
  if (!metadata.exif) return undefined;

  try {
    // Sharp provides limited EXIF, but we can get basics
    return {
      cameraMake: metadata.make,
      cameraModel: metadata.model,
      // Note: Full EXIF extraction would require exifr or similar library
    };
  } catch {
    return undefined;
  }
}
