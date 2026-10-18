import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { dataAccess } from '@/lib/server/access-context';
import { copyContractCustomerPhotos } from '@/lib/server/contract-customer-photos';
import { RecordPhotoError, parsePhotoTarget, readRecordPhotos } from '@/lib/server/record-photos';

export const runtime = 'nodejs';
async function GETHandler(request: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  try {
    const raw = await params, target = parsePhotoTarget(raw.entity, raw.id);
    const data = await readRecordPhotos(himotoPool, target.entity, target.id);
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: error instanceof RecordPhotoError ? error.message : 'Không tải được ảnh hồ sơ.' }, { status: error instanceof RecordPhotoError ? error.status : 500 });
  }
}

export const GET = withAccessRequest(GETHandler);
export const POST = withAccessRequest(async (_request:NextRequest,{params}:{params:Promise<{entity:string;id:string}>})=>{
  let client;
  try {
    const raw=await params,target=parsePhotoTarget(raw.entity,raw.id),actor=dataAccess.getStore()?.id;
    if(target.entity!=='contracts'||!actor)throw new RecordPhotoError('Yêu cầu lấy giấy tờ không hợp lệ.');
    client=await himotoPool.connect();await client.query('BEGIN');
    const data=await copyContractCustomerPhotos(client,target.id,actor);
    await client.query('COMMIT');
    return NextResponse.json({status:'success',data},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    if(client)await client.query('ROLLBACK').catch(()=>{});
    return NextResponse.json({status:'error',message:error instanceof RecordPhotoError?error.message:'Không lấy được giấy tờ từ hồ sơ khách. Thử lại trước khi hoàn tất.'},{status:error instanceof RecordPhotoError?error.status:500});
  } finally {client?.release();}
});
