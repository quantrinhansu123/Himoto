import { MAX_CACHE_PAGES, MAX_OFFLINE_WRITES, OFFLINE_TTL, offlineOperation, retryDelay } from './offline-policy';

type SqlValue = string | number | null;
export interface OfflineDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
}
export type OfflineWrite = {
  scope: string; key: string; path: string; method: string; operation: string;
  body: string; state: 'queued' | 'sending' | 'conflict' | 'committed';
  created_at: number; attempts: number; retry_at: number; lease_until: number; error: string;
};
export async function createOfflineStore(db: OfflineDatabase, changed = () => {}, now = Date.now) {
  await db.execAsync(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS offline_cache (
      scope TEXT NOT NULL, path TEXT NOT NULL, body TEXT NOT NULL, saved_at INTEGER NOT NULL,
      PRIMARY KEY(scope,path));
    CREATE TABLE IF NOT EXISTS offline_outbox (
      scope TEXT NOT NULL, key TEXT PRIMARY KEY, path TEXT NOT NULL, method TEXT NOT NULL,
      operation TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL,
      created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      retry_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS offline_outbox_scope ON offline_outbox(scope,created_at);`);
  await db.execAsync(`CREATE TABLE IF NOT EXISTS lookup_queries (
    scope TEXT NOT NULL, hash TEXT NOT NULL, body TEXT NOT NULL, saved_at INTEGER NOT NULL,
    PRIMARY KEY(scope,hash));`);
  const store = {
    async cacheQuery(scope: string, hash: string, snapshot: unknown) {
      const body = JSON.stringify(snapshot);
      if (body.length > 128 * 1024) return;
      await db.runAsync('INSERT INTO lookup_queries(scope,hash,body,saved_at) VALUES(?,?,?,?) ON CONFLICT(scope,hash) DO UPDATE SET body=excluded.body,saved_at=excluded.saved_at', scope, hash, body, now());
      await db.runAsync(`DELETE FROM lookup_queries WHERE saved_at<? OR rowid IN (
        SELECT rowid FROM (SELECT rowid,row_number() OVER(ORDER BY saved_at DESC,rowid DESC) AS n,
          sum(length(CAST(body AS BLOB))) OVER(ORDER BY saved_at DESC,rowid DESC) AS bytes FROM lookup_queries)
        WHERE n>40 OR bytes>4194304)`, now() - OFFLINE_TTL);
    },
    async readQueries(scope: string): Promise<unknown[]> {
      const rows = await db.getAllAsync<{ body: string }>('SELECT body FROM lookup_queries WHERE scope=? AND saved_at>? ORDER BY saved_at DESC LIMIT 40', scope, now() - OFFLINE_TTL);
      return rows.flatMap(row => { try { return [JSON.parse(row.body) as unknown]; } catch { return []; } });
    },
    async removeQuery(scope: string, hash: string) {
      await db.runAsync('DELETE FROM lookup_queries WHERE scope=? AND hash=?', scope, hash);
    },
    async cache(scope: string, path: string, data: unknown) {
      const body = JSON.stringify(data);
      if (body.length > 512 * 1024) return;
      await db.runAsync('INSERT INTO offline_cache(scope,path,body,saved_at) VALUES(?,?,?,?) ON CONFLICT(scope,path) DO UPDATE SET body=excluded.body,saved_at=excluded.saved_at', scope, path, body, now());
      await db.runAsync('DELETE FROM offline_cache WHERE saved_at<? OR rowid IN (SELECT rowid FROM offline_cache ORDER BY saved_at DESC,rowid DESC LIMIT -1 OFFSET ?)', now() - OFFLINE_TTL, MAX_CACHE_PAGES);
    },
    async read(scope: string, path: string) {
      const row = await db.getFirstAsync<{body: string; saved_at: number}>('SELECT body,saved_at FROM offline_cache WHERE scope=? AND path=? AND saved_at>?', scope, path, now() - OFFLINE_TTL);
      if (!row) return null;
      try { return { data: JSON.parse(row.body) as unknown, savedAt: row.saved_at }; } catch { return null; }
    },
    async clearCache(scope?: string) {
      await db.runAsync(scope ? 'DELETE FROM offline_cache WHERE scope=?' : 'DELETE FROM offline_cache', ...(scope ? [scope] : []));
      await db.runAsync(scope ? 'DELETE FROM lookup_queries WHERE scope=?' : 'DELETE FROM lookup_queries', ...(scope ? [scope] : []));
    },
    async enqueue(scope: string, key: string, path: string, method: string, body: string, leaseMs: number) {
      const operation = offlineOperation(path, method);
      if (!operation || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key) || body.length > 256 * 1024)
        throw new Error('Không lưu được thao tác offline hợp lệ. Giữ bản đang nhập và thử lại.');
      JSON.parse(body);
      // Atomic cap/insert across foreground and headless workers. Never evict writes.
      await db.runAsync(`INSERT INTO offline_outbox(scope,key,path,method,operation,body,state,created_at,lease_until)
        SELECT ?,?,?,?,?,?,'sending',?,? WHERE (SELECT count(*) FROM offline_outbox WHERE state<>'committed')<?
        ON CONFLICT(key) DO NOTHING`, scope, key, path, method, operation, body, now(), now() + leaseMs, MAX_OFFLINE_WRITES);
      const row = await db.getFirstAsync<OfflineWrite>('SELECT * FROM offline_outbox WHERE key=?', key);
      if (!row) throw new Error('Đã có 8 thao tác chờ. Vào Tài khoản để đồng bộ và đối chiếu trước khi lưu tiếp.');
      if (row.scope !== scope || row.path !== path || row.method !== method || row.body !== body)
        throw new Error('Mã lần lưu đã gắn với nội dung khác. Giữ nội dung gốc và đối chiếu trước khi tiếp tục.');
      if (row.state === 'conflict') throw new Error('Thao tác cần đối chiếu trên máy chủ. Mở Tài khoản để xử lý trước khi lưu tiếp.');
      changed(); return row;
    },
    list(scope: string) { return db.getAllAsync<OfflineWrite>("SELECT * FROM offline_outbox WHERE scope=? ORDER BY CASE WHEN state='committed' THEN 1 ELSE 0 END,created_at,key LIMIT 40", scope); },
    listActor(origin: string, userId: number) {
      return db.getAllAsync<OfflineWrite>("SELECT * FROM offline_outbox WHERE json_extract(scope,'$[0]')=? AND json_extract(scope,'$[1]')=? ORDER BY CASE WHEN state='committed' THEN 1 ELSE 0 END,created_at,key LIMIT 40", origin, userId);
    },
    async holdOtherScopes(scope: string, origin: string, userId: number) {
      const result = await db.runAsync(`UPDATE offline_outbox SET state='conflict',lease_until=0,error='Quyền hoặc cơ sở đã thay đổi. Cần đối chiếu mã gốc.'
        WHERE scope<>? AND json_extract(scope,'$[0]')=? AND json_extract(scope,'$[1]')=? AND state IN ('queued','sending')`, scope, origin, userId);
      if (result.changes) changed();
    },
    async resolvedForActor(origin: string, userId: number, key: string) {
      await db.runAsync("DELETE FROM offline_outbox WHERE key=? AND json_extract(scope,'$[0]')=? AND json_extract(scope,'$[1]')=?", key, origin, userId); changed();
    },
    async claim(scope: string, key: string, leaseMs = 60000) {
      const result = await db.runAsync(`UPDATE offline_outbox SET state='sending',lease_until=? WHERE scope=? AND key=? AND
        ((state='queued' AND retry_at<=?) OR (state='sending' AND lease_until<=?))`, now() + leaseMs, scope, key, now(), now());
      return result.changes === 1;
    },
    async failed(scope: string, key: string, error: string, retryable: boolean, attempts: number) {
      await db.runAsync(`UPDATE offline_outbox SET state=?,error=?,attempts=?,retry_at=?,lease_until=0
        WHERE scope=? AND key=? AND state<>'committed'`, retryable ? 'queued' : 'conflict', error.slice(0, 500), attempts + 1, now() + retryDelay(attempts), scope, key);
      changed();
    },
    async committed(scope: string, key: string) {
      // Keep only metadata for the sync receipt; release the sensitive request body.
      await db.runAsync("UPDATE offline_outbox SET state='committed',body='',error='',lease_until=0 WHERE scope=? AND key=?", scope, key);
      await store.clearCache(scope);
      await db.runAsync("DELETE FROM offline_outbox WHERE state='committed' AND created_at<?", now() - 7 * OFFLINE_TTL);
      changed();
    },
    async remove(scope: string, key: string) {
      await db.runAsync('DELETE FROM offline_outbox WHERE scope=? AND key=?', scope, key); changed();
    },
    async pause(scope: string, key: string) {
      await db.runAsync("UPDATE offline_outbox SET state='conflict',error='Đang đối chiếu mã gốc',lease_until=0 WHERE scope=? AND key=? AND state<>'committed'", scope, key); changed();
    },
    async retryNow(scope: string) {
      await db.runAsync("UPDATE offline_outbox SET retry_at=0 WHERE scope=? AND state='queued'", scope); changed();
    },
  };
  return store;
}
export type OfflineStore = Awaited<ReturnType<typeof createOfflineStore>>;
