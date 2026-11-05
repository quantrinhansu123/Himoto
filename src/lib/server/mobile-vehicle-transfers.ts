import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {hasPermission} from '@/lib/management/permissions';
import {dataAccess} from './access-context';
import {himotoPool} from './himoto-database';
import {MobileError} from './mobile-session';
import {VehicleActionError} from './vehicle-actions';
import {readPendingVehicleTransfer} from './vehicle-transfers';
import {mobileFinanceId} from './mobile-finance';
import {mobileBody} from './mobile-writes';
import {vehicleTransferActions,isMobileVehicleTransferPreparation,isMobileTransferDestinations,isMobileVehicleTransferPreview,
  type MobileVehicleTransferAction,type MobileVehicleTransferInput,type MobileVehicleTransferPreparation,type MobileVehicleTransferPreview,
  type MobileTransferDestinations,type MobileTransferVehicle,type MobileTransferStore,type MobilePendingTransfer} from '../../../shared/mobile-vehicle-transfers';

type Database=Pick<PoolClient,'query'>;
const text=(v:unknown)=>v==null?'':String(v).slice(0,4000);
const idOrNull=(v:unknown)=>v==null?null:Number(v);
const iso=(v:unknown)=>v==null?null:v instanceof Date?v.toISOString():new Date(String(v)).toISOString();
export const transferConflict=(message:string)=>new MobileError(message,409,'TRANSFER_REVIEW_REQUIRED');
export function requireMobileVehicleTransfer(user:SessionUser,action?:MobileVehicleTransferAction) {
  if(!hasPermission(user,'vehicles.read')||action&&!hasPermission(user,['transfer','cancel'].includes(action)?'vehicles.transfer':'vehicles.receive'))
    throw new MobileError('Tài khoản không có quyền thực hiện thao tác kho này.',403,'FORBIDDEN');
}
export async function withMobileVehicleTransfer<T>(user:SessionUser,id:number,operation:MobileVehicleTransferAction|'fleet_read',write:boolean,task:(db:PoolClient)=>Promise<T>) {
  requireMobileVehicleTransfer(user,operation==='fleet_read'?undefined:operation);
  return dataAccess.run({...user,store_id:user.store_id??null,scope_all:user.scope_all===true,operation,transfer_vehicle_id:String(id)},async()=>{
    const db=await himotoPool.connect();
    try{
      await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await db.query("SET LOCAL statement_timeout='20s'");await db.query("SET LOCAL lock_timeout='5s'");
      const value=await task(db);await db.query('COMMIT');return value;
    }catch(error){
      await db.query('ROLLBACK').catch(()=>{});
      if(error instanceof VehicleActionError)throw new MobileError(error.message,error.status,error.status===404?'NOT_FOUND':error.status===403?'FORBIDDEN':'TRANSFER_REVIEW_REQUIRED');
      throw error;
    }finally{db.release();}
  });
}
export function parseMobileVehicleTransferInput(body:Record<string,unknown>):MobileVehicleTransferInput {
  const action=body.action,names=action==='transfer'?['action','revision','note','to_store_id']:['action','revision','note','transfer_event_id','transfer_event_revision'];
  const numberKey=action==='transfer'?'to_store_id':'transfer_event_id';
  if(!vehicleTransferActions.some(v=>v===action)||Object.keys(body).length!==names.length||Object.keys(body).some(k=>!names.includes(k))||
    typeof body.revision!=='string'||!/^[1-9]\d{0,19}$/.test(body.revision)||typeof body.note!=='string'||body.note.trim().length>500||
    typeof body[numberKey]!=='number'||!Number.isSafeInteger(body[numberKey])||Number(body[numberKey])<=0||Number(body[numberKey])>999999999999999||
    action!=='transfer'&&(typeof body.transfer_event_revision!=='string'||!/^[1-9]\d{0,19}$/.test(body.transfer_event_revision)))
    throw new MobileError('Thông tin điều chuyển chưa hợp lệ. Tải lại xe và lượt chuyển.',400,'INVALID_TRANSFER');
  return{...body,note:body.note.trim()} as MobileVehicleTransferInput;
}
export function mapTransferVehicle(row:Record<string,unknown>):MobileTransferVehicle {
  return{id:Number(row.id),revision:String(row.revision),name:text(row.name),license:text(row.license),brand:text(row.brand),type:text(row.type),color:text(row.color),
    year:text(row.year),status:text(row.status),storeId:idOrNull(row.current_store),storeName:text(row.store_name),
    ownerStoreId:idOrNull(row.owner_store_id),ownerStoreName:text(row.owner_store_name)};
}
export async function readTransferVehicle(db:Database,id:number,lock=false) {
  const row=(await db.query('SELECT v.id,v.name,v.license,v.brand,v.type,v.color,v.year,v.status,v.xmin::text AS revision,'+
    'COALESCE(v.current_store_id,v.store_id) AS current_store,s.store_name,v.store_id AS owner_store_id,owner.store_name AS owner_store_name FROM himoto.vehicles v '+
    'LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id) LEFT JOIN himoto.stores owner ON owner.id=v.store_id '+
    'WHERE v.id=$1 AND v.deleted_at IS NULL'+(lock?' FOR UPDATE OF v':''),[id])).rows[0];
  if(!row)throw new MobileError('Không tìm thấy xe.',404,'NOT_FOUND');return mapTransferVehicle(row);
}
async function store(db:Database,id:number|null):Promise<MobileTransferStore|null> {
  if(id===null)return null;
  const row=(await db.query('SELECT id,store_name,xmin::text AS revision FROM himoto.stores WHERE id=$1',[id])).rows[0];
  return row?{id:Number(row.id),name:text(row.store_name),revision:row.revision}:null;
}
function pending(row:Record<string,unknown>|undefined):MobilePendingTransfer|null {
  return row?{id:Number(row.id),revision:String(row.revision),type:String(row.event_type),fromStoreId:idOrNull(row.from_store_id),toStoreId:idOrNull(row.to_store_id),
    fromStoreName:text(row.from_store_name),toStoreName:text(row.to_store_name),actorId:idOrNull(row.created_by),recordedAt:iso(row.recorded_at),receivable:Number(row.receivable)===1}:null;
}
export async function readTransferContext(db:Database,id:number,lock=false) {
  const vehicle=await readTransferVehicle(db,id,lock),transfer=vehicle.status==='in_transit'?pending(await readPendingVehicleTransfer(db,id,lock)):null;
  const from=await store(db,transfer?transfer.fromStoreId:vehicle.storeId),to=transfer?await store(db,transfer.toStoreId):null;
  return{vehicle,transfer,from,to};
}
function blocked(context:Awaited<ReturnType<typeof readTransferContext>>,action:MobileVehicleTransferAction,user:SessionUser):string|null {
  const {vehicle,transfer,from,to}=context;
  if(!hasPermission(user,['transfer','cancel'].includes(action)?'vehicles.transfer':'vehicles.receive'))return 'Tài khoản chưa có quyền thao tác này.';
  if(action==='transfer')return vehicle.status==='sold'?'Xe đã bán, không điều chuyển kho.':vehicle.status==='in_transit'?'Xử lý lượt chuyển hiện tại trước khi chuyển tiếp.':null;
  if(vehicle.status!=='in_transit')return 'Xe không còn ở trạng thái Chờ luân chuyển.';
  if(!transfer||!transfer.receivable||transfer.toStoreId!==vehicle.storeId)return 'Lượt chuyển đã xử lý, bị đối soát hoặc thuộc dữ liệu cũ; cần kiểm tra lịch sử.';
  if(action==='cancel'&&transfer.actorId!==user.id)return 'Chỉ người tạo lượt chuyển được tự hủy.';
  if(action!=='cancel'&&transfer.actorId===user.id)return 'Người chuyển không được tự nhận hoặc từ chối cùng lượt; dùng Hủy điều chuyển.';
  if(action==='receive'&&!to)return 'Cơ sở nhận xe không còn tồn tại.';
  if(action!=='receive'&&!from)return 'Cơ sở chuyển đi không còn tồn tại.';
  return null;
}
export async function readMobileVehicleTransferPreparation(user:SessionUser,value:string,request:NextRequest):Promise<MobileVehicleTransferPreparation> {
  requireMobileVehicleTransfer(user);const id=mobileFinanceId(value);
  if([...request.nextUrl.searchParams].length)throw new MobileError('Không hỗ trợ bộ lọc khi chuẩn bị điều chuyển.',400,'INVALID_QUERY');
  return withMobileVehicleTransfer(user,id,'fleet_read',false,async db=>{
    const context=await readTransferContext(db,id);
    const result:MobileVehicleTransferPreparation={id,vehicle:context.vehicle,transfer:context.transfer,
      actions:vehicleTransferActions.map(action=>{const reason=blocked(context,action,user);return{action,available:reason===null,blockedReason:reason};}),observedAt:new Date().toISOString()};
    if(!isMobileVehicleTransferPreparation(result))throw transferConflict('Dữ liệu xe/lượt chuyển cần đối chiếu.');return result;
  });
}
export async function readMobileTransferDestinations(user:SessionUser,value:string,request:NextRequest):Promise<MobileTransferDestinations> {
  requireMobileVehicleTransfer(user,'transfer');const id=mobileFinanceId(value),params=request.nextUrl.searchParams,page=params.get('page')??'1',search=(params.get('search')??'').trim(),revision=params.get('revision');
  if([...params.keys()].some(k=>!['page','search','revision'].includes(k)||params.getAll(k).length!==1)||!/^[1-9]\d{0,4}$/.test(page)||Number(page)>10000||
    search.length>120||typeof revision!=='string'||!/^[1-9]\d{0,19}$/.test(revision))throw new MobileError('Bộ lọc kho đến không hợp lệ.',400,'INVALID_QUERY');
  return withMobileVehicleTransfer(user,id,'transfer',false,async db=>{
    const context=await readTransferContext(db,id),reason=blocked(context,'transfer',user);
    if(reason)throw transferConflict(reason);
    if(context.vehicle.revision!==revision)throw transferConflict('Thông tin xe đã thay đổi. Tải lại trước khi chọn kho đến.');
    const rows=(await db.query("SELECT id,store_name,xmin::text AS revision FROM himoto.stores WHERE status='opening' AND id IS DISTINCT FROM $1::bigint "+
      "AND ($2='' OR strpos(lower(store_name),lower($2))>0) ORDER BY store_name,id LIMIT 26 OFFSET $3",[context.vehicle.storeId,search,(Number(page)-1)*25])).rows;
    const result:MobileTransferDestinations={id,revision,page:Number(page),search,hasMore:rows.length>25,
      rows:rows.slice(0,25).map(row=>({id:Number(row.id),name:text(row.store_name),revision:row.revision})),observedAt:new Date().toISOString()};
    if(!isMobileTransferDestinations(result))throw transferConflict('Danh sách kho đến cần đối chiếu.');return result;
  });
}
export async function readVehicleTransferPreview(db:Database,user:SessionUser,id:number,input:MobileVehicleTransferInput,lock=false):Promise<MobileVehicleTransferPreview> {
  const context=await readTransferContext(db,id,lock),reason=blocked(context,input.action,user),{vehicle,transfer}=context;
  if(reason)throw transferConflict(reason);
  if(vehicle.revision!==input.revision)throw transferConflict('Thông tin xe đã thay đổi. Tải lại trước khi rà soát.');
  if(input.action!=='transfer'&&(!transfer||transfer.id!==input.transfer_event_id||transfer.revision!==input.transfer_event_revision))
    throw transferConflict('Lượt chuyển đã thay đổi. Tải lại xe và lịch sử.');
  const fromStore=context.from,toStore=input.action==='transfer'?await store(db,input.to_store_id):context.to;
  if(!toStore)throw transferConflict('Cơ sở đến không còn tồn tại. Chọn lại kho đến.');
  if(input.action==='transfer'&&toStore.id===vehicle.storeId)throw transferConflict('Xe đang ở cơ sở này. Chọn cơ sở khác.');
  if(lock){
    await db.query('SELECT id FROM himoto.stores WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[[...new Set([fromStore?.id,toStore.id,vehicle.ownerStoreId].filter(v=>v!=null))]]);
    // Re-read labels/revisions after the reference locks, including a row which
    // changed while FOR SHARE was waiting. The stock/event locks are still held.
    return readVehicleTransferPreview(db,user,id,input,false);
  }
  const effect:MobileVehicleTransferPreview['effect']=input.action==='transfer'?(vehicle.status==='ready'?'awaiting_receipt':'immediate_transfer'):({receive:'received',reject:'rejected',cancel:'cancelled'} as const)[input.action];
  const afterStoreId=input.action==='cancel'||input.action==='reject'?fromStore!.id:toStore.id;
  const after={status:effect==='awaiting_receipt'?'in_transit':effect==='immediate_transfer'?vehicle.status:'ready',storeId:afterStoreId,ownerStoreId:afterStoreId};
  const fields={id,action:input.action,revision:input.revision,vehicle,transfer,fromStore,toStore,after,effect,note:input.note};
  const result:MobileVehicleTransferPreview={...fields,snapshot:createHash('sha256').update(JSON.stringify(fields)).digest('hex'),observedAt:new Date().toISOString()};
  if(!isMobileVehicleTransferPreview(result))throw transferConflict('Dữ liệu rà soát điều chuyển cần đối chiếu.');return result;
}
export async function readMobileVehicleTransferPreview(user:SessionUser,value:string,request:NextRequest) {
  requireMobileVehicleTransfer(user);const id=mobileFinanceId(value);
  if([...request.nextUrl.searchParams].length||request.headers.has('idempotency-key'))throw new MobileError('Rà soát điều chuyển không sử dụng bộ lọc hoặc mã ghi.',400,'INVALID_QUERY');
  const input=parseMobileVehicleTransferInput(await mobileBody(request,4096));requireMobileVehicleTransfer(user,input.action);
  return withMobileVehicleTransfer(user,id,input.action,false,db=>readVehicleTransferPreview(db,user,id,input));
}
