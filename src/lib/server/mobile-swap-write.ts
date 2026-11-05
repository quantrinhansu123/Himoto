import 'server-only';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {isMobileSwapReceipt,type MobileSwapReceipt} from '../../../shared/mobile-swaps';
import {replaceContractVehicle} from './contract-returns';
import {mapSwapVehicle,parseMobileSwapInput,readSwapCandidate,readSwapLine,requireMobileSwap,swapConflict,withMobileSwap} from './mobile-swaps';
export {parseMobileSwapInput} from './mobile-swaps';
import {mobileFinanceId} from './mobile-finance';
import {idempotentMobileWrite,mobileBody,mobileRequestKey} from './mobile-writes';
import {MobileError} from './mobile-session';

const invalidReceipt=()=>new MobileError('Chưa xác nhận được phiếu đổi xe. Giữ mã để đối chiếu.',503,'INVALID_WRITE_RECEIPT');
const iso=(value:unknown)=>value instanceof Date?value.toISOString():new Date(String(value)).toISOString();
async function receipt(db:PoolClient,user:SessionUser,key:string):Promise<MobileSwapReceipt|null> {
  const row=(await db.query('SELECT r.operation,r.resource_id,r.resource_revision,m.proof FROM himoto.management_mobile_requests r '+
    'LEFT JOIN himoto.management_mobile_swaps m ON m.user_id=r.user_id AND m.request_id=r.request_id AND m.order_id=r.resource_id '+
    'WHERE r.user_id=$1 AND r.request_id=$2',[user.id,key])).rows[0];
  if(!row||row.resource_id==null||!String(row.operation).startsWith('return.swap:'))return null;
  if(row.operation!=='return.swap:'+row.resource_id||!isMobileSwapReceipt(row.proof)||row.proof.requestId!==key||
    row.proof.id!==Number(row.resource_id)||row.proof.revision!==row.resource_revision)throw invalidReceipt();
  const result:MobileSwapReceipt={...row.proof,replayed:true};
  const order=(await db.query('SELECT xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL',[result.id])).rows[0];
  if(!order)throw new MobileError('Hợp đồng đã ra ngoài phạm vi truy cập hiện tại.',403,'FORBIDDEN');
  const line=(await db.query('SELECT vehicle_id,completed_at,deleted_at,xmin::text AS revision FROM himoto.order_vehicle_details WHERE id=$1 AND order_id=$2',[result.itemId,result.id])).rows[0];
  result.itemCurrent=!!line&&line.deleted_at==null&&line.completed_at==null&&line.revision===result.itemRevision&&Number(line.vehicle_id)===result.to.id;
  const history=(await db.query('SELECT order_item_id,from_vehicle_id,to_vehicle_id,actor_id,created_at,xmin::text AS revision '+
    'FROM himoto.management_contract_vehicle_swaps WHERE id=$1 AND order_id=$2',[result.swapId,result.id])).rows[0];
  result.historyCurrent=!!history&&Number(history.order_item_id)===result.itemId&&Number(history.from_vehicle_id)===result.from.id&&
    Number(history.to_vehicle_id)===result.to.id&&Number(history.actor_id)===user.id&&history.revision===result.swapRevision&&iso(history.created_at)===result.recordedAt;
  const stock=(await db.query('SELECT xmin::text AS revision FROM himoto.vehicles WHERE id=$1 AND deleted_at IS NULL',[result.to.id])).rows[0];
  result.vehicleCurrent=!!stock&&stock.revision===result.to.revision;
  result.contractCurrent=order.revision===result.revision;
  result.current=result.itemCurrent&&result.historyCurrent&&result.vehicleCurrent&&result.contractCurrent;
  return result;
}
export async function readMobileSwapReceipt(user:SessionUser,key:string) {
  requireMobileSwap(user);mobileRequestKey(key);
  return withMobileSwap(user,false,async db=>({receipt:await receipt(db,user,key)}));
}
export async function recordMobileSwap(user:SessionUser,value:string,request:NextRequest):Promise<MobileSwapReceipt> {
  requireMobileSwap(user);
  if([...request.nextUrl.searchParams].length)throw new MobileError('Không hỗ trợ bộ lọc khi ghi đổi xe.',400,'INVALID_QUERY');
  const id=mobileFinanceId(value),key=mobileRequestKey(request.headers.get('idempotency-key'));
  const input=parseMobileSwapInput(await mobileBody(request,4096));
  return withMobileSwap(user,true,async db=>{
    const saved=await idempotentMobileWrite(db,user.id,key,'return.swap:'+id,{id,input},async()=>{
      const order=(await db.query('SELECT xmin::text AS revision FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
      if(!order)throw new MobileError('Không tìm thấy hợp đồng.',404,'NOT_FOUND');
      if(order.revision!==input.revision)throw swapConflict('Hợp đồng đã thay đổi. Tải lại trước khi đổi xe.');
      await db.query('SELECT id FROM himoto.order_vehicle_details WHERE id=$1 AND order_id=$2 AND deleted_at IS NULL FOR UPDATE',[input.item_id,id]);
      const context=await readSwapLine(db,id,input.item_id);
      if(context.item.revision!==input.item_revision)throw swapConflict('Dòng xe đã thay đổi. Tải lại trước khi đổi xe.');
      // The candidate query alone is not a lock. Recheck after locking the actual
      // stock row under ordinary vehicle RLS; never elevate to fleet_read.
      const vehicle=(await db.query('SELECT xmin::text AS revision FROM himoto.vehicles WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[input.vehicle_id])).rows[0];
      if(!vehicle||vehicle.revision!==input.vehicle_revision)throw swapConflict('Xe thay thế đã thay đổi hoặc ra ngoài phạm vi kho. Chọn lại xe.');
      await readSwapCandidate(db,context,input.vehicle_id);
      const swap=await replaceContractVehicle(db,user.id,input);
      const after=(await db.query('UPDATE himoto.orders SET updated_at=now() WHERE id=$1 RETURNING xmin::text AS revision',[id])).rows[0];
      const line=(await db.query('SELECT vehicle_id,xmin::text AS revision FROM himoto.order_vehicle_details WHERE id=$1 AND order_id=$2',[input.item_id,id])).rows[0];
      const history=(await db.query('SELECT created_at,xmin::text AS revision FROM himoto.management_contract_vehicle_swaps WHERE id=$1 AND order_id=$2',[swap.swap_id,id])).rows[0];
      const stock=(await db.query('SELECT v.id,v.name,v.license,v.brand,v.type,v.color,v.year,v.xmin::text AS revision,'+
        'COALESCE(v.current_store_id,v.store_id) AS store_id,s.store_name FROM himoto.vehicles v LEFT JOIN himoto.stores s '+
        'ON s.id=COALESCE(v.current_store_id,v.store_id) WHERE v.id=$1',[input.vehicle_id])).rows[0];
      if(!after||!line||Number(line.vehicle_id)!==input.vehicle_id||!history||!stock)throw invalidReceipt();
      const proof:MobileSwapReceipt={id,revision:after.revision,requestId:key,replayed:false,code:String(context.row.code),
        reviewedRevision:input.revision,reviewedItemRevision:input.item_revision,reviewedVehicleRevision:input.vehicle_revision,
        swapId:swap.swap_id,swapRevision:history.revision,itemId:input.item_id,itemRevision:line.revision,
        from:{id:context.item.vehicleId,name:context.item.name,license:context.item.license},to:mapSwapVehicle(stock),recordedAt:iso(history.created_at),
        itemCurrent:true,historyCurrent:true,vehicleCurrent:true,contractCurrent:true,current:true};
      if(!isMobileSwapReceipt(proof))throw invalidReceipt();
      await db.query('INSERT INTO himoto.management_mobile_swaps(user_id,request_id,order_id,proof) VALUES($1,$2,$3,$4::jsonb)',[user.id,key,id,JSON.stringify(proof)]);
      return{id,revision:after.revision};
    });
    const result=await receipt(db,user,key);
    if(!result||result.id!==saved.id||result.revision!==saved.revision)throw invalidReceipt();
    return{...result,replayed:saved.replayed};
  });
}
