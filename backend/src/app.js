import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { query } from './db/pool.js';
import { csrfProtection } from './middleware/csrf.js';
import { createRateLimiters } from './middleware/rateLimiters.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { createAuthRouter } from './routes/auth.js';
import { createProfileRouter } from './routes/profile.js';
import { createCatalogueRouter } from './routes/catalogue.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createIssuesRouter } from './routes/issues.js';

/** `options.rateLimits` lets tests raise or lower limits; normal startup uses the defaults. */
export function createApp(options = {}) {
  const app = express();
  const limiters = createRateLimiters(options.rateLimits);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // API responses contain personal data: never let a browser or proxy cache them.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', csrfProtection);

  // Connectivity check used by the dev setup and by the frontend placeholder.
  app.get('/api/health', async (_req, res) => {
    try {
      const { rows } = await query(
        `SELECT current_database() AS database,
                current_setting('server_version') AS server_version,
                version() AS version`
      );
      res.json({
        status: 'ok',
        database: {
          connected: true,
          name: rows[0].database,
          serverVersion: rows[0].server_version,
          version: rows[0].version,
        },
        time: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Health check failed:', err.message);
      res.status(503).json({ status: 'error', database: { connected: false } });
    }
  });

  app.use('/api/auth', createAuthRouter(limiters));
  app.use('/api/profile', createProfileRouter(limiters));
  app.use('/api/catalogue', createCatalogueRouter());
  app.use('/api/dashboard', createDashboardRouter());
  app.use('/api/issues', createIssuesRouter());

  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}
