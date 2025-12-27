import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { authRouter } from './routes/auth.js';
import { sessionsRouter } from './routes/sessions.js';
import { presignRouter } from './routes/presign.js';
import { imagesRouter } from './routes/images.js';
import { eventsRouter } from './routes/events.js';
import { sitesRouter } from './routes/sites.js';
import { healthRouter } from './routes/health.js';

export function createServer() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }));

  // Request parsing
  app.use(express.json({ limit: '1mb' }));

  // Logging
  app.use(pinoHttp({ logger }));

  // Request ID
  app.use(requestId);

  // Routes
  app.use('/health', healthRouter);
  app.use('/v1/auth', authRouter);
  app.use('/v1/sessions', sessionsRouter);
  app.use('/v1/presign', presignRouter);
  app.use('/v1/images', imagesRouter);
  app.use('/v1/events', eventsRouter);
  app.use('/v1/sites', sitesRouter);

  // Error handling
  app.use(errorHandler);

  return app;
}
