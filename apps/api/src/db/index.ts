import pg from 'pg';
import { logger } from '../lib/logger.js';

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

db.on('error', (err) => {
  logger.error({ error: err }, 'Unexpected database error');
});

// Helper to set org context for RLS
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

// Query helper with automatic parameter binding
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await db.query<T>(text, params);
  const duration = Date.now() - start;

  logger.debug({ query: text, duration, rows: result.rowCount }, 'Executed query');

  return result;
}
