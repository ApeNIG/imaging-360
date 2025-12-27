import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

db.on('error', (err) => {
  logger.error({ error: err }, 'Unexpected database error');
});

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

export async function closeDb(): Promise<void> {
  await db.end();
}
