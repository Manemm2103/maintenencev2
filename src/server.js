import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { pool, waitForDatabase } from './db.js';
import { migrateAndSeed } from './migrate.js';
import { ApiError } from './errors.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';

function corsOptions() {
  if (config.corsOrigin === '*') {
    return { origin: true };
  }
  return {
    origin: config.corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean)
  };
}

const app = express();

app.use(cors(corsOptions()));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'drhome-maintenance-api' });
});

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, apiRouter);

app.use((_req, _res, next) => {
  next(new ApiError(404, 'Route not found'));
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  const body = {
    error: {
      message: status === 500 ? 'Internal server error' : error.message
    }
  };

  if (error.details) {
    body.error.details = error.details;
  }

  if (status === 500) {
    console.error(error);
  }

  res.status(status).json(body);
});

async function start() {
  await waitForDatabase();
  await migrateAndSeed(pool);

  app.listen(config.port, () => {
    console.log(`DR HOME maintenance API listening on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
