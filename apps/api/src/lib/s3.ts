import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PRESIGN_EXPIRY_SECONDS, STORAGE_PATHS } from '@360-imaging/shared';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ENDPOINT && {
    endpoint: process.env.AWS_ENDPOINT,
    forcePathStyle: true,
  }),
});

const BUCKET = process.env.S3_BUCKET || 'imaging-dev';

export interface PresignParams {
  orgId: string;
  siteId: string;
  sessionId: string;
  filename: string;
  contentType: string;
  contentSha256: string;
}

export async function createPresignedUploadUrl(params: PresignParams) {
  const { orgId, siteId, sessionId, filename, contentType, contentSha256 } = params;

  const storageKey = STORAGE_PATHS.original(orgId, siteId, sessionId, filename);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: contentType,
    ChecksumSHA256: contentSha256,
    Metadata: {
      'org-id': orgId,
      'site-id': siteId,
      'session-id': sessionId,
    },
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: PRESIGN_EXPIRY_SECONDS,
  });

  const expiresAt = new Date(Date.now() + PRESIGN_EXPIRY_SECONDS * 1000);

  return {
    uploadUrl,
    storageKey,
    headers: {
      'Content-Type': contentType,
      'x-amz-checksum-sha256': contentSha256,
    },
    expiresAt,
  };
}

export async function createPresignedDownloadUrl(storageKey: string, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export { s3Client, BUCKET };
