import 'server-only';
import { Pool, type PoolClient, type QueryResult } from 'pg';
import { rootCertificates } from 'node:tls';
import { attachDatabasePool } from '@vercel/functions';
import { SUPABASE_ROOT_CA } from './supabase-ca';
import { dataAccess } from './access-context';

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
    // A management page opens five list requests at once; a new TLS connection to Supabase costs ~400 ms.
    // Serverless instances keep the short idle window so suspended functions do not hold connections.
    max: process.env.VERCEL ? 4 : 8,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: process.env.VERCEL ? 5_000 : 120_000,
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
async function scopedConnect():Promise<PoolClient> {
  const client=await getPool().connect(),scope=dataAccess.getStore();
  if(!scope||scope.access_role==='admin')return client;
  let transaction=false,released=false,discard=false,pending:Promise<unknown>=Promise.resolve();
  const rawQuery=client.query.bind(client) as (...args:unknown[])=>Promise<QueryResult>;
  const rollback=async()=>{try{await rawQuery('ROLLBACK');}catch{discard=true;}finally{transaction=false;}};
  const begin=async(statement='BEGIN')=>{
    const result=await rawQuery(statement);transaction=true;
    try {
      // Supabase port 6543 pools transactions, not sessions. Pin scope and role to
      // the same transaction as the business query; never use session SET ROLE.
      await rawQuery("SELECT set_config('himoto.scope_all',$1,true),set_config('himoto.store_id',$2,true),set_config('himoto.actor_id',$3,true),set_config('himoto.operation',$4,true),set_config('himoto.transfer_vehicle_id',$5,true)",
        [String(scope.scope_all),scope.store_id==null?'':String(scope.store_id),String(scope.id),scope.operation,scope.transfer_vehicle_id||'']);
      await rawQuery('SET LOCAL ROLE himoto_scoped');return result;
    }catch(error){await rollback();throw error;}
  };
  const execute=async(args:unknown[])=>{
    const first=args[0],sql=typeof first==='string'?first:(first as {text?:string})?.text||'';
    const command=sql.trim().replace(/;\s*$/,'').toUpperCase();
    if(/^BEGIN(?:\s|$)/.test(command))return transaction?rawQuery(...args):begin(sql);
    if(command==='COMMIT'||command==='ROLLBACK'){
      try{return await rawQuery(command);}catch(error){discard=true;throw error;}finally{transaction=false;}
    }
    if(transaction)return rawQuery(...args);
    await begin();
    try{const result=await rawQuery(...args);await rawQuery('COMMIT');transaction=false;return result;}
    catch(error){await rollback();throw error;}
  };
  const query=(...args:unknown[])=>{
    if(released)return Promise.reject(new Error('Database connection already released.'));
    const result=pending.then(()=>execute(args));pending=result.catch(()=>{});return result;
  };
  const release=client.release.bind(client);
  return new Proxy(client,{get(target,key){
    if(key==='query')return query;
    if(key==='release')return (error?:Error|boolean)=>{if(released)return;released=true;
      void pending.then(async()=>{if(transaction)await rollback();release(discard?true:error);}).catch(()=>release(true));
    };
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
}
export const ownerDatabase:Pick<Pool,'query'|'connect'>={get query(){return getPool().query.bind(getPool());},get connect(){return getPool().connect.bind(getPool());}};
const scopedQuery=(async(...args:unknown[])=>{const client=await scopedConnect();try{return await (client.query as (...values:unknown[])=>Promise<unknown>)(...args);}finally{client.release();}}) as Pool['query'];
export const himotoPool: Pick<Pool, 'query' | 'connect'> = {
  get query() { return dataAccess.getStore()?scopedQuery:getPool().query.bind(getPool()); },
  get connect() { return (dataAccess.getStore()?scopedConnect:getPool().connect.bind(getPool())) as Pool['connect']; },
};
