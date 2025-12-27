import pg from 'pg';
import { logger } from '../lib/logger.js';

const { Pool } = pg;

// Connection configuration with retry logic
const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on('error', (err) => {
  logger.error({ error: err }, 'Unexpected database error');
});

db.on('connect', () => {
  logger.debug('New database connection established');
});

/**
 * Wait for database to be ready with exponential backoff
 */
export async function waitForDatabase(): Promise<void> {
  let attempt = 0;
  let delay = RETRY_CONFIG.initialDelayMs;

  while (attempt < RETRY_CONFIG.maxRetries) {
    try {
      const client = await db.connect();
      await client.query('SELECT 1');
      client.release();
      logger.info('Database connection established');
      return;
    } catch (error) {
      attempt++;
      if (attempt >= RETRY_CONFIG.maxRetries) {
        logger.error({ error, attempt }, 'Failed to connect to database after max retries');
        throw error;
      }

      logger.warn({ error, attempt, delay }, 'Database connection failed, retrying...');
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
    }
  }
}

/**
 * Health check for database connection
 */
export async function healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await db.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return { ok: false, latencyMs: Date.now() - start };
  }
}

/**
 * Helper to set org context for RLS
 */
export async function withOrgContext<T>(
  orgId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("SELECT set_config('app.current_org_id', $1, false)", [orgId]);
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Query helper with automatic parameter binding and logging
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await db.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug({ query: text, duration, rows: result.rowCount }, 'Executed query');

    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error({ query: text, duration, error }, 'Query failed');
    throw error;
  }
}

/**
 * Transaction helper with automatic commit/rollback
 */
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Graceful shutdown
 */
export async function closeDatabase(): Promise<void> {
  logger.info('Closing database connections...');
  await db.end();
  logger.info('Database connections closed');
}

// Re-export repositories
export * from './repositories/index.js';
