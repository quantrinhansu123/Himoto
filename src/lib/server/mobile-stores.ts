import "server-only";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import type { SessionUser } from "./management-session";
import { hasPermission } from "@/lib/management/permissions";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from "./mobile-writes";
import { STORE_SELECT_SQL, StoreSaveError, createDatabaseStore, saveDatabaseStore, deleteDatabaseStore, parseStoreCreation, parseStoreEdits } from "./store-management";
import { type MobileStoreProfile, type MobileStoreResult, isStoreProfile } from "../../../shared/mobile-stores";
import type {MobileStoreContracts} from '../../../shared/mobile-store-contracts';
import {readManagementTable} from './management-table';
import {EMPTY_QUERY,filterRows} from '@/lib/management/table-utils';

function allowed(user: SessionUser, write = false) {
  if (!hasPermission(user, write ? "settings.write" : "contracts.read")) throw new MobileError("Tài khoản không có quyền thực hiện thao tác cơ sở.", 403, "FORBIDDEN");
}
function storeId(raw: string) {
  if (!/^[1-9]\d{0,14}$/.test(raw)) throw new MobileError("Mã cơ sở không hợp lệ.");
  return Number(raw);
}
async function transaction<T>(user: SessionUser, read: boolean, run: (client: PoolClient) => Promise<T>) {
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(read ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await run(client); await client.query("COMMIT"); return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof StoreSaveError) throw new MobileError(error.message, error.status, error.status === 409 ? "CONFLICT" : "INVALID_REQUEST");
      throw error;
    } finally { client.release(); }
  });
}
function project(row: Record<string, unknown>): MobileStoreProfile {
  const text = (value: unknown) => value == null ? "" : String(value);
  const result: MobileStoreProfile = {
    id: Number(row.id), revision: text(row.store_revision), rowRevision: text(row.row_revision),
    code: text(row.code), kind: text(row.kind), name: text(row.store_name), phone: text(row.store_phone), address: text(row.store_address),
    status: row.status === "opening" ? "active" : text(row.status), managerId: row.user_id == null ? null : Number(row.user_id), managerName: text(row.manager_name),
    vehicleCount: Number(row.vehicle_count), staffCount: Number(row.staff_count),
  };
  if (!isStoreProfile(result)) throw new MobileError("Thông tin cơ sở cần được đối chiếu trên web.", 409, "STORE_REVIEW_REQUIRED");
  return result;
}
async function profile(client: PoolClient, id: number) {
  const select = STORE_SELECT_SQL.replace("SELECT s.id,", "SELECT s.xmin::text AS row_revision,s.id,");
  const row = (await client.query(`${select} WHERE s.id=$1`, [id])).rows[0];
  return row ? project(row) : null;
}
export async function readMobileStore(user: SessionUser, rawId: string) {
  allowed(user); const id = storeId(rawId);
  return transaction(user, true, async client => {
    const row = await profile(client, id);
    if (!row) throw new MobileError("Cơ sở không tồn tại hoặc ngoài phạm vi truy cập.", 404, "NOT_FOUND");
    return row;
  });
}
export async function readMobileStoreManagers(user: SessionUser) {
  allowed(user, true);
  return transaction(user, true, async client => ({ managers: (await client.query("SELECT id,name FROM himoto.users WHERE deleted_at IS NULL AND status='active' ORDER BY name,id")).rows.map(row => ({ id: Number(row.id), name: String(row.name || "") })) }));
}
export async function readMobileStoreContracts(user:SessionUser,rawId:string,params:URLSearchParams):Promise<MobileStoreContracts>{
  allowed(user);const id=storeId(rawId),search=params.get('search')||'',requested=params.get('page')||'1';
  if([...params.keys()].some(k=>!['search','page'].includes(k)||params.getAll(k).length!==1)||search.length>120||!/^[1-9]\d{0,5}$/.test(requested))throw new MobileError('Bộ lọc hợp đồng cơ sở chưa hợp lệ.');
  return transaction(user,true,async db=>{
    const store=(await db.query('SELECT id,store_name FROM himoto.stores WHERE id=$1',[id])).rows[0];
    if(!store)throw new MobileError('Cơ sở không tồn tại hoặc ngoài phạm vi truy cập.',404,'NOT_FOUND');
    // The web store detail uses its full contract source, excludes drafts, and
    // computes store totals before the local search. Reuse that source/formatter.
    const dataset=await readManagementTable(db,'contracts',new URLSearchParams({all:'1',store:String(id),sort:'code',direction:'desc'}));
    const all=dataset.rows.filter(row=>Number(row.store_id)===id&&row.status!=='draft');
    const filtered=filterRows(all,{...EMPTY_QUERY,search},'all'),pages=Math.max(1,Math.ceil(filtered.length/25)),page=Math.min(Number(requested),pages);
    const amount=(v:unknown)=>v==null||v===''||!Number.isFinite(Number(v))?0:Number(v),text=(v:unknown)=>v==null?'':String(v),counts=new Map<string,number>();
    for(const row of all)counts.set(row.status,(counts.get(row.status)||0)+1);
    return{id,name:String(store.store_name||''),page,pages,total:filtered.length,summary:{count:all.length,total:all.reduce((sum,r)=>sum+amount(r.total_amount),0),paid:all.reduce((sum,r)=>sum+amount(r.paid_amount),0),debt:all.reduce((sum,r)=>sum+Math.max(amount(r.total_amount)-amount(r.paid_amount),0),0)},statusCounts:[...counts],rows:filtered.slice((page-1)*25,page*25).map(r=>({id:r.id,code:r.code,customer:text(r.customer_name),status:r.status,license:text(r.license),startsAt:text(r.start_date),endsAt:text(r.end_date),total:amount(r.total_amount),paid:amount(r.paid_amount)}))};
  });
}
export async function saveMobileStore(user: SessionUser, request: NextRequest, method: "POST" | "PATCH" | "DELETE", rawId?: string) {
  allowed(user, true);
  if (request.nextUrl.searchParams.size) throw new MobileError("Lưu cơ sở không nhận bộ lọc.");
  const id = method === "POST" ? null : storeId(rawId || ""), key = mobileRequestKey(request.headers.get("Idempotency-Key"));
  const body = await mobileBody(request, 12288);
  let input: ReturnType<typeof parseStoreCreation> | ReturnType<typeof parseStoreEdits> | { revision: string };
  try {
    if (method === "DELETE") {
      if (Object.keys(body).length !== 1 || typeof body.revision !== "string" || body.revision.length > 100) throw new StoreSaveError("Phiên bản cơ sở không hợp lệ.");
      input = { revision: body.revision };
    } else input = method === "POST" ? parseStoreCreation(body) : parseStoreEdits(body);
  } catch (error) { if (error instanceof StoreSaveError) throw new MobileError(error.message, error.status); throw error; }
  const operation = method === "POST" ? "store.create" : `store.${method === "PATCH" ? "update" : "delete"}:${id}`;
  return transaction(user, false, client => idempotentMobileWrite(client, user.id, key, operation, input, async () => {
    if (method === "DELETE") {
      // The web's delete has no revision parameter. Pin the reviewed row first,
      // then keep its exhaustive reference discovery and locking unchanged.
      await client.query("LOCK TABLE himoto.stores IN SHARE ROW EXCLUSIVE MODE");
      const before = (await client.query("SELECT id,COALESCE(updated_at::text,'') AS revision,xmin::text AS row_revision FROM himoto.stores WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!before) throw new StoreSaveError("Không tìm thấy cơ sở cần xóa.", 404);
      if (String(before.revision) !== body.revision) throw new StoreSaveError("Cơ sở đã thay đổi. Tải lại và rà soát trước khi xóa.", 409);
      await deleteDatabaseStore(client, id!);
      return { id: id!, revision: String(before.row_revision) };
    }
    const saved = method === "POST" ? await createDatabaseStore(client, input as ReturnType<typeof parseStoreCreation>) : await saveDatabaseStore(client, id!, input as ReturnType<typeof parseStoreEdits>);
    const current = (await client.query("SELECT id,xmin::text AS revision FROM himoto.stores WHERE id=$1", [saved.id])).rows[0];
    if (!current) throw new MobileError("Chưa xác nhận được cơ sở đã lưu. Giữ mã để đối chiếu.", 503);
    return { id: Number(current.id), revision: String(current.revision) };
  }));
}
export async function readMobileStoreResult(user: SessionUser, key: string): Promise<MobileStoreResult> {
  allowed(user, true); mobileRequestKey(key);
  return transaction(user, true, async client => {
    const row = (await client.query("SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 AND operation ~ '^store[.](create|(update|delete):[1-9][0-9]*)$'", [user.id, key])).rows[0];
    if (!row || !row.resource_id) throw new MobileError("Chưa có xác nhận cơ sở. Giữ mã và đối chiếu trong Tài khoản.", 404, "NOT_FOUND");
    const id = Number(row.resource_id), current = await profile(client, id);
    if (!current && !String(row.operation).startsWith("store.delete:")) throw new MobileError("Cơ sở không còn trong phạm vi truy cập. Giữ mã để đối chiếu.", 403, "FORBIDDEN");
    return { key, operation: String(row.operation), receipt: { id, revision: String(row.resource_revision), replayed: true }, current, deleted: !current };
  });
}
