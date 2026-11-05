import 'server-only';
import {createHash} from 'node:crypto';
import type {NextRequest} from 'next/server';
import type {PoolClient} from 'pg';
import type {SessionUser} from './management-session';
import {withMobileData} from './mobile-context';
import {ownerDatabase} from './himoto-database';
import {MobileError} from './mobile-session';
import {requireMobileGps} from './mobile-gps';
import {writeGpsMapping} from './gps-workspace';
import {mobileBody,mobileRequestKey,idempotentMobileWrite} from './mobile-writes';
import {gpsId} from '../../../shared/mobile-gps';
import {gpsMappingOperation,isGpsMappingInput,isGpsMappingPreparation,isGpsMappingCandidates,isGpsMappingReceipt,
  type MobileGpsMappingDevice,type MobileGpsMappingVehicle,type MobileGpsMappingReceipt} from '../../../shared/mobile-gps-mapping';

const label=(v:unknown)=>v==null?'':String(v).slice(0,4000);
const conflict=()=>new MobileError('Thiết bị hoặc xe đã thay đổi. Đối chiếu và tải lại trước khi ghép.',409,'GPS_MAPPING_REVIEW_REQUIRED');
const invalid=()=>new MobileError('Chưa xác nhận được kết quả ghép GPS. Giữ mã để đối chiếu.',503,'INVALID_WRITE_RECEIPT');
function parseId(raw:string) {const id=Number(raw);if(!/^[1-9]\d{0,14}$/.test(raw)||!gpsId(id))throw new MobileError('Mã thiết bị GPS không hợp lệ.',400,'INVALID_GPS_DEVICE');return id;}
function snapshot(device:MobileGpsMappingDevice) {return createHash('sha256').update(JSON.stringify(device)).digest('hex');}
async function transaction<T>(user:SessionUser,write:boolean,task:(db:PoolClient)=>Promise<T>) {
  requireMobileGps(user,true);
  return withMobileData(user,'fleet_read',async()=>{
    // Match the web handler's administrator-only owner connection, including legacy admin roles.
    const db=await ownerDatabase.connect();
    try{await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");await db.query("SET LOCAL lock_timeout='5s'");
      const result=await task(db);await db.query('COMMIT');return result;
    }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
  });
}
async function device(db:PoolClient,id:number,lock=false):Promise<MobileGpsMappingDevice> {
  const r=(await db.query('SELECT id,provider,external_device_id,provider_device_name,vehicle_id,mapping_status FROM himoto.gps_devices WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0];
  if(!r)throw new MobileError('Không tìm thấy thiết bị GPS.',404,'NOT_FOUND');
  return{id:Number(r.id),provider:r.provider,externalId:label(r.external_device_id),name:label(r.provider_device_name),vehicleId:r.vehicle_id==null?null:Number(r.vehicle_id),mappingStatus:label(r.mapping_status)};
}
function mapVehicle(r:Record<string,unknown>):MobileGpsMappingVehicle {return{id:Number(r.id),revision:String(r.revision),license:label(r.license),name:label(r.name),storeName:label(r.store_name)};}
const vehicleSql='SELECT v.id,v.xmin::text AS revision,v.license,v.name,s.store_name FROM himoto.vehicles v LEFT JOIN himoto.stores s ON s.id=COALESCE(v.current_store_id,v.store_id)';
async function vehicle(db:PoolClient,id:number|null,lock=false) {
  if(id===null)return null;
  const r=(await db.query(vehicleSql+' WHERE v.id=$1'+(lock?' FOR SHARE OF v':''),[id])).rows[0];
  if(!r)throw conflict();return mapVehicle(r);
}
export async function readMobileGpsMapping(user:SessionUser,raw:string) {
  const id=parseId(raw);
  return transaction(user,false,async db=>{
    const d=await device(db,id),result={device:d,vehicle:await vehicle(db,d.vehicleId),snapshot:snapshot(d),observedAt:new Date().toISOString()};
    if(!isGpsMappingPreparation(result))throw invalid();return result;
  });
}
export async function readMobileGpsMappingCandidates(user:SessionUser,raw:string,request:NextRequest) {
  const id=parseId(raw),params=request.nextUrl.searchParams,search=params.get('search')||'',page=Number(params.get('page')||1);
  if([...params.keys()].some(k=>!['search','page'].includes(k)||params.getAll(k).length!==1)||search.length>120||[...search].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||!gpsId(page)||page>100000)
    throw new MobileError('Bộ lọc xe không hợp lệ.',400,'INVALID_GPS_QUERY');
  return transaction(user,false,async db=>{
    await device(db,id);
    const rows=(await db.query(vehicleSql+" WHERE v.deleted_at IS NULL AND ($1::text='' OR POSITION(lower($1) IN lower(COALESCE(v.license,'')||' '||COALESCE(v.name,'')||' '||COALESCE(s.store_name,'')))>0) ORDER BY v.license,v.id LIMIT 26 OFFSET $2",[search,(page-1)*25])).rows;
    const result={deviceId:id,search,page,hasMore:rows.length>25,rows:rows.slice(0,25).map(mapVehicle)};
    if(!isGpsMappingCandidates(result))throw invalid();return result;
  });
}
async function original(db:PoolClient,user:SessionUser,key:string):Promise<MobileGpsMappingReceipt|null> {
  const r=(await db.query('SELECT r.operation,r.resource_id,r.resource_revision,m.device_id,m.proof FROM himoto.management_mobile_requests r '+
    'LEFT JOIN himoto.management_mobile_gps_mappings m ON m.user_id=r.user_id AND m.request_id=r.request_id WHERE r.user_id=$1 AND r.request_id=$2',[user.id,key])).rows[0];
  if(!r||r.resource_id==null||!String(r.operation).startsWith('gps.mapping:'))return null;
  if(!isGpsMappingReceipt(r.proof)||r.proof.actorId!==user.id||r.proof.requestId!==key||r.proof.id!==Number(r.resource_id)||r.proof.id!==Number(r.device_id)||
    r.proof.revision!==r.resource_revision||r.operation!==gpsMappingOperation(r.proof.id))throw invalid();
  let current=false;try{current=snapshot(await device(db,r.proof.id))===r.proof.mappingSnapshot;}catch(error){if(!(error instanceof MobileError)||error.status!==404)throw error;}
  return{...r.proof,current,replayed:true};
}
export async function readMobileGpsMappingReceipt(user:SessionUser,key:string) {mobileRequestKey(key);return transaction(user,false,async db=>({receipt:await original(db,user,key)}));}
export async function recordMobileGpsMapping(user:SessionUser,raw:string,request:NextRequest):Promise<MobileGpsMappingReceipt> {
  requireMobileGps(user,true);const id=parseId(raw),key=mobileRequestKey(request.headers.get('Idempotency-Key')),input=await mobileBody(request,1024);
  if(!isGpsMappingInput(input))throw new MobileError('Thông tin ghép GPS không hợp lệ.',400,'INVALID_GPS_MAPPING');
  return transaction(user,true,async db=>{
    const written=await idempotentMobileWrite(db,user.id,key,gpsMappingOperation(id),input,async()=>{
      const d=await device(db,id,true);if(snapshot(d)!==input.snapshot)throw conflict();
      const before=await vehicle(db,d.vehicleId),after=await vehicle(db,input.vehicleId,true);
      if(after&&after.revision!==input.vehicleRevision)throw conflict();
      if(!(await writeGpsMapping(db,id,input.vehicleId)).rowCount)throw conflict();
      const revision=String((await db.query('SELECT xmin::text AS revision FROM himoto.gps_devices WHERE id=$1',[id])).rows[0]?.revision);
      const proof:MobileGpsMappingReceipt={id,revision,replayed:false,requestId:key,device:d,before,after,beforeSnapshot:input.snapshot,mappingSnapshot:snapshot(await device(db,id)),actorId:user.id,
        actorName:label(user.name),recordedAt:new Date().toISOString(),current:true};
      if(!isGpsMappingReceipt(proof))throw invalid();
      await db.query('INSERT INTO himoto.management_mobile_gps_mappings(user_id,request_id,device_id,proof) VALUES($1,$2,$3,$4::jsonb)',[user.id,key,id,JSON.stringify(proof)]);
      return{id,revision};
    });
    const receipt=await original(db,user,key);if(!receipt||receipt.id!==written.id||receipt.revision!==written.revision)throw invalid();
    return{...receipt,replayed:written.replayed};
  });
}
