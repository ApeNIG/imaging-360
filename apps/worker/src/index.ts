import 'dotenv/config';
import { startConsumer, stopConsumer } from './consumer.js';
import { logger } from './lib/logger.js';

const SHUTDOWN_TIMEOUT_MS = 30000;

async function main() {
  logger.info('Starting worker...');

  // Start SQS consumer
  await startConsumer();

  logger.info('Worker started successfully');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    const timeout = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      await stopConsumer();
      clearTimeout(timeout);
      logger.info('Worker shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      clearTimeout(timeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error({ error }, 'Worker failed to start');
  process.exit(1);
});
