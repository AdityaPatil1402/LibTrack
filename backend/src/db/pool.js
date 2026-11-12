import pg from 'pg';
import { env } from '../config/env.js';

const { Pool, types } = pg;

// BIGINT ids are small in this app: return them as numbers instead of strings.
types.setTypeParser(20, (value) => Number(value));
// DATE columns (due dates) stay as 'YYYY-MM-DD' strings so no timezone shift can occur.
types.setTypeParser(1082, (value) => value);
// NUMERIC (fine amounts) is left as a string by default to avoid float rounding.

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  ssl: env.db.ssl,
  max: env.db.max,
  idleTimeoutMillis: env.db.idleTimeoutMillis,
  connectionTimeoutMillis: env.db.connectionTimeoutMillis,
  application_name: 'libtrack-backend',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

export const query = (text, params) => pool.query(text, params);

/**
 * Runs `work(client)` inside a single transaction.
 * Commits on success, rolls back and rethrows on any error.
 */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const closePool = () => pool.end();
