import type { PoolClient } from 'pg';

// Both cash entries and the end-of-shift snapshot use this transaction lock.
export async function lockShiftClose(db: Pick<PoolClient, 'query'>, storeId: number, day: string) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`shift-close:${storeId}:${day}`]);
}
