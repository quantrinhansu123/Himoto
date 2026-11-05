import "server-only";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import type { SessionUser } from "./management-session";
import { hasPermission } from "@/lib/management/permissions";
import { VEHICLE_STATUSES, VEHICLE_TYPES } from "@/lib/management/config";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { mobileBody, mobileRequestKey, idempotentMobileWrite } from "./mobile-writes";
import { createDatabaseVehicle, parseVehicleValues, updateDatabaseVehicle, VehicleSaveError } from "./vehicle-management";
import { VEHICLE_ORDER_SQL } from "./contract-classification";
import { CONTRACT_CUSTOMER_NAME_SQL } from './contract-customer-read';
import { readDraftVehicleRentals } from './draft-vehicle-rentals';
import type {MobileVehicleContracts} from '../../../shared/mobile-vehicles';
import { readVehicleHistory, VehicleHistoryError } from "./vehicle-history";
import { readTransferHistory, parseTransferHistory, TransferHistoryError } from "./vehicle-transfer-history";
import {readAllExportRows} from './mobile-filtered-workbook';
import { VEHICLE_HISTORY_ACTIONS, isVehicleProfile, type MobileVehicleProfile, type MobileVehicleOptions, type MobileVehicleResult, type MobileVehicleHistory, type MobileTransferHistory } from "../../../shared/mobile-vehicles";

function requireVehicle(user: SessionUser, write = false) {
  if (!hasPermission(user, write ? "vehicles.write" : "vehicles.read")) throw new MobileError("Tài khoản không có quyền thực hiện thao tác hồ sơ xe.", 403, "FORBIDDEN");
}
export function mobileVehicleId(raw: string) {
  if (!/^[1-9]\d{0,14}$/.test(raw)) throw new MobileError("Mã xe không hợp lệ.");
  return Number(raw);
}
async function transaction<T>(user: SessionUser, write: boolean, run: (client: PoolClient) => Promise<T>, operation = write ? "" : "fleet_read") {
  return withMobileData(user, operation, async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'"); await client.query("SET LOCAL lock_timeout='5s'");
      const value = await run(client); await client.query("COMMIT"); return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof VehicleSaveError || error instanceof VehicleHistoryError) throw new MobileError(error.message, error.status, error.status === 409 ? "CONFLICT" : "INVALID_REQUEST");
      if (error instanceof TransferHistoryError) throw new MobileError(error.message);
      throw error;
    } finally { client.release(); }
  });
}
async function profile(client: PoolClient, user: SessionUser, id: number): Promise<MobileVehicleProfile> {
  const row = (await client.query(`SELECT v.id,v.name,v.license,v.brand,v.type,v.year,v.color,v.chassis,v.engine,v.odometer,v.daily_price,v.cost_price,v.status,
    COALESCE(v.current_store_id,v.store_id) AS current_store_id,s.store_name,v.store_id AS owner_store_id,os.store_name AS owner_store_name,v.xmin::text AS revision,
    EXISTS(SELECT 1 FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id
      WHERE d.vehicle_id=v.id AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
        AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract')) AS has_open_contract
    FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)
    LEFT JOIN himoto.stores os ON os.id=v.store_id WHERE v.id=$1 AND v.deleted_at IS NULL`, [id])).rows[0];
  if (!row) throw new MobileError("Xe không tồn tại hoặc ngoài phạm vi hiện tại.", 404, "NOT_FOUND");
  const text = (value: unknown) => value == null ? "" : String(value);
  const status = ({ rent: "using", maintenance: "repairing", holding: "pending" } as Record<string, string>)[text(row.status)] || text(row.status);
  const result: MobileVehicleProfile = {
    id: Number(row.id), revision: String(row.revision), values: {
      name: text(row.name), license: text(row.license), brand: text(row.brand), type: row.type === "electric" ? "xe_dien" : text(row.type),
      year: row.year == null ? null : Number(row.year), store_id: Number(row.current_store_id), status, color: text(row.color), chassis: text(row.chassis), engine: text(row.engine),
      odometer: row.odometer == null ? null : Number(row.odometer), daily_price: row.daily_price == null ? null : Number(row.daily_price), cost_price: row.cost_price == null || row.cost_price === '' ? null : Number(row.cost_price), note: "", revision: String(row.revision),
    }, storeName: text(row.store_name), ownerStoreId: row.owner_store_id == null ? null : Number(row.owner_store_id), ownerStoreName: text(row.owner_store_name),
    hasOpenContract: row.has_open_contract === true, inTransit: status === "in_transit", canEdit: hasPermission(user, "vehicles.write"),
    typeLabel: VEHICLE_TYPES.find(type => type.value === (row.type === "electric" ? "xe_dien" : row.type))?.label || text(row.type),
  };
  if (!isVehicleProfile(result)) throw new MobileError("Thông tin xe cũ chưa đủ trường để chỉnh sửa. Kiểm tra hồ sơ trên web.", 409, "VEHICLE_REVIEW_REQUIRED");
  return result;
}
export async function readMobileVehicleProfile(user: SessionUser, rawId: string) {
  requireVehicle(user); const id = mobileVehicleId(rawId);
  const result = await transaction(user, false, client => profile(client, user, id));
  if (result.canEdit) result.canEdit = await withMobileData(user, "", async () => Number((await himotoPool.query("SELECT id FROM himoto.vehicles WHERE id=$1 AND deleted_at IS NULL", [id])).rowCount) > 0);
  return result;
}
export async function readMobileVehicleOptions(user: SessionUser): Promise<MobileVehicleOptions> {
  requireVehicle(user, true);
  // Match the web's scoped store choices; the global label directory does not
  // grant creation or profile editing at another branch.
  return transaction(user, false, async client => ({
    stores: (await client.query("SELECT id,store_name FROM himoto.stores ORDER BY store_name,id")).rows.map(row => ({ id: Number(row.id), name: String(row.store_name) })),
    types: VEHICLE_TYPES.map(row => ({ ...row })), statuses: VEHICLE_STATUSES.map(row => ({ ...row })),
  }), "");
}
export async function readMobileVehicleContracts(user:SessionUser,rawId:string,params:URLSearchParams):Promise<MobileVehicleContracts> {
  requireVehicle(user);
  if(!hasPermission(user,'contracts.read'))throw new MobileError('Không có quyền xem hợp đồng của xe.',403,'FORBIDDEN');
  const id=mobileVehicleId(rawId),requested=params.get('page')||'1';
  if([...params.keys()].some(k=>k!=='page'||params.getAll(k).length!==1)||!/^[1-9]\d{0,5}$/.test(requested))throw new MobileError('Trang hợp đồng xe chưa hợp lệ.');
  return transaction(user,false,async client=>{
    if(!(await client.query('SELECT id FROM himoto.vehicles WHERE id=$1 AND deleted_at IS NULL',[id])).rowCount)throw new MobileError('Xe không tồn tại hoặc ngoài phạm vi.',404,'NOT_FOUND');
    // Same open-line/status predicate and customer snapshot as web vehicle detail.
    // Contracts retain their own RLS even when the stock is visible fleet-wide.
    const issued=(await client.query(`SELECT o.id,COALESCE(NULLIF(o.contract_number,''),NULLIF(o.draft_reference,''),'#'||o.id::text) AS code,
      CASE WHEN o.order_status='renting' AND d.return_at<now() THEN 'overdue' ELSE o.order_status END AS status,
      COALESCE(${CONTRACT_CUSTOMER_NAME_SQL},'') AS customer,d.rent_at,d.return_at
      FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id LEFT JOIN himoto.customers c ON c.id=o.customer_id
      WHERE d.vehicle_id=$1 AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.deleted_at IS NULL AND ${VEHICLE_ORDER_SQL}
      AND o.order_status IN ('renting','overdue','wait_payment','pending','deposit_contract') ORDER BY d.rent_at DESC,o.id DESC`,[id])).rows;
    const draft=await readDraftVehicleRentals(client,[id]);
    const time=(v:unknown)=>v==null?null:v instanceof Date?v.toISOString():String(v);
    const byId=new Map<number,MobileVehicleContracts['rows'][number]>();
    for(const row of [...issued,...draft]){
      const key=Number(row.order_id??row.id);
      if(!byId.has(key))byId.set(key,{id:key,code:String(row.code),status:String(row.status),customer:String(row.customer||''),startsAt:time(row.rent_at),endsAt:time(row.return_at)});
    }
    const rows=[...byId.values()].sort((a,b)=>String(b.startsAt||'').localeCompare(String(a.startsAt||''))||b.id-a.id),pages=Math.max(1,Math.ceil(rows.length/25)),page=Math.min(Number(requested),pages);
    return{id,page,pages,total:rows.length,rows:rows.slice((page-1)*25,page*25)};
  });
}
export async function saveMobileVehicle(user: SessionUser, rawId: string | null, request: NextRequest) {
  requireVehicle(user, true);
  const id = rawId === null ? null : mobileVehicleId(rawId), key = mobileRequestKey(request.headers.get("Idempotency-Key"));
  if (request.nextUrl.searchParams.size) throw new MobileError("Lưu xe không nhận bộ lọc.");
  const body = await mobileBody(request, 16384);
  const fields = ["name", "license", "brand", "type", "year", "store_id", "status", "color", "chassis", "engine", "odometer", "daily_price", "cost_price", "note", ...(id === null ? [] : ["revision"])];
  if (Object.keys(body).some(field => !fields.includes(field)) || id !== null && (typeof body.revision !== "string" || !/^[1-9]\d{0,19}$/.test(body.revision))) throw new MobileError("Thông tin hoặc phiên bản xe không hợp lệ.");
  let values: ReturnType<typeof parseVehicleValues>;
  try { values = parseVehicleValues(body); } catch (error) { if (error instanceof VehicleSaveError) throw new MobileError(error.message, error.status); throw error; }
  return transaction(user, true, client => idempotentMobileWrite(client, user.id, key, id === null ? "vehicle.create" : `vehicle.update:${id}`, values, async () => {
    if (id !== null && !(await client.query("SELECT id FROM himoto.vehicles WHERE id=$1 AND deleted_at IS NULL", [id])).rowCount) throw new MobileError("Xe không còn trong phạm vi chỉnh sửa.", 404, "NOT_FOUND");
    const saved = id === null ? await createDatabaseVehicle(client, values, user.id) : await updateDatabaseVehicle(client, id, values, user.id);
    const row = (await client.query("SELECT id,xmin::text AS revision FROM himoto.vehicles WHERE id=$1 AND deleted_at IS NULL", [saved.id])).rows[0];
    if (!row) throw new MobileError("Chưa xác nhận được xe đã lưu. Giữ mã để đối chiếu.", 503);
    return { id: Number(row.id), revision: String(row.revision) };
  }));
}
export async function readMobileVehicleResult(user: SessionUser, key: string): Promise<MobileVehicleResult> {
  requireVehicle(user); mobileRequestKey(key);
  return transaction(user, false, async client => {
    const row = (await client.query("SELECT operation,resource_id,resource_revision FROM himoto.management_mobile_requests WHERE user_id=$1 AND request_id=$2 AND operation ~ '^vehicle[.](create|update:[1-9][0-9]*)$'", [user.id, key])).rows[0];
    if (!row || !row.resource_id) throw new MobileError("Chưa có xác nhận lưu xe. Giữ mã và đối chiếu trong Tài khoản.", 404, "NOT_FOUND");
    return { key, operation: String(row.operation), receipt: { id: Number(row.resource_id), revision: String(row.resource_revision), replayed: true }, current: await profile(client, user, Number(row.resource_id)) };
  });
}
export async function readMobileVehicleHistory(user: SessionUser, rawId: string, params: URLSearchParams): Promise<MobileVehicleHistory> {
  requireVehicle(user); const id = mobileVehicleId(rawId);
  for (const [key] of params) if (!["page", "action", "search"].includes(key) || params.getAll(key).length !== 1) throw new MobileError("Bộ lọc lịch sử xe không hợp lệ.");
  const requested = params.get("page") || "1", action = params.get("action") || "", search = (params.get("search") || "").trim();
  if (!/^[1-9]\d{0,5}$/.test(requested) || search.length > 120 || action && !VEHICLE_HISTORY_ACTIONS.some(row => row.value === action)) throw new MobileError("Trang hoặc bộ lọc lịch sử không hợp lệ.");
  return transaction(user, false, async client => {
    const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
    const events = (await readVehicleHistory(client, id)).filter(row => (!action || row.action === action) && fold([row.label, row.actor, row.note, row.responsible_store, row.beneficiary_store, row.location].join(" ")).includes(fold(search)));
    const pages = Math.max(1, Math.ceil(events.length / 25)), page = Math.min(Number(requested), pages);
    return { id, rows: events.slice((page - 1) * 25, page * 25).map(row => ({
      key: row.key, action: row.action, label: row.label, vehicle_name: row.vehicle_name, license: row.license, location: row.location,
      responsible_store: row.responsible_store, beneficiary_store: row.beneficiary_store, note: row.note, at: row.at, actor: row.actor, order_id: row.order_id,
      ...(row.telegram_event_id?{telegram_event_id:row.telegram_event_id}:{}),
      changes: (row.changes || []).map(change => ({ field: change.field, label: change.label, from: change.from, to: change.to })),
    })), page, pages, total: events.length, sourceLimit: "Theo nguồn web: tối đa 500 lượt thuê, 500 sự kiện và 200 lượt đổi xe gần nhất." };
  });
}
function transferFilters(params:URLSearchParams) {
  for (const [key] of params) if (!["from", "to", "from_store", "to_store", "store", "action", "search", "page"].includes(key) || params.getAll(key).length !== 1) throw new MobileError("Bộ lọc điều chuyển không hợp lệ.");
}
export function readMobileTransferExportRows(user:SessionUser,params:URLSearchParams) {
  requireVehicle(user);transferFilters(params);
  return transaction(user,false,async client=>{
    await client.query("SET LOCAL statement_timeout='60s'");
    return readAllExportRows(page=>readTransferHistory(client,new URLSearchParams({...Object.fromEntries(params),page:String(page)})),row=>row.id);
  });
}
export async function readMobileTransferHistory(user: SessionUser, params: URLSearchParams): Promise<MobileTransferHistory> {
  requireVehicle(user);transferFilters(params);
  return transaction(user, false, async client => {
    const query = parseTransferHistory(params); let data = await readTransferHistory(client, params);
    const pages = Math.max(1, Math.ceil(data.total / data.size));
    if (data.page > pages) data = await readTransferHistory(client, new URLSearchParams({ ...Object.fromEntries(params), page: String(pages) }));
    return { rows: data.rows.map(row => ({ id: row.id, vehicle_id: row.vehicle_id, vehicle_name: row.vehicle_name, license: row.license,
      from_store_id: row.from_store_id, to_store_id: row.to_store_id, from_store: row.from_store, to_store: row.to_store, action: row.action,
      label: row.label, at: row.at, actor: row.actor, note: row.note, changes: row.changes.map(change => ({ field: change.field, label: change.label, from: change.from, to: change.to })),
    })), total: data.total, scopeCount: data.scopeCount, page: data.page, pages, size: data.size, from: query.from, to: query.to };
  });
}
