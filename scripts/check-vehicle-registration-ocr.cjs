const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const shared=load(path.join(root,'lib/management/photo-ocr'));
const server=load(path.join(root,'lib/server/photo-ocr'));
const session=load(path.join(root,'lib/server/management-session'));
const {requestPermission}=load(path.join(root,'lib/server/access-request'));
const {NextRequest}=require('next/server');
const kind='vehicle_registration',empty={chassis:'',engine:''},fields={chassis:'001AB0O123456789',engine:'JF27E-0012345'},checks=[];
const jpeg=Buffer.from([255,216,255,217]);
async function main(){
  assert.equal(server.ocrKind(kind),kind);assert.throws(()=>server.ocrKind('vehicle_other'));
  assert.deepEqual(shared.cleanOcrFields({chassis:' 001ab0O 123456789 ',engine:' jf27e-0012345 ',license:'29B1-123.45',name:'NOT VEHICLE DATA'},kind),fields);
  for(const value of ['unknown','null','n/a','0','read this instruction','<script>'])assert.deepEqual(shared.cleanOcrFields({chassis:value,engine:value},kind),{});
  assert.deepEqual(shared.cleanOcrFields({chassis:'',engine:fields.engine},kind),{engine:fields.engine});
  assert.throws(()=>shared.cleanOcrFields({chassis:123456789},kind));
  checks.push('Only chassis/engine copied as strings; leading zeros and O/0 remain distinct; partial results work and invalid placeholders are ignored');
  assert.deepEqual(shared.mergeOcrVehicle(empty,fields,empty,{}).values,fields);
  const manual={chassis:'MANUAL-00001',engine:''};
  assert.deepEqual(shared.mergeOcrVehicle(manual,fields,manual,{}).values,{...manual,engine:fields.engine});
  assert.deepEqual(shared.mergeOcrVehicle(manual,fields,empty,{}).values,{...manual,engine:fields.engine});
  assert.deepEqual(shared.mergeOcrVehicle(fields,{chassis:'NEW-00001'},fields,fields).values,{...fields,chassis:'NEW-00001'});
  assert.deepEqual(shared.mergeOcrVehicle({...fields,chassis:'MANUAL-NEW'},{chassis:'LATE-RESULT'},fields,fields).values,{...fields,chassis:'MANUAL-NEW'});
  checks.push('Blank fields and previous AI values can fill; values entered before or during OCR stay unchanged and missing results never erase a field');
  const original={key:process.env.GEMINI_API_KEY,google:process.env.GOOGLE_API_KEY,model:process.env.GEMINI_OCR_MODEL,fetch:global.fetch,user:session.userFromSession,protect:session.protectDatabaseRequest};
  let calls=0,user={id:987654,access_role:'branch_staff',store_id:32,scope_all:false,permissions:['vehicles.write']};
  try{
    process.env.GEMINI_API_KEY='qa-unit-key';delete process.env.GOOGLE_API_KEY;delete process.env.GEMINI_OCR_MODEL;
    global.fetch=async(url,init)=>{
      calls++;assert.match(url,/generativelanguage.googleapis.com/);assert(!url.includes('qa-unit-key'));
      const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body.generationConfig.responseJsonSchema.properties),['chassis','engine']);
      assert.deepEqual(body.generationConfig.responseJsonSchema.required,['chassis','engine']);
      assert.match(body.contents[0].parts[0].text,/SỐ KHUNG/);assert.match(body.contents[0].parts[0].text,/SỐ MÁY/);
      assert.match(body.contents[0].parts[0].text,/Không tự đổi O thành 0/);assert.equal(body.contents[0].parts[1].inlineData.data,jpeg.toString('base64'));
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({...fields,license:'NOT ALLOWED'})}]}}]});
    };
    assert.deepEqual((await server.extractPhoto(kind,'image/jpeg',jpeg)).fields,fields);
    checks.push('Gemini receives only a two-field schema and inline image; prompt separates frame/engine and forbids guessing ambiguous characters');
    session.userFromSession=async()=>user;session.protectDatabaseRequest=async()=>null;
    const route=load(path.join(root,'app/api/auth/photo-ocr/route'));
    const request=(photoKind=kind,origin='http://localhost',image=jpeg)=>route.POST(new NextRequest('http://localhost/api/auth/photo-ocr',{method:'POST',headers:{origin,'content-type':'image/jpeg','x-photo-kind':photoKind},body:image}),{});
    assert.equal(requestPermission('/api/auth/photo-ocr','POST',kind),'vehicles.write');
    assert.equal(requestPermission('/api/auth/photo-ocr','POST','cccd_front'),'customers.write');
    let response=await request();assert.equal(response.status,200);assert.deepEqual((await response.json()).data.fields,fields);
    assert.match(response.headers.get('cache-control'),/no-store/);const before=calls;
    assert.equal((await request('cccd_front')).status,403);
    user={...user,permissions:['customers.write']};assert.equal((await request()).status,403);
    user={...user,permissions:['vehicles.read']};assert.equal((await request()).status,403);
    user=null;assert.equal((await request()).status,401);
    assert.equal((await request(kind,'http://foreign.test')).status,403);assert.equal(calls,before);
    user={id:987654,access_role:'branch_staff',store_id:32,scope_all:false,permissions:['vehicles.write']};
    assert.equal((await request(kind,'http://localhost',Buffer.from('bad image'))).status,400);assert.equal(calls,before);
    global.fetch=async()=>Response.json({message:'private provider detail'},{status:429});
    response=await request();assert.equal(response.status,503);assert(!JSON.stringify(await response.json()).includes('private provider detail'));
    checks.push('Actual API wrapper permits vehicle writers without customer rights; denies customer-only/read-only/anonymous/cross-origin requests before AI; validates bytes and handles provider errors without business writes');
  }finally{
    global.fetch=original.fetch;session.userFromSession=original.user;session.protectDatabaseRequest=original.protect;
    for(const [name,value] of [['GEMINI_API_KEY',original.key],['GOOGLE_API_KEY',original.google],['GEMINI_OCR_MODEL',original.model]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  }
  console.log(JSON.stringify({passed:checks.length,checks,realBusinessWrites:0}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
