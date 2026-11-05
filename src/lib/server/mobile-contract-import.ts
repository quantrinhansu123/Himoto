import 'server-only';
import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import type {NextRequest} from 'next/server';
import type {PoolClient} from 'pg';
import type {SessionUser} from './management-session';
import {isAdminAccount} from '@/lib/management/permissions';
import {CONTRACT_IMPORT_NAMESPACE,parseContractOrderWorkbook} from '@/lib/management/contract-import';
import {ORDER_CUSTOMER_HEADERS} from '@/lib/management/customer-order-excel';
import type {MobileWorkbookExport} from '../../../shared/mobile-export';
import {contractSnapshotHash,previewDatabaseContracts,importDatabaseContractDrafts,ContractImportError} from './contract-import';
import {withMobileData} from './mobile-context';
import {himotoPool} from './himoto-database';
import {MobileError} from './mobile-session';
import {mobileBody,mobileRequestKey,idempotentMobileWrite} from './mobile-writes';
import {mobileImportReceipt} from './mobile-customer-import';
import {isMobileContractWorkbook,isMobileContractImportPreview,type MobileContractWorkbook,type MobileContractImportPreview,type MobileContractImportInput} from '../../../shared/mobile-contract-import';

export function requireMobileContractImport(user:SessionUser){if(!isAdminAccount(user))throw new MobileError('Chỉ quản trị viên được nhập nháp hợp đồng từ file nguồn.',403,'FORBIDDEN');}
function signature(user:SessionUser,kind:string,value:unknown){const secret=process.env.MANAGEMENT_SESSION_SECRET;if(!secret||secret.length<32)throw new MobileError('Chưa cấu hình xác minh nhập hợp đồng.',503,'IMPORT_UNAVAILABLE');return createHmac('sha256',secret).update(`himoto-contract-import-v1:${user.id}:${kind}:${contractSnapshotHash(value)}`).digest('hex');}
function verify(user:SessionUser,kind:string,value:unknown,supplied:string){const expected=signature(user,kind,value);if(!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))throw new MobileError('Dữ liệu nguồn hoặc xác nhận đã thay đổi. Kiểm tra lại file.',409,'IMPORT_REVIEW_REQUIRED');}
async function transaction<T>(user:SessionUser,write:boolean,task:(client:PoolClient)=>Promise<T>){requireMobileContractImport(user);return withMobileData(user,'',async()=>{const client=await himotoPool.connect();try{await client.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='45s'");await client.query("SET LOCAL lock_timeout='5s'");const result=await task(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK').catch(()=>{});if(error instanceof ContractImportError)throw new MobileError(error.message,409,'IMPORT_REVIEW_REQUIRED');throw error;}finally{client.release();}});}
function files(user:SessionUser,value:unknown){if(!Array.isArray(value)||!value.length||value.length>20||!value.every(isMobileContractWorkbook)||value.reduce((n,file)=>n+file.sources.length,0)>1000||new Set(value.map(f=>f.filename.toLocaleLowerCase('vi'))).size!==value.length)throw new MobileError('Chọn tối đa20 file, tổng tối đa1000dòng và không trùng tên file.');for(const file of value){const {signature:signed,...content}=file;verify(user,'workbook',content,signed);}return value as MobileContractWorkbook[];}
const manifest=(input:MobileContractWorkbook[])=>input.map(({filename,storeId,sha256})=>({filename,storeId,sha256}));
const prepared=(v:Omit<MobileContractImportInput,'files'|'verifiedBackupSha'|'signature'>)=>({batchId:v.batchId,revision:v.revision,expectedAdded:v.expectedAdded,backupSha:v.backupSha,backupSnapshotSha:v.backupSnapshotSha,manifestSha:v.manifestSha});
export function mobileContractImportOptions(user:SessionUser){return transaction(user,false,async client=>({namespace:CONTRACT_IMPORT_NAMESPACE,stores:(await client.query('SELECT id,store_name AS name FROM himoto.stores ORDER BY store_name,id')).rows.map(r=>({id:Number(r.id),name:String(r.name)}))}));}
export async function mobileContractImportTemplate(user:SessionUser):Promise<MobileWorkbookExport>{
  requireMobileContractImport(user);const {Workbook}=await import('exceljs'),book=new Workbook(),sheet=book.addWorksheet('Đơn nguồn',{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=ORDER_CUSTOMER_HEADERS.map((header,index)=>({header,key:String(index),width:index===2||index===8?30:22,style:{numFmt:'@'}}));
  sheet.getCell('J1').note='Cột tên cũ: tổng đã thu theo nguồn, chỉ giữ trong metadata đối chiếu. Không tự ghi nhận cọc hoặc phiếu.';
  sheet.getCell('B1').note=sheet.getCell('G1').note=sheet.getCell('H1').note='Ngày giờ Việt Nam: YYYY-MM-DD HH:mm:ss; giữ đầy đủ giây.';
  const bytes=await book.xlsx.writeBuffer();return{filename:'HIMOTO-mau-nhap-hop-dong.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentBase64:Buffer.from(bytes).toString('base64'),rowCount:0};
}
export async function readMobileContractWorkbook(user:SessionUser,request:NextRequest):Promise<MobileContractWorkbook>{
  requireMobileContractImport(user);if(request.nextUrl.search||request.headers.has('idempotency-key'))throw new MobileError('Đọc file chưa dùng mã ghi hoặc bộ lọc.');
  let filename:string;try{filename=decodeURIComponent(request.headers.get('x-file-name')||'');}catch{throw new MobileError('Tên file chưa hợp lệ.');}
  const storeId=Number(request.headers.get('x-source-store'));
  if(!filename||filename.length>255||/[\\/]/.test(filename)||Array.from(filename).some(c=>c.charCodeAt(0)<32)||!/\.xlsx$/i.test(filename)||!Number.isSafeInteger(storeId)||storeId<1)throw new MobileError('Chọn cơ sở nguồn và file Excel.xlsx tối đa5 MB.');
  const reader=request.body?.getReader();if(!reader)throw new MobileError('Chưa có dữ liệu file.');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>5*1024*1024){await reader.cancel();throw new MobileError('File vượt5 MB.',413,'IMPORT_TOO_LARGE');}chunks.push(next.value);}}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks);let sources;
  try{const {Workbook}=await import('exceljs'),book=new Workbook();await book.xlsx.load(Uint8Array.from(bytes).buffer);sources=parseContractOrderWorkbook(book,filename,storeId);}catch(error){throw new MobileError((error as Error).message,400,'INVALID_IMPORT_FILE');}
  const content={filename,storeId,sha256:createHash('sha256').update(bytes).digest('hex'),sources};return{...content,signature:signature(user,'workbook',content)};
}
export async function previewMobileContractImport(user:SessionUser,request:NextRequest):Promise<MobileContractImportPreview>{
  requireMobileContractImport(user);if(request.nextUrl.search||request.headers.has('idempotency-key'))throw new MobileError('Kiểm tra file chưa dùng mã ghi.');
  const body=await mobileBody(request,8*1024*1024);if(Object.keys(body).some(k=>k!=='files'))throw new MobileError('Thông tin xem trước chưa hợp lệ.');const input=files(user,body.files);
  return transaction(user,false,async client=>{
    const preview=await previewDatabaseContracts(client,input.flatMap(file=>file.sources)),batchId=randomUUID(),expectedAdded=preview.plans.filter(p=>p.state==='new').length;
    const snapshotSha=contractSnapshotHash(preview.snapshot),manifestSha=contractSnapshotHash(manifest(input));
    const content=JSON.stringify({namespace:CONTRACT_IMPORT_NAMESPACE,actorId:user.id,batchId,revision:preview.revision,expectedAdded,branchMap:Object.fromEntries(input.map(file=>[file.filename,file.storeId])),sourceHashes:Object.fromEntries(input.map(file=>[file.filename,file.sha256])),snapshotSha,snapshot:preview.snapshot},null,2);
    if(Buffer.byteLength(content,'utf8')>32*1024*1024)throw new MobileError('Bản sao lưu vượt32 MB. Chia phạm vi nhập và kiểm tra lại.',413,'IMPORT_TOO_LARGE');
    const backupSha=createHash('sha256').update(content).digest('hex'),proof={batchId,revision:preview.revision,expectedAdded,backupSha,backupSnapshotSha:snapshotSha,manifestSha};
    const result={...proof,signature:signature(user,'prepared',proof),total:preview.plans.length,existing:preview.plans.filter(p=>p.state==='existing').length,blocked:preview.plans.filter(p=>p.state==='blocked').length,
      plans:preview.plans.map(p=>({sourceId:p.sourceId,state:p.state,targetId:p.targetId,customer:p.sources[0].name,licenses:p.sources.map(s=>s.license),errors:p.errors,warnings:p.warnings})),backup:{filename:`HIMOTO-contracts-backup-${batchId}.json`,mimeType:'application/json' as const,content,rowCount:preview.snapshot.orders.length}};
    if(!isMobileContractImportPreview(result))throw new MobileError('Kết quả xem trước chưa đầy đủ.',503);return result;
  });
}
export async function writeMobileContractImport(user:SessionUser,batchId:string,request:NextRequest){
  requireMobileContractImport(user);const key=mobileRequestKey(request.headers.get('idempotency-key')),body=await mobileBody(request,8*1024*1024);
  if(request.nextUrl.search||Object.keys(body).some(k=>!['files','batchId','revision','expectedAdded','backupSha','backupSnapshotSha','manifestSha','signature','verifiedBackupSha'].includes(k)))throw new MobileError('Thông tin lần nhập chưa hợp lệ.');
  const input=files(user,body.files),value=body as unknown as MobileContractImportInput;
  if(value.batchId!==batchId||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(batchId)||!Number.isSafeInteger(value.expectedAdded)||value.expectedAdded<1||value.expectedAdded>1000||value.verifiedBackupSha!==value.backupSha||contractSnapshotHash(manifest(input))!==value.manifestSha)throw new MobileError('Xác minh bản sao lưu và số lượng dự kiến trước khi nhập.');
  const proof=prepared(value);verify(user,'prepared',proof,value.signature);
  return transaction(user,true,async client=>{
    const result=await idempotentMobileWrite(client,user.id,key,`import.contracts:${batchId}`,{files:input,...proof,signature:value.signature,verifiedBackupSha:value.verifiedBackupSha},async()=>{
      await client.query('LOCK TABLE himoto.orders,himoto.order_vehicle_details,himoto.vehicles,himoto.customers,himoto.stores IN SHARE ROW EXCLUSIVE MODE');
      const sources=input.flatMap(file=>file.sources),before=await previewDatabaseContracts(client,sources);
      if(before.revision!==value.revision||contractSnapshotHash(before.snapshot)!==value.backupSnapshotSha)throw new MobileError('Dữ liệu đã đổi sau xem trước. Kiểm tra và sao lưu lại.',409,'IMPORT_REVIEW_REQUIRED');
      const audit=async()=>{const rows=[];for(const table of ['transactions','order_vehicle_details','vehicles','customers','stores'])rows.push((await client.query(`SELECT count(*)::int AS n,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS hash FROM himoto.${table} t`)).rows[0]);return rows;};
      const protectedBefore=await audit();
      const serial=(await client.query("SELECT pg_get_serial_sequence('himoto.orders','id') AS name")).rows[0].name;if(serial!=='himoto.orders_id_seq')throw new MobileError('Sequence hợp đồng chưa đúng cấu hình.',503);
      const seq=(await client.query('SELECT last_value,is_called FROM himoto.orders_id_seq')).rows[0],maximum=before.snapshot.orders.reduce((m,row)=>BigInt(row.id)>m?BigInt(row.id):m,0n);
      if(BigInt(seq.last_value)<maximum||!seq.is_called&&BigInt(seq.last_value)===maximum)await client.query("SELECT setval('himoto.orders_id_seq'::regclass,$1::bigint,true)",[maximum.toString()]);
      const imported=await importDatabaseContractDrafts(client,sources,value.revision,value.expectedAdded,user.id);
      for(const added of imported.added)await client.query(`UPDATE himoto.orders SET metadata=(metadata::jsonb||jsonb_build_object('excel_import',(metadata::jsonb->'excel_import')||$2::jsonb))::text WHERE id=$1`,[added.id,JSON.stringify({mobile_request_id:key,mobile_batch_id:batchId,backup_sha256:value.backupSha,source_hashes:Object.fromEntries(input.map(f=>[f.filename,f.sha256]))})]);
      const after=await previewDatabaseContracts(client,sources),oldIds=new Set(before.snapshot.orders.map(r=>String(r.id))),oldRows=after.snapshot.orders.filter(r=>oldIds.has(String(r.id))),newRows=after.snapshot.orders.filter(r=>!oldIds.has(String(r.id)));
      if(contractSnapshotHash(oldRows)!==contractSnapshotHash(before.snapshot.orders)||newRows.length!==value.expectedAdded||contractSnapshotHash(await audit())!==contractSnapshotHash(protectedBefore)||after.plans.some(p=>p.state==='new')||imported.added.some(a=>!after.plans.some(p=>p.sourceId===a.sourceId&&p.state==='existing'&&p.targetId===a.id)))throw new MobileError('Đối chiếu sau nhập chưa khớp; đã hoàn tác cả lô.',409,'IMPORT_VERIFICATION_FAILED');
      for(const row of newRows){const payload=row.draft_payload as {management_composer?:{draft?:Record<string,unknown>}};const draft=payload?.management_composer?.draft,metadata=JSON.parse(row.metadata||'{}').excel_import;
        if(row.order_status!=='draft'||!draft||draft.deposit_amount!==''||draft.unit_price!==''||draft.signed_on!==''||String(row.pid)!=='0'||String(row.total)!=='0'||(row as unknown as Record<string,unknown>).first_deposit_amount!==null||(row as unknown as Record<string,unknown>).additional_deposit_amount!==null||metadata?.financialReconciled!==false||metadata.namespace!==CONTRACT_IMPORT_NAMESPACE)throw new MobileError('Nháp mới có thay đổi tài chính ngoài phạm vi; đã hoàn tác lô.',409,'IMPORT_VERIFICATION_FAILED');}
      return{id:user.id,revision:String(imported.added.length+1)};
    });
    const receipt=await mobileImportReceipt(client,user,key);if(!receipt||receipt.kind!=='contracts')throw new MobileError('Chưa đọc được xác nhận nhập nháp. Giữ mã gốc.',503);return{...receipt,replayed:result.replayed};
  });
}
