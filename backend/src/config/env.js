import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true });

const REQUIRED = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. ` +
      'Copy backend/.env.example to backend/.env and fill in your PostgreSQL details.'
  );
}

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nodeEnv = process.env.NODE_ENV || 'development';

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: toInt(process.env.PORT, 5000),
  // One or more allowed browser origins, comma-separated.
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Authentication. JWT_SECRET is checked when the API server starts (see server.js),
  // so migrations and seeds keep working without it.
  jwtSecret: process.env.JWT_SECRET || '',
  bcryptCost: toInt(process.env.BCRYPT_COST, 12),
  db: Object.freeze({
    host: process.env.DB_HOST,
    port: toInt(process.env.DB_PORT, 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: toInt(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: toInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMillis: toInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS, 5000),
    adminUser: process.env.DB_ADMIN_USER || process.env.DB_USER,
    adminPassword: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD,
  }),
});
