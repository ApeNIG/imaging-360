import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { logger } from './logger.js';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ENDPOINT && {
    endpoint: process.env.AWS_ENDPOINT,
    forcePathStyle: true,
  }),
});

const BUCKET = process.env.S3_BUCKET!;

export async function downloadImage(key: string): Promise<Buffer> {
  logger.debug({ key }, 'Downloading image from S3');

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`Empty body for key: ${key}`);
  }

  // Convert stream to buffer
  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export async function uploadImage(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  logger.debug({ key, size: buffer.length }, 'Uploading image to S3');

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
}

export function parseS3Key(key: string): {
  orgId: string;
  siteId: string;
  sessionId: string;
  filename: string;
} {
  // Format: org/{orgId}/site/{siteId}/session/{sessionId}/{filename}
  const parts = key.split('/');

  if (parts.length < 7 || parts[0] !== 'org' || parts[2] !== 'site' || parts[4] !== 'session') {
    throw new Error(`Invalid S3 key format: ${key}`);
  }

  return {
    orgId: parts[1],
    siteId: parts[3],
    sessionId: parts[5],
    filename: parts[6],
  };
}
