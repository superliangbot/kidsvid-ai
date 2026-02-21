import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export * from './schema.js';
export { eq, and, or, desc, asc, sql, count, avg, sum } from 'drizzle-orm';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(databaseUrl: string) {
  if (db) return db;

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  db = drizzle(pool, { schema });
  return db;
}

export type Database = ReturnType<typeof getDb>;
