import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './pool.js';

const THIS_FILE = fileURLToPath(import.meta.url);
const MIGRATIONS_DIR = path.join(path.dirname(THIS_FILE), 'migrations');
// Advisory lock so two processes can never run migrations at the same time.
const LOCK_KEY = 7270011;

async function loadMigrations() {
  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  return Promise.all(
    files.map(async (filename) => {
      // Normalise line endings so checksums match on Windows (CRLF) and Linux (LF).
      const sql = (await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8')).replace(/\r\n/g, '\n');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      return { filename, sql, checksum };
    })
  );
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function migrateUp() {
  const migrations = await loadMigrations();
  const client = await pool.connect();
  const applied = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await ensureMigrationsTable(client);

    const { rows } = await client.query('SELECT filename, checksum FROM schema_migrations');
    const done = new Map(rows.map((row) => [row.filename, row.checksum]));

    for (const migration of migrations) {
      if (done.has(migration.filename)) {
        if (done.get(migration.filename) !== migration.checksum) {
          throw new Error(
            `Migration ${migration.filename} was changed after it was applied. ` +
              'Never edit an applied migration; add a new one instead.'
          );
        }
        continue;
      }

      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [
          migration.filename,
          migration.checksum,
        ]);
        await client.query('COMMIT');
        applied.push(migration.filename);
        console.log(`  applied  ${migration.filename}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${migration.filename} failed: ${err.message}`);
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

export async function migrationStatus() {
  const migrations = await loadMigrations();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const { rows } = await client.query('SELECT filename, applied_at FROM schema_migrations');
    const done = new Map(rows.map((row) => [row.filename, row.applied_at]));
    return migrations.map((m) => ({
      filename: m.filename,
      applied: done.has(m.filename),
      appliedAt: done.get(m.filename) ?? null,
    }));
  } finally {
    client.release();
  }
}

async function main() {
  const command = process.argv[2] || 'up';
  try {
    if (command === 'up') {
      console.log('Running migrations...');
      const applied = await migrateUp();
      console.log(applied.length ? `Done. ${applied.length} migration(s) applied.` : 'Database is already up to date.');
    } else if (command === 'status') {
      for (const row of await migrationStatus()) {
        console.log(`${row.applied ? '[x]' : '[ ]'} ${row.filename}${row.appliedAt ? `  (${row.appliedAt.toISOString()})` : ''}`);
      }
    } else {
      console.error(`Unknown command "${command}". Use "up" or "status".`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Migration error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
  main();
}
