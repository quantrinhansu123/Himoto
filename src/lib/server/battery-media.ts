import 'server-only';
import {createHash} from 'node:crypto';
import type {NextRequest} from 'next/server';
import {hasPermission} from '@/lib/management/permissions';
import type {SessionUser} from './management-session';
import {himotoPool} from './himoto-database';
import {withMobileData} from './mobile-context';
import {MobileError} from './mobile-session';
import {MOBILE_HEADERS} from './mobile-response';
import {idempotentMobileWrite,mobileRequestKey} from './mobile-writes';
import {readBatteryWorkflow} from './battery-workflow';
import {BatteryContractError} from './battery-contracts';
import {readPhotoBody} from './photo-body';
import {RecordPhotoError} from './record-photos';
import {cloudflyPhotosEnabled,storeObjectPhoto,readObjectMedia} from './object-media';
import type {BatteryMedia} from '../../../shared/battery-media';
type Target={id:string;eventKey:string;fileId?:string};
export async function batteryMedia(user:SessionUser,target:Target,request:NextRequest):Promise<BatteryMedia|{id:number;revision:string;replayed:boolean}|Response>{
  if(!hasPermission(user,'contracts.read'))throw new MobileError('Không có quyền xem hợp đồng pin.',403,'FORBIDDEN');
  if(request.nextUrl.search||request.method==='GET'&&request.headers.has('idempotency-key'))throw new MobileError('Tham số ảnh pin không hợp lệ.');
  if(!/^[1-9]\d{0,14}$/.test(target.id)||target.eventKey!=='rental'&&!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(target.eventKey))throw new MobileError('Lượt ảnh pin không hợp lệ.');
  if(target.fileId)mobileRequestKey(target.fileId);
  const writing=request.method!=='GET',id=Number(target.id),key=writing?mobileRequestKey(request.headers.get('idempotency-key')):null;
  if(writing&&!target.fileId)throw new MobileError('Thiếu mã ảnh.');
  const photo=request.method==='PUT'?await readPhotoBody(request):null;
  const sha256=photo?createHash('sha256').update(photo.data).digest('hex'):null;
  return withMobileData(user,'',async()=>{
    const db=await himotoPool.connect();try{
      await db.query(writing?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");
      const context=await readBatteryWorkflow(db,id,false),entry=context.history.find(e=>e.request_id===target.eventKey);
      if(target.eventKey!=='rental'&&!entry)throw new MobileError('Không tìm thấy đúng lượt pin / sạc.',404,'NOT_FOUND');
      const grant=target.eventKey==='rental'?'contracts.draft':entry!.action==='return'?'contracts.return':'contracts.renew';
      const canWrite=hasPermission(user,grant)&&context.contract.status!=='cancelled';
      if(writing&&!canWrite)throw new MobileError('Không có quyền bổ sung ảnh của lượt pin này.',403,'FORBIDDEN');
      if(!writing&&target.fileId){
        const file=(await db.query('SELECT * FROM himoto.management_battery_media WHERE battery_contract_id=$1 AND event_key=$2 AND id=$3',[id,target.eventKey,target.fileId])).rows[0];if(!file)throw new MobileError('Không tìm thấy ảnh pin.',404,'NOT_FOUND');
        await db.query('COMMIT');
        if(file.object_key){const remote=await readObjectMedia(file,file.mime_type);return new Response(remote.body,{headers:{...MOBILE_HEADERS,'Content-Type':file.mime_type}});}
        return new Response(new Uint8Array(file.data),{headers:{...MOBILE_HEADERS,'Content-Type':file.mime_type}});
      }
      if(!writing){const rows=(await db.query('SELECT id,mime_type,bytes,created_at FROM himoto.management_battery_media WHERE battery_contract_id=$1 AND event_key=$2 ORDER BY created_at,id LIMIT 100',[id,target.eventKey])).rows;await db.query('COMMIT');return{id,eventKey:target.eventKey,action:entry?.action??'rental',canWrite,rows:rows.map(r=>({id:String(r.id),mimeType:r.mime_type,bytes:r.bytes,createdAt:new Date(r.created_at).toISOString()}))};}
      const receipt=await idempotentMobileWrite(db,user.id,key!,`battery.media:${id}`,{id,eventKey:target.eventKey,fileId:target.fileId,method:request.method,sha256},async()=>{
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`battery-media:${id}:${target.eventKey}`]);
        if(request.method==='DELETE'){const removed=await db.query('DELETE FROM himoto.management_battery_media WHERE battery_contract_id=$1 AND event_key=$2 AND id=$3 RETURNING xmin::text AS revision',[id,target.eventKey,target.fileId]);if(!removed.rowCount)throw new MobileError('Không tìm thấy ảnh cần xóa.',404,'NOT_FOUND');return{id,revision:removed.rows[0].revision};}
        if(!photo)throw new MobileError('Chọn ảnh để lưu.');
        const count=(await db.query('SELECT count(*)::int AS n FROM himoto.management_battery_media WHERE battery_contract_id=$1 AND event_key=$2',[id,target.eventKey])).rows[0];if(count.n>=100)throw new MobileError('Mỗi lượt pin tối đa 100 ảnh.');
        const stored=cloudflyPhotosEnabled()?await storeObjectPhoto(photo.data,photo.mimeType,user.id,key!):null;
        const saved=(await db.query(`INSERT INTO himoto.management_battery_media(battery_contract_id,event_key,id,created_by,mime_type,sha256,bytes,data,object_bucket,object_key,object_etag,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING xmin::text AS revision`,[id,target.eventKey,target.fileId,user.id,photo.mimeType,sha256,photo.data.length,stored?null:photo.data,stored?.object_bucket??null,stored?.object_key??null,stored?.object_etag??null,key])).rows[0];return{id,revision:saved.revision};
      });await db.query('COMMIT');return receipt;
    }catch(error){await db.query('ROLLBACK').catch(()=>{});if(error instanceof RecordPhotoError||error instanceof BatteryContractError)throw new MobileError(error.message,error.status);throw error;}finally{db.release();}
  });
}
