import 'dotenv/config';
import { createServer } from './server.js';
import { logger } from './lib/logger.js';
import { db } from './db/index.js';

const PORT = process.env.API_PORT || 3000;

async function main() {
  // Test database connection
  try {
    await db.query('SELECT 1');
    logger.info('Database connection established');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database');
    process.exit(1);
  }

  const app = createServer();

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'API server started');
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await db.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
