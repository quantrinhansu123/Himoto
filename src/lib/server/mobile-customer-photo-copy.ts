import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {NextRequest} from 'next/server';
import type {SessionUser} from './management-session';
import {withMobileMedia} from './mobile-record-media';
import {MobileError} from './mobile-session';
import {idempotentMobileWrite,mobileBody,mobileRequestKey} from './mobile-writes';
import {copyContractCustomerPhotos} from './contract-customer-photos';
import {customerPhotoCopyOperation,isCustomerPhotoCopyReview,isCustomerPhotoCopyReceipt,type MobileCustomerPhotoCopyReview,type MobileCustomerPhotoCopyReceipt} from '../../../shared/mobile-customer-photo-copy';
import {isMediaRevision} from '../../../shared/mobile-record-media';

type DB=Pick<PoolClient,'query'>;
const sourcePattern='^(id_front|id_back|driver_license)(-extra-[1-9][0-9]{0,14})?$';
const targetPattern='^(customer-id-front|customer-id-back|customer-driver-license)(-extra-[1-9][0-9]{0,14})?$';
const mapped=(slot:string)=>slot.replace(/^id_front/,'customer-id-front').replace(/^id_back/,'customer-id-back').replace(/^driver_license/,'customer-driver-license');
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const target=(id:number)=>({entity:'contracts' as const,id,kind:'rental' as const,referenceId:id});
const invalid=()=>new MobileError('Chưa xác nhận được phiếu lấy giấy tờ. Giữ mã để đối chiếu.',503,'INVALID_WRITE_RECEIPT');
const conflict=()=>new MobileError('Hợp đồng hoặc giấy tờ đã thay đổi. Đối chiếu lần trước rồi tải lại để tiếp tục.',409,'CUSTOMER_PHOTO_COPY_REVIEW_REQUIRED');
function orderId(raw:string){if(!/^[1-9]\d{0,14}$/.test(raw))throw new MobileError('Hợp đồng không hợp lệ.',400,'INVALID_MEDIA_TARGET');return Number(raw);}
async function parent(db:DB,id:number,lock=false){
  const row=(await db.query('SELECT id,customer_id,xmin::text AS revision,deleted_at FROM himoto.orders WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
  if(!row)throw new MobileError('Không tìm thấy hợp đồng trong phạm vi hiện tại.',404,'NOT_FOUND');return row;
}
async function destinations(db:DB,id:number){return (await db.query('SELECT slot,xmin::text AS revision FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot ~ $3 ORDER BY slot',[ 'contracts',id,targetPattern])).rows;}
async function review(db:DB,id:number,lock=false):Promise<MobileCustomerPhotoCopyReview>{
  const order=await parent(db,id,lock);if(order.deleted_at!=null)throw new MobileError('Hợp đồng đã xóa.',404,'NOT_FOUND');
  const customerId=order.customer_id==null?null:Number(order.customer_id);
  const sources=customerId===null?[]:(await db.query('SELECT slot,xmin::text AS revision FROM himoto.management_record_photos WHERE entity_type=$1 AND entity_id=$2 AND slot ~ $3 ORDER BY slot',['customers',customerId,sourcePattern])).rows;
  const existing=await destinations(db,id),slots=new Set(existing.map(row=>row.slot)),presentCount=sources.filter(row=>slots.has(mapped(row.slot))).length;
  const result={id,revision:String(order.revision),customerId,sourceCount:sources.length,presentCount,missingCount:sources.length-presentCount,
    snapshot:hash({id,revision:String(order.revision),customerId,sources,existing}),observedAt:new Date().toISOString()};
  if(!isCustomerPhotoCopyReview(result))throw invalid();return result;
}
async function original(db:DB,user:SessionUser,key:string,id:number):Promise<MobileCustomerPhotoCopyReceipt|null>{
  const row=(await db.query('SELECT r.operation,r.resource_id,r.resource_revision,c.order_id,c.proof FROM himoto.management_mobile_requests r LEFT JOIN himoto.management_mobile_customer_photo_copies c ON c.user_id=r.user_id AND c.request_id=r.request_id WHERE r.user_id=$1 AND r.request_id=$2',[user.id,key])).rows[0];
  if(!row||row.resource_id==null||row.operation!==customerPhotoCopyOperation(id))return null;
  if(!isCustomerPhotoCopyReceipt(row.proof)||row.proof.requestId!==key||row.proof.actorId!==user.id||row.proof.id!==id||Number(row.order_id)!==id||Number(row.resource_id)!==id||row.resource_revision!==row.proof.revision)throw invalid();
  const order=await parent(db,id),result={...row.proof,replayed:true};
  result.parentCurrent=order.deleted_at==null&&String(order.revision)===result.revision&&(order.customer_id==null?null:Number(order.customer_id))===result.customerId;
  // Source edits never change a copied contract photo. Compare destinations only.
  result.photosCurrent=hash(await destinations(db,id))===result.resultSnapshot;
  result.current=result.parentCurrent&&result.photosCurrent;return result;
}
export async function readCustomerPhotoCopyReview(user:SessionUser,raw:string,request:NextRequest){
  const id=orderId(raw);if(request.nextUrl.search||request.headers.has('idempotency-key'))throw new MobileError('Không hỗ trợ bộ lọc lấy giấy tờ.',400,'INVALID_QUERY');
  return withMobileMedia(user,target(id),db=>review(db,id));
}
export async function readCustomerPhotoCopyReceipt(user:SessionUser,raw:string,key:string){
  const id=orderId(raw);mobileRequestKey(key);return withMobileMedia(user,target(id),async db=>({receipt:await original(db,user,key,id)}));
}
export async function copyMobileCustomerPhotos(user:SessionUser,raw:string,request:NextRequest):Promise<MobileCustomerPhotoCopyReceipt>{
  const id=orderId(raw),key=mobileRequestKey(request.headers.get('idempotency-key')),revision=request.headers.get('x-record-revision'),snapshot=request.headers.get('x-customer-photo-snapshot');
  if(request.nextUrl.search||!isMediaRevision(revision)||!snapshot||!/^[a-f0-9]{64}$/.test(snapshot)||Object.keys(await mobileBody(request,64)).length)
    throw new MobileError('Cần phiên bản hợp đồng và giấy tờ đã rà soát.',400,'INVALID_CUSTOMER_PHOTO_COPY');
  try{return await withMobileMedia(user,target(id),async db=>{
    const saved=await idempotentMobileWrite(db,user.id,key,customerPhotoCopyOperation(id),{id,revision,snapshot},async()=>{
      const before=await review(db,id,true);if(before.revision!==revision||before.snapshot!==snapshot)throw conflict();
      // Use the exact web copy domain, after metadata/images, in its own transaction.
      const {copied}=await copyContractCustomerPhotos(db,id,user.id);if(copied!==before.missingCount)throw conflict();
      const proof:MobileCustomerPhotoCopyReceipt={id,revision,replayed:false,requestId:key,customerId:before.customerId,copied,sourceCount:before.sourceCount,presentCount:before.presentCount,
        resultSnapshot:hash(await destinations(db,id)),actorId:user.id,actorName:String(user.name??'').slice(0,4000),recordedAt:new Date().toISOString(),parentCurrent:true,photosCurrent:true,current:true};
      if(!isCustomerPhotoCopyReceipt(proof))throw invalid();
      await db.query('INSERT INTO himoto.management_mobile_customer_photo_copies(user_id,request_id,order_id,proof) VALUES($1,$2,$3,$4::jsonb)',[user.id,key,id,JSON.stringify(proof)]);
      return{id,revision};
    });
    const receipt=await original(db,user,key,id);if(!receipt||receipt.revision!==saved.revision)throw invalid();return{...receipt,replayed:saved.replayed};
  },'repeatable');}catch(error){if((error as {code?:string}).code==='40001')throw conflict();throw error;}
}
