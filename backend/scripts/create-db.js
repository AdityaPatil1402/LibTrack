// Creates the application database (DB_NAME) if it does not exist yet.
// Connects to the built-in "postgres" maintenance database using DB_ADMIN_USER
// (falls back to DB_USER). You can also create the database in pgAdmin 4 instead.
import pg from 'pg';
import { env } from '../src/config/env.js';

const client = new pg.Client({
  host: env.db.host,
  port: env.db.port,
  database: 'postgres',
  user: env.db.adminUser,
  password: env.db.adminPassword,
  ssl: env.db.ssl,
});

try {
  await client.connect();
  const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [env.db.database]);
  if (rows.length > 0) {
    console.log(`Database "${env.db.database}" already exists.`);
  } else {
    // Identifiers cannot be parameterised; quote it safely.
    const quoted = `"${env.db.database.replace(/"/g, '""')}"`;
    await client.query(`CREATE DATABASE ${quoted}`);
    console.log(`Created database "${env.db.database}".`);
  }
} catch (err) {
  console.error(`Could not create database: ${err.message}`);
  console.error('Use a user with CREATEDB rights (set DB_ADMIN_USER / DB_ADMIN_PASSWORD) or create it in pgAdmin 4.');
  process.exitCode = 1;
} finally {
  await client.end();
}
