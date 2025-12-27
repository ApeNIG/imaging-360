import crypto from 'crypto';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';

interface DedupResult {
  duplicateOf?: string;
  phash?: string;
}

export async function checkDuplicate(
  imageBuffer: Buffer,
  orgId: string
): Promise<DedupResult> {
  const startTime = Date.now();

  // Compute SHA-256
  const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

  // Check for exact duplicate
  const result = await query<{ id: string }>(
    `SELECT id FROM images WHERE org_id = $1 AND hash_sha256 = $2 LIMIT 1`,
    [orgId, hash]
  );

  if (result.rows.length > 0) {
    const duration = Date.now() - startTime;
    logger.info({ duplicateOf: result.rows[0].id, duration }, 'Duplicate found');

    return {
      duplicateOf: result.rows[0].id,
    };
  }

  // TODO: Implement perceptual hash (pHash) for near-duplicate detection
  // This requires additional libraries like sharp-phash or blockhash-core
  // For MVP, we only do exact hash matching

  const duration = Date.now() - startTime;
  logger.debug({ duration }, 'Dedup check complete (no duplicate)');

  return {};
}
