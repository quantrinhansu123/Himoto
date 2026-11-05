import 'server-only';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {requiresOwnershipApproval} from '@/lib/management/contract-approval';
import {ContractReturnError} from './contract-returns';
import {VEHICLE_ORDER_SQL,EFFECTIVE_RENTAL_TYPE_SQL} from './contract-classification';
import {contractVehicleLabelSource} from './contract-vehicle-reads';
import {mobileFinanceId} from './mobile-finance';
import {himotoPool} from './himoto-database';
import {withMobileData} from './mobile-context';
import {MobileError} from './mobile-session';
import {isMobileSwapCandidates,isMobileSwapPreparation,isMobileSwapPreview,type MobileSwapCandidates,type MobileSwapPreparation,type MobileSwapVehicle,type MobileSwapInput,type MobileSwapPreview} from '../../../shared/mobile-swaps';
import {mobileBody} from './mobile-writes';

type Database=Pick<PoolClient,'query'>;
export const swapConflict=(message:string)=>new MobileError(message,409,'SWAP_REVIEW_REQUIRED');
export function parseMobileSwapInput(body:Record<string,unknown>):MobileSwapInput {
  const names=['revision','item_id','item_revision','vehicle_id','vehicle_revision'];
  if(Object.keys(body).length!==names.length||Object.keys(body).some(key=>!names.includes(key))||
    !['revision','item_revision','vehicle_revision'].every(key=>typeof body[key]==='string'&&/^[1-9]\d{0,19}$/.test(body[key]))||
    !['item_id','vehicle_id'].every(key=>typeof body[key]==='number'&&Number.isSafeInteger(body[key])&&Number(body[key])>0&&Number(body[key])<=999999999999999))
    throw new MobileError('Lựa chọn đổi xe không hợp lệ. Tải lại hợp đồng và xe thay thế.',400,'INVALID_SWAP');
  return body as unknown as MobileSwapInput;
}
const text=(v:unknown)=>v==null?'':String(v).slice(0,4000);
const iso=(v:unknown)=>v==null?null:v instanceof Date?v.toISOString():new Date(String(v)).toISOString();
export function requireMobileSwap(user:SessionUser) {
  if(!hasPermission(user,'contracts.read')||!hasPermission(user,'contracts.return')||!hasPermission(user,'vehicles.read'))
    throw new MobileError('Tài khoản cần quyền xem hợp đồng, trả/đổi xe và xem đội xe.',403,'FORBIDDEN');
}
export async function withMobileSwap<T>(user:SessionUser,write:boolean,task:(db:PoolClient)=>Promise<T>) {
  requireMobileSwap(user);
  // Do not set fleet_read for this operation. Candidates must be stock that the
  // actor can actually lock/update, while orders remain under their own RLS.
  return withMobileData(user,'',async()=>{
    const db=await himotoPool.connect();
    try{
      await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL statement_timeout='20s'");await db.query("SET LOCAL lock_timeout='5s'");
      const result=await task(db);await db.query('COMMIT');return result;
    }catch(error){
      await db.query('ROLLBACK').catch(()=>{});
      if(error instanceof ContractReturnError)throw new MobileError(error.message,error.status,error.status===404?'NOT_FOUND':'SWAP_REVIEW_REQUIRED');
      throw error;
    }finally{db.release();}
  });
}
export async function readSwapOrder(db:Database,id:number) {
  const row=(await db.query('SELECT o.id,o.store_id,o.order_status,o.xmin::text AS revision,o.draft_payload,'+
    "COALESCE(NULLIF(o.contract_number,''),o.draft_reference,'#'||o.id::text) AS code,"+EFFECTIVE_RENTAL_TYPE_SQL+' AS rental_type '+
    'FROM himoto.orders o WHERE o.id=$1 AND o.deleted_at IS NULL AND '+VEHICLE_ORDER_SQL,[id])).rows[0];
  if(!row)throw new MobileError('Không tìm thấy hợp đồng.',404,'NOT_FOUND');
  const reason=row.order_status==='bad_debt'?'Nợ xấu cần bước thu hồi riêng; không đổi xe trong hợp đồng này.':
    !['renting','overdue','wait_payment'].includes(row.order_status)?'Trạng thái hợp đồng chưa cho phép đổi xe.':null;
  return{row,reason,ownership:requiresOwnershipApproval(row.rental_type)};
}
function reconciled(order:Record<string,unknown>,id:number) {
  const entries=(order.draft_payload as {management_composer?:{vehicle_reconciliations?:{item_id:number;actual_recovery_at:string|null}[]}})?.management_composer?.vehicle_reconciliations;
  return Array.isArray(entries)&&entries.some(row=>Number(row.item_id)===id&&row.actual_recovery_at===null);
}
function mapLine(row:Record<string,unknown>,order:Record<string,unknown>,reason:string|null) {
  const blockedReason=reason??(row.completed_at!=null?'Xe đã được ghi nhận trả.':reconciled(order,Number(row.id))?'Dòng xe đã đối soát; cần bước thu hồi thực tế riêng.':null);
  return{id:Number(row.id),vehicleId:Number(row.vehicle_id),revision:String(row.revision),name:text(row.name),license:text(row.license),
    startsAt:iso(row.rent_at),returnAt:iso(row.return_at),completedAt:iso(row.completed_at),available:blockedReason===null,blockedReason};
}
const lineSql=()=>'SELECT d.id,d.vehicle_id,d.xmin::text AS revision,d.rent_at,d.return_at,d.completed_at,v.name,v.license '+
  'FROM himoto.order_vehicle_details d LEFT JOIN '+contractVehicleLabelSource()+' v ON v.id=d.vehicle_id WHERE d.order_id=$1 AND d.deleted_at IS NULL';
export async function readSwapLine(db:Database,id:number,itemId:number) {
  const order=await readSwapOrder(db,id);
  if(order.reason)throw swapConflict(order.reason);
  const row=(await db.query(lineSql()+' AND d.id=$2',[id,itemId])).rows[0];
  if(!row)throw swapConflict('Xe không thuộc hợp đồng hoặc không còn trong phạm vi đổi.');
  const item=mapLine(row,order.row,null);if(!item.available)throw swapConflict(item.blockedReason!);
  return{...order,item};
}
export async function readMobileSwapPreparation(user:SessionUser,value:string,request:NextRequest):Promise<MobileSwapPreparation> {
  requireMobileSwap(user);const id=mobileFinanceId(value),params=request.nextUrl.searchParams,page=params.get('page')??'1';
  if([...params.keys()].some(k=>k!=='page'||params.getAll(k).length!==1)||!/^[1-9]\d{0,5}$/.test(page)||Number(page)>100000)
    throw new MobileError('Trang xe cần đổi không hợp lệ.',400,'INVALID_QUERY');
  return withMobileSwap(user,false,async db=>{
    const order=await readSwapOrder(db,id);
    const count=(await db.query('SELECT count(*)::int AS n,count(*) FILTER(WHERE completed_at IS NULL)::int AS active FROM himoto.order_vehicle_details WHERE order_id=$1 AND deleted_at IS NULL',[id])).rows[0];
    const total=Number(count.n),pages=Math.max(1,Math.ceil(total/25));
    if(!Number.isSafeInteger(total)||total>1000000||Number(page)>pages)throw new MobileError('Trang xe không còn tồn tại. Tải lại danh sách.',400,'INVALID_QUERY');
    const reason=order.reason??(Number(count.active)===0?'Không còn xe đang thuê để đổi.':null);
    const rows=(await db.query(lineSql()+' ORDER BY (d.completed_at IS NULL) DESC,d.id LIMIT 25 OFFSET $2',[id,(Number(page)-1)*25])).rows;
    const result:MobileSwapPreparation={id,code:text(order.row.code),storeId:Number(order.row.store_id),status:order.row.order_status,revision:order.row.revision,ownership:order.ownership,
      available:reason===null,blockedReason:reason,items:{page:Number(page),pages,total,rows:rows.map(row=>mapLine(row,order.row,reason))},observedAt:new Date().toISOString()};
    if(!isMobileSwapPreparation(result))throw swapConflict('Dữ liệu đổi xe cần đối chiếu.');return result;
  });
}
const ownershipStore="CASE WHEN NULLIF(s.kind,'') IS NOT NULL THEN s.kind='lease_to_own' ELSE "+
  "lower(translate(regexp_replace(normalize(COALESCE(s.store_name,''),NFD) COLLATE \"C\",'[\\u0300-\\u036f]','','g'),'đĐ','dD')) LIKE '%thue so huu%' END";
const candidateSql='SELECT v.id,v.name,v.license,v.brand,v.type,v.color,v.year,v.xmin::text AS revision,stock.store_id,stock.store_name '+
  'FROM himoto.vehicles v JOIN himoto.vehicle_inventory() stock ON stock.id=v.id LEFT JOIN himoto.stores s ON s.id=stock.store_id '+
  "WHERE v.deleted_at IS NULL AND v.status='ready' AND stock.available AND stock.store_id>0 AND v.id<>$1 AND "+
  '(CASE WHEN $2::boolean THEN ('+ownershipStore+') ELSE stock.store_id=$3::bigint END)';
export function mapSwapVehicle(row:Record<string,unknown>):MobileSwapVehicle {
  return{id:Number(row.id),revision:String(row.revision),name:text(row.name),license:text(row.license),brand:text(row.brand),type:text(row.type),
    color:text(row.color),year:text(row.year),storeId:Number(row.store_id),storeName:text(row.store_name)};
}
export async function readSwapCandidate(db:Database,context:Awaited<ReturnType<typeof readSwapLine>>,vehicleId:number) {
  const row=(await db.query(candidateSql+' AND v.id=$4 LIMIT 1',[context.item.vehicleId,context.ownership,context.row.store_id,vehicleId])).rows[0];
  if(!row)throw swapConflict('Xe mới không còn Lưu kho phù hợp với cơ sở/loại hợp đồng hoặc đang thuộc hợp đồng khác.');
  return mapSwapVehicle(row);
}
export async function readMobileSwapPreview(user:SessionUser,value:string,request:NextRequest):Promise<MobileSwapPreview> {
  requireMobileSwap(user);
  if([...request.nextUrl.searchParams].length)throw new MobileError('Không hỗ trợ bộ lọc khi rà soát đổi xe.',400,'INVALID_QUERY');
  if(request.headers.has('idempotency-key'))throw new MobileError('Rà soát đổi xe không sử dụng mã ghi.',400,'INVALID_QUERY');
  const id=mobileFinanceId(value),input=parseMobileSwapInput(await mobileBody(request,4096));
  return withMobileSwap(user,false,async db=>{
    const context=await readSwapLine(db,id,input.item_id);
    if(context.row.revision!==input.revision||context.item.revision!==input.item_revision)throw swapConflict('Hợp đồng hoặc dòng xe đã thay đổi. Tải lại trước khi rà soát.');
    const vehicle=await readSwapCandidate(db,context,input.vehicle_id);
    if(vehicle.revision!==input.vehicle_revision)throw swapConflict('Xe thay thế đã thay đổi. Tìm và chọn lại xe.');
    const result:MobileSwapPreview={id,code:text(context.row.code),revision:input.revision,ownership:context.ownership,item:context.item,vehicle,observedAt:new Date().toISOString()};
    if(!isMobileSwapPreview(result))throw swapConflict('Dữ liệu rà soát đổi xe cần đối chiếu.');return result;
  });
}
export async function readMobileSwapCandidates(user:SessionUser,value:string,request:NextRequest):Promise<MobileSwapCandidates> {
  requireMobileSwap(user);const id=mobileFinanceId(value),params=request.nextUrl.searchParams,allowed=['item_id','revision','item_revision','search','page'];
  const page=params.get('page')??'1',search=(params.get('search')??'').trim(),revision=params.get('revision'),itemRevision=params.get('item_revision'),itemValue=params.get('item_id')??'';
  if([...params.keys()].some(k=>!allowed.includes(k)||params.getAll(k).length!==1)||!/^[1-9]\d{0,4}$/.test(page)||Number(page)>10000||search.length>120||
    typeof revision!=='string'||!/^[1-9]\d{0,19}$/.test(revision)||typeof itemRevision!=='string'||!/^[1-9]\d{0,19}$/.test(itemRevision))
    throw new MobileError('Lựa chọn xe thay thế chưa hợp lệ.',400,'INVALID_QUERY');
  const itemId=mobileFinanceId(itemValue),needle='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
  return withMobileSwap(user,false,async db=>{
    const context=await readSwapLine(db,id,itemId);
    if(context.row.revision!==revision||context.item.revision!==itemRevision)throw swapConflict('Hợp đồng hoặc dòng xe đã thay đổi. Tải lại trước khi chọn xe mới.');
    const rows=(await db.query(candidateSql+" AND ($4='' OR v.license ILIKE $5 ESCAPE '\\' OR v.name ILIKE $5 ESCAPE '\\') ORDER BY stock.store_name,v.license,v.id LIMIT 26 OFFSET $6",
      [context.item.vehicleId,context.ownership,context.row.store_id,search,needle,(Number(page)-1)*25])).rows;
    const result:MobileSwapCandidates={id,revision,itemId,itemRevision,ownership:context.ownership,page:Number(page),search,hasMore:rows.length>25,
      rows:rows.slice(0,25).map(mapSwapVehicle),observedAt:new Date().toISOString()};
    if(!isMobileSwapCandidates(result))throw swapConflict('Danh sách xe thay thế cần đối chiếu.');return result;
  });
}
