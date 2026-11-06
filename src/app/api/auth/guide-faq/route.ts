import { NextRequest, NextResponse } from 'next/server';
import { withAccessRequest } from '@/lib/server/access-request';
import { dataAccess } from '@/lib/server/access-context';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { hasPermission } from '@/lib/management/permissions';
import { FAQ_CATEGORIES } from '@/lib/management/guide-faq';
import { attendancePhotoMime } from '@/lib/server/attendance';
import { ensureGuideFaqSchema } from '@/lib/server/guide-faq-schema';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime='nodejs';
const fail=(message:string,status=400)=>NextResponse.json({status:'error',message},{status});
async function handle(request:NextRequest) {
  const user=dataAccess.getStore()! as NonNullable<ReturnType<typeof dataAccess.getStore>> & {name:string};
  let client;
  try {
    await ensureGuideFaqSchema();
    if(request.method==='GET') {
      const photo=request.nextUrl.searchParams.get('photo');
      if(photo) {
        if(!/^[1-9]\d{0,14}$/.test(photo))return fail('Ảnh không hợp lệ.');
        const row=(await ownerDatabase.query('SELECT mime,photo FROM himoto.management_guide_faq_images WHERE id=$1',[photo])).rows[0];
        if(!row)return fail('Không tìm thấy ảnh.',404);
        return new NextResponse(new Uint8Array(row.photo),{headers:{'Content-Type':row.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
      }
      const rows=(await ownerDatabase.query(`SELECT f.id,f.category,f.question,f.asker_name,f.answer,f.answerer_name,f.revision,f.created_at,
        ARRAY(SELECT i.id::integer FROM himoto.management_guide_faq_images i WHERE i.faq_id=f.id ORDER BY i.id) AS images
        FROM himoto.management_guide_faq f ORDER BY f.created_at DESC,f.id DESC LIMIT 500`)).rows.map(row=>({...row,id:Number(row.id)}));
      return NextResponse.json({status:'success',data:{rows,user_name:user.name,can_answer:hasPermission(user,'settings.write')}},{headers:{'Cache-Control':'no-store'}});
    }
    if(Number(request.headers.get('content-length'))>22*1024*1024)return fail('Tổng ảnh tối đa 20 MB.',413);
    const form=await request.formData(),action=form.get('action');
    if(action==='ask') {
      const category=String(form.get('category')||''),question=String(form.get('question')||'').trim(),key=String(form.get('request_id')||'');
      if(!FAQ_CATEGORIES.some(value=>value===category)||!question||question.length>2000||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))return fail('Kiểm tra hạng mục và câu hỏi (tối đa 2.000 ký tự).');
      await ownerDatabase.query(`INSERT INTO himoto.management_guide_faq(request_id,category,question,asked_by,asker_name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(request_id) DO NOTHING`,[key,category,question,user.id,user.name]);
      return NextResponse.json({status:'success'});
    }
    if(action!=='answer')return fail('Thao tác không hợp lệ.');
    if(!hasPermission(user,'settings.write'))return fail('Tài khoản chưa có quyền trả lời.',403);
    const id=Number(form.get('id')),revision=Number(form.get('revision')),answer=String(form.get('answer')||'').trim();
    if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(revision)||revision<1||answer.length>10000)return fail('Câu trả lời hoặc phiên bản không hợp lệ.');
    let keep:unknown;try{keep=JSON.parse(String(form.get('keep_images')||'[]'));}catch{return fail('Danh sách ảnh không hợp lệ.');}
    if(!Array.isArray(keep)||keep.some(value=>!Number.isSafeInteger(value)||value<1)||new Set(keep).size!==keep.length)return fail('Danh sách ảnh không hợp lệ.');
    const files=form.getAll('images');
    if(keep.length+files.length>10)return fail('Mỗi câu trả lời tối đa 10 ảnh.');
    const photos=[];
    for(const file of files){if(!(file instanceof File)||file.size>2*1024*1024)return fail('Mỗi ảnh tối đa 2 MB.');const bytes=Buffer.from(await file.arrayBuffer());let mime;try{mime=attendancePhotoMime(bytes);}catch{return fail('Chỉ nhận ảnh JPEG, PNG, WebP, tối đa 2 MB.');}photos.push({bytes,mime});}
    if(!answer&&!keep.length&&!photos.length)return fail('Nhập câu trả lời hoặc thêm ảnh.');
    client=await ownerDatabase.connect();await client.query('BEGIN');
    const updated=await client.query(`UPDATE himoto.management_guide_faq SET answer=$3,answered_by=$4,answerer_name=$5,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$2 RETURNING id`,[id,revision,answer,user.id,user.name]);
    if(!updated.rowCount){await client.query('ROLLBACK');return fail('Nội dung đã thay đổi. Làm mới để kiểm tra trước khi lưu.',409);}
    const existing=(await client.query('SELECT id::integer AS id FROM himoto.management_guide_faq_images WHERE faq_id=$1',[id])).rows;
    if(keep.some(value=>!existing.some(row=>row.id===value))){await client.query('ROLLBACK');return fail('Ảnh không thuộc câu trả lời này.');}
    await client.query('DELETE FROM himoto.management_guide_faq_images WHERE faq_id=$1 AND NOT(id=ANY($2::bigint[]))',[id,keep]);
    for(const photo of photos)await client.query('INSERT INTO himoto.management_guide_faq_images(faq_id,mime,photo) VALUES($1,$2,$3)',[id,photo.mime,photo.bytes]);
    await client.query('COMMIT');return NextResponse.json({status:'success'});
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});return failureResponse('Không tải hoặc lưu được câu hỏi. Làm mới để kiểm tra.',error);}finally{client?.release();}
}
export const GET=withAccessRequest(handle);
export const POST=withAccessRequest(handle);
