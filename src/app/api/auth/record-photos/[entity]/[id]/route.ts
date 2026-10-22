import { withAccessRequest } from '@/lib/server/access-request';
import { NextRequest, NextResponse } from 'next/server';
import { himotoPool } from '@/lib/server/himoto-database';
import { protectDatabaseRequest } from '@/lib/server/management-session';
import { dataAccess } from '@/lib/server/access-context';
import { copyContractCustomerPhotos } from '@/lib/server/contract-customer-photos';
import { RecordPhotoError, parsePhotoTarget, readRecordPhotos } from '@/lib/server/record-photos';
import { failureResponse } from '@/lib/server/public-failure';

export const runtime = 'nodejs';
async function GETHandler(request: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const denied = await protectDatabaseRequest(request); if (denied) return denied;
  let client;
  try {
    const raw = await params, target = parsePhotoTarget(raw.entity, raw.id);
    client = await himotoPool.connect();
    await client.query('BEGIN');
    const data = await readRecordPhotos(client, target.entity, target.id);
    await client.query('COMMIT');
    return NextResponse.json({ status: 'success', data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (error instanceof RecordPhotoError) return NextResponse.json({ status: 'error', message: error.message }, { status: error.status });
    return failureResponse('Không tải được ảnh hồ sơ.', error);
  } finally { client?.release(); }
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
    if(error instanceof RecordPhotoError)return NextResponse.json({status:'error',message:error.message},{status:error.status});
    return failureResponse('Không lấy được giấy tờ từ hồ sơ khách.',error);
  } finally {client?.release();}
});
