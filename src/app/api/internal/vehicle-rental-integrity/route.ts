import { NextRequest,NextResponse } from 'next/server';
import { ownerDatabase } from '@/lib/server/himoto-database';
import { integrityLicenses,readNewRentalIntegrity,validIntegritySignature } from '@/lib/server/legacy-rental-integrity';
export const runtime='nodejs';
export const maxDuration=15;
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:NextRequest) {
  if(Number(request.headers.get('content-length'))>8192)return reply({status:'error'},413);
  const body=await request.text();if(body.length>8192)return reply({status:'error'},413);
  if(!validIntegritySignature(request.headers,body))return reply({status:'error'},401);
  let licenses:string[];
  try{licenses=integrityLicenses(JSON.parse(body));}catch{return reply({status:'error'},400);}
  let client;
  try{client=await ownerDatabase.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='5s'");
    const rows=await readNewRentalIntegrity(client,licenses);await client.query('COMMIT');return reply({status:'success',data:{checked_at:new Date().toISOString(),rows}});
  }catch{if(client)await client.query('ROLLBACK').catch(()=>{});return reply({status:'error',message:'Không đối chiếu được app mới.'},503);}
  finally{client?.release();}
}
