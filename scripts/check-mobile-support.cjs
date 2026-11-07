require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');

async function main(){
  const at=process.argv.indexOf('--pglite-path');assert(at>=0,'Pass --pglite-path');
  const {PGlite}=require(path.resolve(process.argv[at+1])),pg=new PGlite(),checks=[];
  await pg.exec(`CREATE SCHEMA himoto;CREATE TABLE himoto.users(id bigint PRIMARY KEY);CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text);CREATE TABLE himoto.staff_profiles(id bigint PRIMARY KEY,user_id bigint,full_name text,store_id bigint,status text);CREATE TABLE himoto.store_duty_schedules(id bigint,staff_id bigint,store_id bigint,shift_name text,starts_at timestamptz,ends_at timestamptz,deleted_at timestamptz);INSERT INTO himoto.users VALUES(7),(8),(9);INSERT INTO himoto.stores VALUES(2,'Branch QA'),(3,'Other QA');INSERT INTO himoto.staff_profiles VALUES(101,7,'Actor QA',2,'active'),(102,8,'Other QA',3,'active');`);
  await pg.exec(fs.readFileSync('scripts/attendance-schema.sql','utf8'));
  await pg.exec(fs.readFileSync('docs/sql/2026-11-06-guide-faq.sql','utf8'));
  const client={release(){},async query(sql,values){const result=await pg.query(sql,values);return {...result,rowCount:result.affectedRows??result.rows.length};}};
  global.himotoPool={query:client.query,async connect(){return client;}};
  const user={id:7,name:'Actor QA',email:'qa@example.invalid',role:'staff',access_role:'branch_staff',store_id:2,scope_all:false,permissions:[]};
  let actor=user,denied=false;
  const session=load(path.join(root,'lib/server/mobile-session'));
  session.requireMobileSession=async()=>{if(denied)throw new session.MobileError('denied',401,'SESSION_EXPIRED');return {user:actor};};
  const attendance=load(path.join(root,'app/api/mobile/v1/attendance/route'));
  const faq=load(path.join(root,'app/api/mobile/v1/guide-faq/route'));
  const dto=load(path.resolve(root,'../shared/mobile-support'));
  const request=(name,method='GET',body)=>new NextRequest('https://fixture.invalid/api/mobile/v1/'+name,{method,...(body?{body}:{})});
  const image=Buffer.from([255,216,255,224]),location={latitude:21,longitude:105.8,accuracy:8,timestamp:Date.now()};
  const body=(action,key)=>{const form=new FormData();form.set('action',action);form.set('request_id',key);form.set('location',JSON.stringify(location));form.set('photo',new File([image],'synthetic.jpg',{type:'image/jpeg'}));return form;};
  try{
    denied=true;assert.equal((await attendance.GET(request('attendance'))).status,401);assert.equal((await faq.GET(request('guide-faq'))).status,401);denied=false;
    const into=randomUUID(),out=randomUUID();
    const first=await attendance.POST(request('attendance','POST',body('in',into)));assert.equal(first.status,200);const receipt=await first.json();assert(dto.isAttendanceReceipt(receipt));
    assert.equal((await attendance.POST(request('attendance','POST',body('in',into)))).status,200);
    assert.equal((await attendance.POST(request('attendance','POST',body('in',randomUUID())))).status,409);
    const resolved=await(await attendance.GET(request('attendance?request_id='+into))).json();assert(dto.isAttendanceResolution(resolved));assert.equal(resolved.result.id,receipt.id);
    actor={...user,id:8,store_id:3};assert.equal((await(await attendance.GET(request('attendance?request_id='+into))).json()).result,null);
    assert.equal((await attendance.GET(request('attendance?photo='+receipt.id+'&side=in'))).status,404);
    await attendance.POST(request('attendance','POST',body('in',randomUUID())));actor=user;
    const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
    const summary=await(await attendance.GET(request(`attendance?from=${today}&to=${today}`))).json();assert(dto.isAttendanceSummary(summary));assert.equal(summary.total,1);assert.equal(Number(summary.open.id),receipt.id);
    const evidence=await attendance.GET(request('attendance?photo='+receipt.id+'&side=in'));assert.equal(evidence.status,200);assert.deepEqual(Buffer.from(await evidence.arrayBuffer()),image);assert.equal(evidence.headers.get('vary'),'Authorization');
    actor={...user,id:9,permissions:['hr.read']};const review=await(await attendance.GET(request(`attendance?from=${today}&to=${today}`))).json();assert.equal(review.total,1);actor=user;
    assert.equal((await attendance.POST(request('attendance','POST',body('out',out)))).status,200);assert.equal((await attendance.POST(request('attendance','POST',body('out',out)))).status,200);
    assert.equal((await pg.query('SELECT count(*)::integer AS n FROM himoto.management_staff_attendance WHERE actor_id=7')).rows[0].n,1);
    checks.push('Actual web attendance writer: in/out pairing, repeated UUID and lost-response lookup, double-in rejection, actor-bound resolution/photos, HR branch scope and authenticated image headers');

    for(let index=0;index<25;index++){const form=new FormData();form.set('action','ask');form.set('request_id',randomUUID());form.set('category','Hợp đồng');form.set('question','Synthetic question '+index);assert.equal((await faq.POST(request('guide-faq','POST',form))).status,200);}
    let data=await(await faq.GET(request('guide-faq'))).json();assert(dto.isMobileGuideFaq(data));assert.equal(data.total,25);assert.equal(data.rows.length,20);assert(data.hasMore);assert.equal(data.can_answer,false);
    const id=data.rows[0].id,answer=()=>{const form=new FormData();form.set('action','answer');form.set('id',String(id));form.set('revision','1');form.set('answer','Synthetic answer');form.set('keep_images','[]');form.append('images',new File([image],'qa.jpg',{type:'image/jpeg'}));return form;};
    assert.equal((await faq.POST(request('guide-faq','POST',answer()))).status,403);
    actor={...user,id:9,permissions:['settings.write']};assert.equal((await faq.POST(request('guide-faq','POST',answer()))).status,200);assert.equal((await faq.POST(request('guide-faq','POST',answer()))).status,409);
    data=await(await faq.GET(request('guide-faq?status=answered'))).json();assert(dto.isMobileGuideFaq(data));assert.equal(data.total,1);assert.equal(data.rows[0].images.length,1);
    const photo=await faq.GET(request('guide-faq?photo='+data.rows[0].images[0]));assert.deepEqual(Buffer.from(await photo.arrayBuffer()),image);
    const second=await(await faq.GET(request('guide-faq?page=2'))).json();assert.equal(second.rows.length,5);assert(!second.hasMore);assert(!second.rows.some(row=>row.id===id));
    const pending=await(await faq.GET(request('guide-faq?status=pending&category='+encodeURIComponent('Hợp đồng')+'&search=question'))).json();assert.equal(pending.total,24);
    assert.equal((await faq.GET(request('guide-faq?page=0'))).status,400);
    for(const question of ['VAT 100% QA','VAT 1000 QA','Code Q_A','Code QXA']){const form=new FormData();form.set('action','ask');form.set('request_id',randomUUID());form.set('category','Hợp đồng');form.set('question',question);assert.equal((await faq.POST(request('guide-faq','POST',form))).status,200);}
    for(const search of ['100%','Q_A']){const found=await(await faq.GET(request('guide-faq?search='+encodeURIComponent(search)))).json();assert.equal(found.total,1,'Search punctuation must stay literal like the web filter.');}
    checks.push('Shared FAQ domain: bounded SQL pagination/filter/search, authenticated ask, permission-gated answer with images, stale revision rejection and private image delivery');
    const {ATTENDANCE_SHIFTS}=load(path.resolve(root,'../shared/attendance-shifts'));assert.deepEqual(ATTENDANCE_SHIFTS.map(item=>item.code),['S','G1','G2','G3','F','O','C']);assert.equal(ATTENDANCE_SHIFTS.find(item=>item.code==='O').start,null);
    checks.push('Seven web/app shift definitions share one source, including a non-working rest code');
    console.log(JSON.stringify({ok:true,checks,fixtureOnly:true,productionWrites:0},null,2));
  }finally{delete global.himotoPool;await pg.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
