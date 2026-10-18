import 'server-only';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ContractPaymentError,parseContractPayment,readPaymentContext,recordContractPayment } from './contract-payments';
type Database=Pick<PoolClient,'query'>;
export class BatterySwapError extends Error {constructor(message:string,public status=400){super(message);}}
const itemSql=`SELECT d.id,d.vehicle_id,v.license,v.name FROM himoto.order_vehicle_details d JOIN himoto.orders o ON o.id=d.order_id JOIN himoto.vehicles v ON v.id=d.vehicle_id
 WHERE d.order_id=$1 AND o.deleted_at IS NULL AND d.deleted_at IS NULL AND d.completed_at IS NULL AND o.order_status IN('renting','overdue','wait_payment')
 AND (v.type IN('electric','xe_dien') OR EXISTS(SELECT 1 FROM himoto.battery_contracts b WHERE b.vehicle_contract_id=o.id AND b.deleted_at IS NULL AND b.status='renting'))`;
export async function readBatterySwaps(db:Database,orderId:number){
 const exists=(await db.query('SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL',[orderId])).rowCount;if(!exists)throw new BatterySwapError('Không tìm thấy hợp đồng.',404);
 const items=(await db.query(itemSql+' ORDER BY d.id',[orderId])).rows;
 const swaps=(await db.query('SELECT s.*,s.xmin::text AS revision,v.license,v.name FROM himoto.management_contract_battery_swaps s JOIN himoto.vehicles v ON v.id=s.vehicle_id WHERE s.order_id=$1 ORDER BY s.id DESC',[orderId])).rows;
 return {items:items.map(item=>({...item,id:Number(item.id),vehicle_id:Number(item.vehicle_id)})),swaps:swaps.map(row=>({...row,id:Number(row.id),order_id:Number(row.order_id),item_id:Number(row.item_id),vehicle_id:Number(row.vehicle_id),fee:Number(row.fee)}))};
}
export async function writeBatterySwap(db:Database,orderId:number,actor:number,value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new BatterySwapError('Thông tin đổi pin chưa hợp lệ.');const body=value as Record<string,unknown>;
 if(body.action==='prepare'){
  if(Object.keys(body).some(key=>!['action','item_id','request_id'].includes(key))||!Number.isSafeInteger(body.item_id)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(body.request_id)))throw new BatterySwapError('Chọn xe điện và mã lượt đổi pin hợp lệ.');
  await db.query('SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[orderId]);
  const item=(await db.query(itemSql+' AND d.id=$2',[orderId,body.item_id])).rows[0];if(!item)throw new BatterySwapError('Xe điện không đang thuê trên hợp đồng này.',409);
  const old=(await db.query('SELECT *,xmin::text AS revision FROM himoto.management_contract_battery_swaps WHERE request_id=$1',[body.request_id])).rows[0];
  if(old){if(Number(old.order_id)!==orderId||Number(old.item_id)!==Number(body.item_id)||Number(old.created_by)!==actor)throw new BatterySwapError('Mã lượt đổi pin đã được dùng cho thông tin khác.',409);return old;}
  return (await db.query('INSERT INTO himoto.management_contract_battery_swaps(order_id,item_id,vehicle_id,request_id,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *,xmin::text AS revision',[orderId,body.item_id,item.vehicle_id,body.request_id,actor])).rows[0];
 }
 if(body.action!=='confirm'||Object.keys(body).some(key=>!['action','id','revision','order_revision','battery_percent','note','receipt'].includes(key))||!Number.isSafeInteger(body.id)||Number(body.id)<=0||typeof body.revision!=='string'||!/^\d{1,20}$/.test(body.revision)||typeof body.order_revision!=='string'||!/^\d{1,20}$/.test(body.order_revision)||!Number.isInteger(body.battery_percent)||Number(body.battery_percent)<0||Number(body.battery_percent)>100||typeof body.note!=='string'||body.note.length>1000)throw new BatterySwapError('Nhập đúng phần trăm pin, ghi chú và phiên bản lượt đổi pin.');
 const fee=Number(body.battery_percent)<20?100000:0;
 let receipt:ReturnType<typeof parseContractPayment>|undefined;
 if(body.receipt!==undefined){
  if(!fee||!body.receipt||typeof body.receipt!=='object'||Array.isArray(body.receipt)||Object.keys(body.receipt).some(key=>!['request_id','method','account_id','paid_at'].includes(key)))throw new BatterySwapError('Chỉ ghi phiếu thu 100.000 đ khi nhận pin dưới 20%.');
  receipt=parseContractPayment({...body.receipt,revision:body.order_revision,amount:String(fee),note:''});
 }
 const hash=createHash('sha256').update(JSON.stringify({orderId,actor,id:body.id,percentage:body.battery_percent,note:body.note,receipt:receipt?{...receipt,revision:undefined}:null})).digest('hex');
 await db.query('SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[orderId]);
 const swap=(await db.query('SELECT *,xmin::text AS revision FROM himoto.management_contract_battery_swaps WHERE id=$1 AND order_id=$2 FOR UPDATE',[body.id,orderId])).rows[0];
 if(!swap)throw new BatterySwapError('Không tìm thấy lượt đổi pin.',404);
 if(swap.status==='confirmed'){if(swap.confirmation_hash===hash)return swap;throw new BatterySwapError('Lượt đổi pin đã chốt; không thu phí lần hai.',409);}
 if(swap.revision!==body.revision)throw new BatterySwapError('Lượt đổi pin đã thay đổi. Tải lại trước khi xác nhận.',409);
 if(!(await db.query(itemSql+' AND d.id=$2 AND d.vehicle_id=$3',[orderId,swap.item_id,swap.vehicle_id])).rowCount)throw new BatterySwapError('Xe đã trả hoặc đã đổi xe trên hợp đồng. Kiểm tra lại lượt đổi pin.',409);
 let context=await readPaymentContext(db,orderId);
 if(context.revision!==body.order_revision)throw new BatterySwapError('Tiền hợp đồng đã thay đổi. Tải lại trước khi đổi pin.',409);
 if(fee&&(context.total_amount===null||context.total_amount+fee>9999999999999))throw new BatterySwapError('Tổng phí hợp đồng chưa hợp lệ.',409);
 if(fee)await db.query('UPDATE himoto.orders SET total=(total::numeric+$2)::text,updated_at=now() WHERE id=$1',[orderId,fee]);
 let transactionId:number|null=null;
 if(receipt){context=await readPaymentContext(db,orderId);const paid=await recordContractPayment(db,orderId,actor,{...receipt,revision:context.revision,note:`Thu phí pin dưới 20%_${context.code}`});transactionId=paid.transaction_id;await db.query("UPDATE himoto.transactions SET name='order:battery_swap' WHERE id=$1",[transactionId]);}
 return (await db.query(`UPDATE himoto.management_contract_battery_swaps SET status='confirmed',battery_percent=$3,fee=$4,note=$5,confirmed_by=$6,transaction_id=$7,confirmation_hash=$8,confirmed_at=now() WHERE id=$1 AND order_id=$2 RETURNING *,xmin::text AS revision`,[body.id,orderId,body.battery_percent,fee,body.note,actor,transactionId,hash])).rows[0];
}
export { ContractPaymentError };
