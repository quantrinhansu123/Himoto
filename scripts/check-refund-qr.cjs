const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const qr=load(path.join(root,'lib/management/refund-qr'));
const ocr=load(path.join(root,'lib/management/photo-ocr'));
const server=load(path.join(root,'lib/server/photo-ocr'));
const tlv=(id,value)=>id+String(value.length).padStart(2,'0')+value;
const payload=(service='QRIBFTTA',bin='970422')=>{
 const value='000201010211'+tlv('38',tlv('00','A000000727')+tlv('01',tlv('00',bin)+tlv('01','000123456789'))+tlv('02',service))+'53037045802VN6304';
 return value+qr.vietQrCrc(value);
};
async function main(){const checks=[];
 assert.equal(qr.vietQrCrc('123456789'),'29B1');
 const decoded=qr.parseRefundQr(payload());assert.deepEqual(decoded,{recipient_bank:'MBBank',recipient_account:'000123456789'});
 assert.deepEqual(qr.parseRefundQr('00020101021138510010A00000072701210006970407010797968680208QRIBFTTA53037045802VN62240820gen by sunary/vietqr6304BE74'),{recipient_bank:'Techcombank',recipient_account:'9796868'});
 for(const value of [payload().slice(0,-1)+'Z',payload('QRIBFTTC'),payload('QRIBFTTA','999999'),'https://evil.example/qr',payload().replace('000123456789','900123456789')])assert.equal(qr.parseRefundQr(value),undefined);
 const duplicate=payload().slice(0,-8)+'0002016304';assert.equal(qr.parseRefundQr(duplicate+qr.vietQrCrc(duplicate)),undefined);
 const malformed=payload().slice(0,-8)+'9999truncated6304';assert.equal(qr.parseRefundQr(malformed+qr.vietQrCrc(malformed)),undefined);
 checks.push('VietQR CRC standard vector and independently generated payload; preserve leading zero, reject changed checksum/card transfers/unknown banks/URLs');
 const clean=ocr.cleanOcrFields({recipient_bank:' MB Bank ',recipient_account:'000.123 456',recipient_name:'NGUYEN QA',amount:'1000000',name:'IGNORE'},'refund_qr');
 assert.deepEqual(clean,{recipient_bank:'MB Bank',recipient_account:'000123456',recipient_name:'NGUYEN QA'});
 assert.deepEqual(ocr.cleanOcrFields({recipient_account:'bad/#',recipient_name:'unknown',recipient_bank:'N/A'},'refund_qr'),{});
 assert.deepEqual(qr.combineRefundRecipient(decoded,{recipient_bank:'MB Bank',recipient_name:'TEN QA'}),{...decoded,recipient_name:'TEN QA'});
 assert.deepEqual(qr.combineRefundRecipient(decoded,{recipient_account:'999999',recipient_name:'WRONG NAME'}),decoded);
 assert.deepEqual(qr.combineRefundRecipient(decoded,{recipient_bank:'Vietcombank',recipient_name:'WRONG NAME'}),decoded);
 checks.push('AI schema only recipient fields; account strings stay strings; QR wins and mismatched AI cannot supply owner name');
 const empty={recipient_bank:'',recipient_account:'',recipient_name:''};
 assert.deepEqual(qr.mergeRefundRecipient(empty,clean,empty),clean);
 assert.equal(qr.mergeRefundRecipient({...empty,recipient_account:'00999'},clean,empty).recipient_account,'00999');
 assert.equal(qr.mergeRefundRecipient({...empty,recipient_name:'MANUAL'},clean,empty).recipient_name,'MANUAL');
 const old={recipient_bank:'Old bank',recipient_account:'888888',recipient_name:'OLD OWNER'};
 assert.equal(qr.mergeRefundRecipient(old,decoded,old).recipient_name,'');
 assert.equal(qr.mergeRefundRecipient(old,{recipient_account:'000123'},old).recipient_bank,'');
 assert.deepEqual(qr.mergeRefundRecipient(old,{recipient_name:'UNRELATED OWNER'},old),old);
 checks.push('Manual changes during read survive; a new account never inherits the old owner name');
 const key=process.env.GEMINI_API_KEY,google=process.env.GOOGLE_API_KEY;process.env.GEMINI_API_KEY='qa-key';
 try{
  const read=await server.extractPhoto('refund_qr','image/jpeg',Buffer.from([255,216,255,217]),undefined,async(_url,init)=>{
   const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body.generationConfig.responseJsonSchema.properties),qr.REFUND_RECIPIENT_KEYS);
   assert.match(body.contents[0].parts[0].text,/Không đoán các bit/);
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(clean)}]}}]});
  });assert.deepEqual(read.fields,clean);
 }finally{if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;if(google===undefined)delete process.env.GOOGLE_API_KEY;else process.env.GOOGLE_API_KEY=google;}
 checks.push('Gemini receives strict recipient schema and instructions to copy visible text only');
 const session=load(path.join(root,'lib/server/management-session')),pool=load(path.join(root,'lib/server/himoto-database')).himotoPool;
 const original={user:session.userFromSession,protect:session.protectDatabaseRequest,extract:server.extractPhoto,query:Object.getOwnPropertyDescriptor(pool,'query')};
 let user={id:987654,access_role:'branch_staff',store_id:32,scope_all:false,permissions:['contracts.read','contracts.return']},visible=true,calls=0,queries=0;
 try{
  session.userFromSession=async()=>user;session.protectDatabaseRequest=async()=>null;
  Object.defineProperty(pool,'query',{configurable:true,value:async sql=>{assert.equal(sql,'SELECT id FROM himoto.orders WHERE id=$1 AND deleted_at IS NULL');queries++;return {rowCount:visible?1:0,rows:visible?[{id:901}]:[]};}});
  server.extractPhoto=async()=>{calls++;return {fields:clean};};
  const route=load(path.join(root,'app/api/auth/order/car-rental/[id]/refund-qr/route')),{NextRequest}=require('next/server');
  const request=(origin='http://localhost')=>route.POST(new NextRequest('http://localhost/api/auth/order/car-rental/901/refund-qr',{method:'POST',headers:{origin,'content-type':'image/jpeg'},body:Buffer.from([255,216,255,217])}),{params:Promise.resolve({id:'901'})});
  let response=await request();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(calls,1);assert.equal(queries,1);
  visible=false;assert.equal((await request()).status,404);assert.equal(calls,1);
  user={...user,permissions:['contracts.read']};assert.equal((await request()).status,403);
  user=null;assert.equal((await request()).status,401);assert.equal(calls,1);
  assert.equal((await request('http://foreign.test')).status,403);
 }finally{session.userFromSession=original.user;session.protectDatabaseRequest=original.protect;server.extractPhoto=original.extract;Object.defineProperty(pool,'query',original.query);}
 checks.push('Scoped contract OCR requires return permission, login and same origin; invisible ids blocked before AI; endpoint performs SELECT only');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={payload};
