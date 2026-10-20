import 'server-only';
import type { PoolClient } from 'pg';
import { usesScopedDatabase } from './access-context';

// All draft/finalize writers lock the same code. The function returns only a
// boolean so branch accounts can detect collisions without reading other branches.
export async function contractNumberAvailable(db: Pick<PoolClient, 'query'>, code: string, id: number | null) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`contract-code:${code}`]);
  const result = usesScopedDatabase()
    ? await db.query('SELECT himoto.contract_number_available($1,$2) AS available', [code,id])
    : await db.query(`SELECT NOT EXISTS(SELECT 1 FROM himoto.orders
        WHERE (contract_number=$1 OR draft_reference=$1) AND ($2::bigint IS NULL OR id<>$2)) AS available`, [code,id]);
  return result.rows[0]?.available === true;
}
