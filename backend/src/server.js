import { env } from './config/env.js';
import { pool, query, closePool } from './db/pool.js';
import { createApp } from './app.js';

async function start() {
  if (env.jwtSecret.length < 32) {
    console.error('JWT_SECRET is missing or too short (it needs at least 32 characters).');
    console.error('Generate one and add it to backend/.env:');
    console.error(`  node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"`);
    process.exit(1);
  }

  try {
    const { rows } = await query('SELECT current_database() AS db, current_setting($1) AS v', ['server_version']);
    console.log(
      `PostgreSQL connected: ${env.db.host}:${env.db.port}, database "${rows[0].db}", server ${rows[0].v}`
    );
  } catch (err) {
    console.error(`Cannot connect to PostgreSQL at ${env.db.host}:${env.db.port}: ${err.message}`);
    console.error('Check DB_* values in backend/.env and that the PostgreSQL service is running.');
    await closePool();
    process.exit(1);
  }

  const server = createApp().listen(env.port, () => {
    console.log(`LibTrack API listening on http://localhost:${env.port}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
