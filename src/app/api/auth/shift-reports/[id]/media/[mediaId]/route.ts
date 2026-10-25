import { NextRequest,NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { himotoPool } from '@/lib/server/himoto-database';
import { dataAccess } from '@/lib/server/access-context';
import { hasPermission } from '@/lib/management/permissions';
import { SHIFT_PHOTOS } from '@/lib/management/shift-reports';
import { RecordPhotoError,validatePhotoBytes } from '@/lib/server/record-photos';
import { verifyPhotoReceipt,shiftCloudAsset,readCloudinaryPhoto,cleanupConvertedVideo } from '@/lib/server/cloudinary-photos';
import { objectVideoUrl } from '@/lib/server/cloudfly-videos';
import { isBrowserVideoReceipt, verifyBrowserVideoReceipt, readyBrowserVideo } from '@/lib/server/browser-videos';
import type { BrowserVideoReceipt } from '@/lib/management/video-media';
import { ShiftRequestError,shiftRequestId,shiftRequestHash,readShiftReceipt,writeShiftReceipt } from '@/lib/server/shift-report-requests';
import { failureResponse } from '@/lib/server/public-failure';
export const runtime='nodejs';
export const maxDuration=300;
type Context={params:Promise<{id:string;mediaId:string}>};
async function handle(request:NextRequest,context:Context){
  const {id,mediaId}=await context.params,actor=dataAccess.getStore()!;let client;
  try{
    if(!/^[1-9]\d{0,14}$/.test(id)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaId))throw new RecordPhotoError('Minh chứng không hợp lệ.');
    const writing=request.method!=='GET',stage=request.headers.get('x-shift-stage'),category=request.headers.get('x-shift-category');
    const revision=Number(request.headers.get('x-report-revision')),key=writing?shiftRequestId(request.headers):null;
    if(writing&&(!key||!Number.isSafeInteger(revision)||revision<1||!['pgd','audit'].includes(stage||'')||!SHIFT_PHOTOS.some(([slot])=>slot===category)))throw new RecordPhotoError('Kiểm tra mục minh chứng và phiên bản báo cáo.');
    if(writing&&!(stage==='audit'?hasPermission(actor,'shift.review'):hasPermission(actor,'contracts.draft')||hasPermission(actor,'finance.write')))throw new RecordPhotoError('Không có quyền thay đổi minh chứng.',403);
    let bytes:Buffer|undefined,cloud:ReturnType<typeof verifyPhotoReceipt>|BrowserVideoReceipt|undefined,asset:Awaited<ReturnType<typeof shiftCloudAsset>>|undefined;
    let mime=request.headers.get('content-type')||'',filename=(request.headers.get('x-file-name')||'minh-chung').slice(0,2048);
    try{filename=decodeURIComponent(filename).slice(0,255);}catch{throw new RecordPhotoError('Tên tệp không hợp lệ.');}
    if(request.method==='PUT'){
      const reader=request.body?.getReader();if(!reader)throw new RecordPhotoError('Chọn tệp minh chứng.');
      const parts:Uint8Array[]=[];let size=0;
      try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>(mime==='application/json'?2048:2097152)){await reader.cancel();throw new RecordPhotoError('Tệp gửi lên quá lớn.',413);}parts.push(part.value);}}finally{reader.releaseLock();}
      bytes=Buffer.concat(parts);
      if(mime==='application/json'){const value=JSON.parse(bytes.toString('utf8'));cloud=isBrowserVideoReceipt(value)?verifyBrowserVideoReceipt(value,actor.id):verifyPhotoReceipt(value,actor.id);if(cloud.resource_type!=='video')throw new RecordPhotoError('Ảnh cần được xử lý và gửi trực tiếp; ô tải dành cho video.');bytes=undefined;}
      else validatePhotoBytes(mime,bytes);
    }
    const hash=shiftRequestHash(JSON.stringify({kind:'shift-media',method:request.method,actor:actor.id,id,mediaId,stage,category,revision,filename,mime,cloud}),bytes||'');
    client=await himotoPool.connect();await client.query('BEGIN');
    const receipt=await readShiftReceipt(client,key,actor.id,hash);if(receipt){await client.query('COMMIT');client.release();client=undefined;if(cloud&&!isBrowserVideoReceipt(cloud))await cleanupConvertedVideo(cloud);return NextResponse.json({data:receipt});}
    const report=(await client.query('SELECT store_id,status,revision FROM himoto.management_shift_reports WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!report)throw new RecordPhotoError('Không tìm thấy báo cáo.',404);
    const existing=(await client.query('SELECT * FROM himoto.management_shift_media WHERE id=$1 AND report_id=$2',[mediaId,id])).rows[0];
    if(!writing){
      if(!existing)throw new RecordPhotoError('Không tìm thấy minh chứng.',404);
      await client.query('COMMIT');client.release();client=undefined;
      if(existing.object_key)return NextResponse.redirect(await objectVideoUrl(existing),{status:307,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
      let body:BodyInit,status=200;const headers:Record<string,string>={'Content-Type':existing.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
      if(existing.cloudinary_public_id){const remote=await readCloudinaryPhoto(existing,request.headers.get('range'));body=remote.body!;status=remote.status;for(const name of ['Content-Length','Content-Range','Accept-Ranges']){const value=remote.headers.get(name);if(value)headers[name]=value;}}
      else body=new Uint8Array(existing.data);
      return new Response(body,{status,headers});
    }
    if(stage==='pgd'&&report.status!=='draft')throw new RecordPhotoError('PGD đã chốt, minh chứng kiểm kê được giữ nguyên.',409);
    if(stage==='audit'){
      const audit=(await client.query('SELECT status FROM himoto.management_shift_audits WHERE report_id=$1',[id])).rows[0];
      if(report.status!=='submitted'||audit?.status==='confirmed')throw new RecordPhotoError('PGD chưa chốt hoặc KTNB đã xác nhận, không thể sửa minh chứng.',409);
    }
    if(report.revision!==revision)throw new RecordPhotoError('Báo cáo đã thay đổi. Tải lại trước khi sửa minh chứng.',409);
    if(request.method==='DELETE'){
      if(!existing||existing.stage!==stage)throw new RecordPhotoError('Không tìm thấy minh chứng cần xóa.',404);
      await client.query('DELETE FROM himoto.management_shift_media WHERE id=$1 AND report_id=$2',[mediaId,id]);
    }else{
      if(existing)throw new RecordPhotoError('Minh chứng này đã được lưu. Tải lại báo cáo để kiểm tra.',409);
      if(cloud){asset=isBrowserVideoReceipt(cloud)?{cloud_name:'',mime_type:'video/mp4',...await readyBrowserVideo(cloud,actor.id,180)}:await shiftCloudAsset(cloud);mime=asset.mime_type;}
      const count=(await client.query(`SELECT (count(*) FILTER(WHERE mime_type LIKE 'image/%')+CASE WHEN $2='pgd' THEN (SELECT count(*) FROM himoto.management_shift_photos WHERE report_id=$1) ELSE 0 END)::int AS images,count(*) FILTER(WHERE mime_type LIKE 'video/%')::int AS videos FROM himoto.management_shift_media WHERE report_id=$1 AND stage=$2`,[id,stage])).rows[0];
      if(mime.startsWith('video/')?count.videos>=3:count.images>=60)throw new RecordPhotoError('Mỗi phần PGD / KTNB tối đa 60 ảnh và 3 video.');
      const object=asset&&'object_key' in asset?asset:null;
      await client.query(`INSERT INTO himoto.management_shift_media(id,report_id,store_id,category,stage,filename,mime_type,data,cloudinary_public_id,cloudinary_cloud_name,cloudinary_version,created_by,object_bucket,object_key,object_etag)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[mediaId,id,report.store_id,category,stage,filename,mime,bytes??null,object?null:cloud&&!isBrowserVideoReceipt(cloud)?cloud.public_id:null,object?null:asset?.cloud_name??null,object?null:cloud&&!isBrowserVideoReceipt(cloud)?cloud.version:null,actor.id,object?.object_bucket??null,object?.object_key??null,object?.object_etag??null]);
    }
    const updated=(await client.query('UPDATE himoto.management_shift_reports SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision',[id])).rows[0];
    await writeShiftReceipt(client,key,actor.id,Number(report.store_id),hash,updated);await client.query('COMMIT');client.release();client=undefined;if(cloud&&!isBrowserVideoReceipt(cloud))await cleanupConvertedVideo(cloud);return NextResponse.json({data:updated});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});const known=error instanceof RecordPhotoError||error instanceof ShiftRequestError;return known?NextResponse.json({message:error.message},{status:error.status}):failureResponse('Không xử lý được minh chứng. Giữ tệp và thử lại.',error);}finally{client?.release();}
}
export const GET=withAccessRequest(handle);
export const PUT=withAccessRequest(handle);
export const DELETE=withAccessRequest(handle);
