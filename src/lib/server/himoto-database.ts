import 'server-only';
import { Pool } from 'pg';
import { rootCertificates } from 'node:tls';
import { attachDatabasePool } from '@vercel/functions';
import { SUPABASE_ROOT_CA } from './supabase-ca';

const globalForDatabase = globalThis as typeof globalThis & { himotoPool?: Pool };

function createPool() {
  const rawUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!rawUrl) throw new Error('Thiếu DATABASE_URL cho kết nối Supabase.');

  // Keep certificate and hostname verification enabled, including on Vercel.
  // pg's URL SSL flags must not overwrite the explicit trusted CA settings.
  const url = new URL(rawUrl);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ca: [...rootCertificates, SUPABASE_ROOT_CA, ...(process.env.DATABASE_SSL_CA ? [process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n')] : [])] },
    max: 4,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 5_000,
  });
  // Never include SQL or connection details in request logs.
  pool.on('error', () => console.error('Database idle connection failed.'));
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

let pool = globalForDatabase.himotoPool;
function getPool() {
  pool ??= createPool();
  if (process.env.NODE_ENV !== 'production') globalForDatabase.himotoPool = pool;
  return pool;
}

// Resolve credentials only when a server handler needs a database connection.
export const himotoPool: Pick<Pool, 'query' | 'connect'> = {
  get query() { return getPool().query.bind(getPool()); },
  get connect() { return getPool().connect.bind(getPool()); },
};
