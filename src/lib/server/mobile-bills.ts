import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { NextRequest } from "next/server";
import type { SessionUser } from "./management-session";
import type { MobileBillReceipt, MobileBillInfo } from "../../../shared/mobile-bills";
import { isMobileBillReceipt, isMobileBillInfo } from "../../../shared/mobile-bills";
import { validPaymentRevision } from "../../../shared/mobile-finance";
import { withMobileData } from "./mobile-context";
import { himotoPool } from "./himoto-database";
import { MobileError } from "./mobile-session";
import { mobileFinanceId, requireMobileFinance } from "./mobile-finance";
import { requireMobileRenewal, mobileRenewalBlockedReason, mobileRenewalItems } from "./mobile-renewals";
import { readPaymentContext, ContractPaymentError } from "./contract-payments";
import { nextContractRenewalVersion } from "./contract-renewal-version";
import { RecordPhotoError, validatePhotoBytes, writeRecordPhoto } from "./record-photos";
import { idempotentMobileWrite, mobileRequestKey } from "./mobile-writes";
import { readCloudinaryPhoto } from "./cloudinary-photos";
import {cloudflyPhotosEnabled,storeObjectPhoto,readObjectMedia} from './object-media';
import { renewalCollectionPeriod, RenewalCollectionPeriodError } from "./renewal-collection-period";

const MAX_BYTES = 2 * 1024 * 1024;
const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
type BillAudience = "renewal" | "collection";
const authorize = (user: SessionUser, write: boolean, audience: BillAudience) => audience === "collection" ? requireMobileFinance(user, write) : requireMobileRenewal(user);
const operation = (audience: BillAudience) => audience === "collection" ? "payment.bill" : "renewal.bill";
async function transaction<T>(user: SessionUser, write: boolean, task: (client: PoolClient) => Promise<T>, audience: BillAudience = "renewal") {
  authorize(user, write, audience);
  return withMobileData(user, "", async () => {
    const client = await himotoPool.connect();
    try {
      await client.query(write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='20s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await task(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof RecordPhotoError || error instanceof ContractPaymentError)
        throw new MobileError(error.message,error.status,error.status===404?"NOT_FOUND":"BILL_CONFLICT");
      if(error instanceof RenewalCollectionPeriodError)throw new MobileError(error.message,409,"BILL_CONFLICT");
      throw error;
    } finally { client.release(); }
  });
}
async function readBytes(request: NextRequest) {
  if (request.headers.get("content-type") !== "image/jpeg") throw new MobileError("Bill cần là ảnh JPEG đã chuẩn bị.",400,"INVALID_BILL");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length)>MAX_BYTES)) throw new MobileError("Mỗi ảnh bill tối đa 2 MB.",413,"BILL_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new MobileError("Chưa có ảnh bill.",400,"INVALID_BILL");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size>MAX_BYTES) { await reader.cancel(); throw new MobileError("Mỗi ảnh bill tối đa 2 MB.",413,"BILL_TOO_LARGE"); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  try { validatePhotoBytes("image/jpeg",bytes); }
  catch (error) { if (error instanceof RecordPhotoError) throw new MobileError(error.message,error.status,"INVALID_BILL"); throw error; }
  return bytes;
}
async function receipt(client: PoolClient, user: SessionUser, key: string, audience: BillAudience = "renewal"): Promise<MobileBillReceipt | null> {
  const row = (await client.query(`SELECT r.operation,r.resource_id,r.resource_revision,
    b.renewal_version,b.slot,b.sha256,b.photo_revision,b.byte_count
    FROM himoto.management_mobile_requests r LEFT JOIN himoto.management_mobile_bills b
      ON b.user_id=r.user_id AND b.request_id=r.request_id AND b.order_id=r.resource_id
    WHERE r.user_id=$1 AND r.request_id=$2`,[user.id,key])).rows[0];
  if (!row || row.resource_id == null || !String(row.operation).startsWith(`${operation(audience)}:`)) return null;
  const id=Number(row.resource_id);
  if (!Number.isSafeInteger(id) || id<=0 || row.operation!==`${operation(audience)}:${id}`)
    throw new MobileError("Kết quả lưu bill cần đối chiếu.",409,"INVALID_WRITE_RECEIPT");
  if (!(await client.query("SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL",[id])).rowCount)
    throw new MobileError("Hợp đồng đã ra ngoài phạm vi truy cập hiện tại.",403,"FORBIDDEN");
  const photo = (await client.query(`SELECT xmin::text AS revision,data,storage_sha256 FROM himoto.management_record_photos
    WHERE entity_type='contracts' AND entity_id=$1 AND slot=$2`,[id,row.slot])).rows[0];
  const result = {id,revision:String(row.resource_revision),replayed:true,version:Number(row.renewal_version),slot:row.slot,
    sha256:String(row.sha256).trim(),photoRevision:String(row.photo_revision),bytes:Number(row.byte_count),
    current:!!photo && String(photo.revision)===String(row.photo_revision) && (photo.data!=null?digest(photo.data):photo.storage_sha256)===String(row.sha256).trim()};
  if (!isMobileBillReceipt(result)) throw new MobileError("Kết quả lưu bill cần đối chiếu.",409,"INVALID_WRITE_RECEIPT");
  return result;
}
export async function readMobileBillReceipt(user: SessionUser, key: string, audience: BillAudience = "renewal") {
  authorize(user, false, audience); mobileRequestKey(key);
  return transaction(user,false,async client=>({receipt:await receipt(client,user,key,audience)}),audience);
}

function target(value: string, versionValue: string) {
  const id=mobileFinanceId(value),version=mobileFinanceId(versionValue);
  if(version<2)throw new MobileError("Phiên bản gia hạn không hợp lệ.",400,"INVALID_BILL");
  return {id,version,slot:`renewal-${version}-document-1`};
}
async function photoSnapshot(user: SessionUser, value: string, versionValue: string, withData: boolean, audience: BillAudience = "renewal") {
  const found=target(value,versionValue);
  return transaction(user,false,async client=>{
    if(!(await client.query("SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL",[found.id])).rowCount)
      throw new MobileError("Không tìm thấy hợp đồng.",404,"NOT_FOUND");
    const photo=(await client.query(`SELECT xmin::text AS revision,mime_type,updated_at,COALESCE(storage_bytes,octet_length(data)) AS byte_count${withData?",data,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version,object_bucket,object_key,object_etag":""}
      FROM himoto.management_record_photos WHERE entity_type='contracts' AND entity_id=$1 AND slot=$2`,[found.id,found.slot])).rows[0];
    const info:MobileBillInfo={...found,photoRevision:photo?String(photo.revision):null,mimeType:photo?.mime_type??null,
      bytes:photo?.byte_count==null?null:Number(photo.byte_count),updatedAt:photo?new Date(photo.updated_at).toISOString():null};
    if(!isMobileBillInfo(info))throw new MobileError("Ảnh bill hiện tại cần kiểm tra trên web.",409,"BILL_REVIEW_REQUIRED");
    return{info,photo};
  },audience);
}
export async function readMobileBillInfo(user: SessionUser, value: string, versionValue: string, audience: BillAudience = "renewal") {
  authorize(user, false, audience);
  return (await photoSnapshot(user,value,versionValue,false,audience)).info;
}
export async function readMobileBillImage(user: SessionUser, value: string, versionValue: string, revision: string, audience: BillAudience = "renewal") {
  authorize(user, false, audience);
  if(!validPaymentRevision(revision))throw new MobileError("Phiên bản ảnh bill không hợp lệ.",400,"INVALID_BILL");
  const {info,photo}=await photoSnapshot(user,value,versionValue,true,audience);
  if(!photo)throw new MobileError("Chưa có ảnh bill.",404,"NOT_FOUND");
  if(info.photoRevision!==revision)throw new MobileError("Ảnh bill đã thay đổi. Tải lại để xem đúng ảnh hiện tại.",409,"BILL_CONFLICT");
  if(photo.data!=null) return{data:new Uint8Array(photo.data),mimeType:info.mimeType!,revision};
  if(!photo.cloudinary_public_id&&!photo.object_key)throw new MobileError("Không đọc được ảnh bill. Kiểm tra hồ sơ trên web.",409,"BILL_REVIEW_REQUIRED");
  // Proxy trusted storage bytes after releasing the DB transaction. The device
  // never sends its bearer token to a storage redirect or third-party host.
  const remote=photo.object_key?await readObjectMedia(photo,info.mimeType!):await readCloudinaryPhoto(photo),reader=remote.body?.getReader();
  if(!remote.ok || !reader)throw new MobileError("Chưa tải được ảnh bill. Thử lại.",503,"SERVICE_UNAVAILABLE");
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
    if(size>MAX_BYTES){await reader.cancel();throw new MobileError("Ảnh bill vượt giới hạn xem trên ứng dụng. Kiểm tra trên web.",413,"BILL_TOO_LARGE");}chunks.push(chunk.value);}}
  finally{reader.releaseLock();}
  if(!size)throw new MobileError("Chưa tải được ảnh bill. Thử lại.",503,"SERVICE_UNAVAILABLE");
  return{data:new Uint8Array(Buffer.concat(chunks)),mimeType:info.mimeType!,revision};
}

export async function uploadMobileRenewalBill(user: SessionUser, value: string, versionValue: string, request: NextRequest, audience: BillAudience = "renewal"): Promise<MobileBillReceipt> {
  authorize(user, true, audience);
  const id=mobileFinanceId(value),version=mobileFinanceId(versionValue),key=mobileRequestKey(request.headers.get("idempotency-key"));
  const revision=request.headers.get("x-contract-revision"), expected=request.headers.get("x-bill-revision");
  if(version<2 || !validPaymentRevision(revision) || !(expected==="0" || validPaymentRevision(expected)) || request.nextUrl.search)
    throw new MobileError("Phiên bản hợp đồng hoặc bill chưa hợp lệ.",400,"INVALID_BILL");
  const historical=request.headers.get("x-renewal-backfill"),backfill=historical==="1";
  if(historical!==null&&(!backfill||audience!=="renewal"))throw new MobileError("Chế độ bill lịch sử không hợp lệ.",400,"INVALID_BILL");
  const data=await readBytes(request),sha256=digest(data),slot=`renewal-${version}-document-1`;
  const storedPhoto=cloudflyPhotosEnabled()?await storeObjectPhoto(data,'image/jpeg',user.id,key):undefined;
  return transaction(user,true,async client=>{
    const saved=await idempotentMobileWrite(client,user.id,key,`${operation(audience)}:${id}`,{id,version,revision,expected,sha256,bytes:data.length,...(backfill?{backfill:true}:{})},async()=>{
      const order=(await client.query("SELECT xmin::text AS revision,draft_payload FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id])).rows[0];
      if(!order)throw new MobileError("Không tìm thấy hợp đồng.",404,"NOT_FOUND");
      if(order.revision!==revision)throw new MobileError("Hợp đồng đã thay đổi. Đối chiếu và tải lại trước khi lưu bill.",409,"BILL_CONFLICT");
      const composer=order.draft_payload?.management_composer;
      if(audience==="collection"){
        // Attach evidence only to a unique live saved period. Finance cannot
        // use this route to reserve or create a future renewal version.
        renewalCollectionPeriod(id,composer?.versions,version,[]);
      }else{
        const context=await readPaymentContext(client,id,{page:1,size:0,asOf:Date.now()});
        const items=await mobileRenewalItems(client,id,context,backfill);
        const blocked=mobileRenewalBlockedReason(context,!!composer?.installment_plan,backfill,items.length);
        if(blocked)throw new MobileError(blocked,409,"BILL_CONFLICT");
        if(await nextContractRenewalVersion(client,id,composer?.versions)!==version)
          throw new MobileError("Phiên bản gia hạn đã thay đổi. Giữ ảnh và rà soát lại đúng phiên bản trước khi lưu.",409,"BILL_CONFLICT");
      }
      const previous=(await client.query(`SELECT xmin::text AS revision FROM himoto.management_record_photos
        WHERE entity_type='contracts' AND entity_id=$1 AND slot=$2 FOR UPDATE`,[id,slot])).rows[0];
      if((previous?.revision??"0")!==expected)
        throw new MobileError("Bill đã được người khác thay đổi. Đối chiếu ảnh hiện tại trước khi thay thế.",409,"BILL_CONFLICT");
      await writeRecordPhoto(client,"contracts",id,slot,"image/jpeg",data,user.id,storedPhoto);
      const photo=(await client.query(`SELECT xmin::text AS revision FROM himoto.management_record_photos
        WHERE entity_type='contracts' AND entity_id=$1 AND slot=$2`,[id,slot])).rows[0];
      if(!validPaymentRevision(photo?.revision))throw new MobileError("Chưa xác nhận được bill đã lưu. Giữ mã để đối chiếu.",503,"INVALID_WRITE_RECEIPT");
      await client.query(`INSERT INTO himoto.management_mobile_bills(user_id,request_id,order_id,renewal_version,slot,sha256,photo_revision,byte_count)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[user.id,key,id,version,slot,sha256,photo.revision,data.length]);
      return{id,revision};
    });
    const found=await receipt(client,user,key,audience);
    if(!found)throw new MobileError("Chưa xác nhận được bill đã lưu. Giữ mã để đối chiếu.",503,"INVALID_WRITE_RECEIPT");
    return{...found,replayed:saved.replayed};
  },audience);
}
