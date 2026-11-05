// Read-only adapters and real XLSX builder; synthetic repositories, no network/env.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{NextRequest}=require('next/server');
const {load,root}=require('./lib/load-typescript.cjs');
async function run(){
 const statements=[],calls=[],client={async query(sql){statements.push(sql);return{rows:[],rowCount:0};},release(){}};
 global.himotoPool={async connect(){return client;}};
 const db=load(path.join(root,'lib/server/himoto-database'));
 Object.defineProperty(db.ownerDatabase,'connect',{configurable:true,value:async()=>client});
 const {dataAccess}=load(path.join(root,'lib/server/access-context'));
 const actors=load(path.resolve('shared/mobile-managed-accounts'));
 const admin={id:7,name:'QA Admin',role:'admin',role_slug:'quan-tri-vien',access_role:'admin',store_id:null,scope_all:true,permissions:[...actors.ACCESS_PERMISSIONS]};
 const branch={id:8,name:'QA Branch',role:'staff',access_role:'custom',store_id:23,scope_all:false,permissions:['contracts.read','hr.read','vehicles.read']};
 let expected=admin,duplicate=false;
 function scoped(kind){const scope=dataAccess.getStore();assert.equal(scope.id,expected.id);assert.equal(scope.store_id,expected.store_id);assert.equal(scope.scope_all,expected.scope_all);assert.equal(scope.operation,['transfers','gps'].includes(kind)?'fleet_read':'');calls.push(kind);}
 const count=53,now=new Date().toISOString(),many=make=>Array.from({length:count},(_,i)=>make(i+1));
 const transferRows=many(id=>({id,vehicle_id:id,vehicle_name:'QA xe',license:'000123',from_store_id:23,to_store_id:24,from_store:'QA A',to_store:'QA B',action:'receive',label:'Nhận xe',at:now,actor:'QA',note:'=SUM(1,2)',changes:[]}));
 const transfers=load(path.join(root,'lib/server/vehicle-transfer-history'));
 transfers.readTransferHistory=async(c,params)=>{scoped('transfers');assert.equal(typeof c.query,'function');const q=transfers.parseTransferHistory(params);assert.equal(q.store,'23');return{total:count,scopeCount:count,page:q.page,size:25,rows:duplicate&&q.page===3?transferRows.slice(0,3):transferRows.slice((q.page-1)*25,q.page*25)};};
 const batteries=many(id=>({id,revision:'1',code:'QA-'+id,customer_name:'QA Pin',customer_phone:'0900000001',vehicle_license:'000123',battery_name:'=SUM(1,2)',starts_at:'2026-11-01T08:00',ends_at:'2026-12-01T08:00',rent_price:300000,store_name:'QA A',status:'renting'}));
 const battery=load(path.join(root,'lib/server/battery-contracts'));
 battery.listBatteryContracts=async(c,store,source)=>{scoped('battery');assert.equal(typeof c.query,'function');assert.equal(store,23);assert.equal(source,undefined);return batteries;};battery.countBatteryContracts=async()=>count;
 const accounts=many(id=>({id,name:'=SUM(1,2)',email:'qa@example.invalid',login_name:'000'+id,status:'active',access_role:'branch_staff',store_id:23,store_name:'QA A',scope_all:false,permissions:[],enabled:true,revision:'1',password_available:false,password_changed_at:null,can_edit:true,can_delete:true,password_cipher:'MUST_NOT_EXPORT'}));
 load(path.join(root,'lib/server/account-management')).listManagedAccounts=async(c,actor,store)=>{scoped('accounts');assert.equal(actor,admin);assert.equal(store,23);return accounts;};
 const devices=many(id=>({id,vehicle_id:id,provider:'protrack',external_device_id:'000000123',provider_device_name:'QA GPS',license:'000123',store_id:23,store_name:'QA A',management_status:'online',sync_received_at:now,heartbeat_at:now,position_recorded_at:now,provider_reported_at:now,stopped_since:null,provider_stopped_since:null,last_latitude:0,last_longitude:0,last_speed:0,last_ignition:null,mapping_status:'manual'}));
 load(path.join(root,'lib/server/gps-workspace')).readGpsWorkspace=async(c,store)=>{scoped('gps');assert.equal(store,'23');return{devices,events:[]};};
 const shifts=[{id:1,store_name:'QA A',updated_at:now,status:'draft',payload:{date:'2026-11-04',staff:'QA',vehicles:3,batteries:4,cash:123456,personal:0,company:55,notes:'=SUM(1,2)',summary:{income_total:123456}}},{id:2,store_name:'QA A',updated_at:now,status:'submitted',audit:{status:'confirmed'},payload:{date:'2026-11-04',staff:'QA',vehicles:3,batteries:4,cash:9,personal:0,company:55,notes:'QA'}}];
 load(path.join(root,'lib/server/shift-report-domain')).listShiftReports=async(c,store,date)=>{scoped('shifts');assert.equal(store,'23');assert.equal(date,'2026-11-04');return shifts;};
 const duties=[{id:1,staff_name:'QA',store_name:'QA A',duty_date:'2026-11-03',starts_at:'2026-11-03T16:00:00Z',ends_at:'2026-11-03T18:00:00Z',shift_name:'Ca đêm',role_in_shift:'Trực',notes:'QA'},{id:2,staff_name:'QA',store_name:'QA A',duty_date:'2026-11-03',starts_at:'2026-11-03T14:00:00Z',ends_at:'2026-11-03T16:00:00Z',shift_name:'Ca tối',role_in_shift:'Trực',notes:'QA'}];
 load(path.join(root,'lib/server/duty-roster')).listDuties=async(c,week,store)=>{scoped('duties');assert.equal(store,23);assert.equal(week,'2026-11-02');return{week,schedules:duties};};
 const reminders=many(id=>({request_id:'QA-'+id,order_id:id,store_id:23,contract_code:'QA-'+id,customer_name:'QA',store_name:'QA A',phone:'0900000001',message:'=SUM(1,2)',amount:123456,status:'accepted',created_at:now,actor_name:'QA'}));
 load(path.join(root,'lib/server/debt-reminders')).listDebtReminders=async(c,store,page)=>{scoped('reminders');assert.equal(store,'23');return{rows:reminders.slice((page-1)*20,page*20),total:count,page,pages:3};};
 const api=load(path.join(root,'lib/server/mobile-list-export')),dto=load(path.resolve('shared/mobile-export')),ExcelJS=require('exceljs'),files={},checks=[];
 const req=(query='',headers={})=>new NextRequest('https://fixture.invalid/export?'+query,{headers});
 const queries={transfers:'store=23&from=2026-11-01&to=2026-11-05&action=receive',gps:'store=23&provider=protrack&state=online&search=QA',battery:'store_id=23&search=QA&status=renting',accounts:'store_id=23',shifts:'store_id=23&date=2026-11-04&status=draft',duties:'week=2026-11-02&store_id=23&day=2026-11-04',reminders:'store=23'};
 for(const kind of Object.keys(queries)){
  const before=statements.length,file=await api.exportMobileList(admin,kind,req(queries[kind]));assert(dto.isMobileFileExport(file));assert.equal(file.rowCount,['shifts','duties'].includes(kind)?1:53);
  const sheet=new ExcelJS.Workbook();await sheet.xlsx.load(Buffer.from(file.contentBase64,'base64'));const ws=sheet.worksheets[0];assert.equal(ws.rowCount,file.rowCount+1);assert.equal(ws.views[0].state,'frozen');assert(ws.autoFilter);assert(!JSON.stringify(ws.model).includes('MUST_NOT_EXPORT'));assert(!ws.findRow(2).values.some(v=>typeof v==='object'&&v&&'formula'in v));
  if(kind==='gps'){assert.equal(ws.getCell('D2').value,'000000123');assert.equal(ws.getCell('H2').value,0);assert.equal(ws.getCell('I2').value,0);}
  if(kind==='battery'){assert.equal(ws.getCell('C2').value,'0900000001');assert.equal(ws.getCell('H2').value,300000);assert.equal(ws.getCell('E2').value,'=SUM(1,2)');assert.equal(ws.getCell('F2').value,'08:00 01/11/2026');}
  if(kind==='accounts'){assert.equal(ws.getCell('B2').value,'0001');assert.equal(ws.columnCount,5);}
  if(kind==='shifts')assert.equal(ws.getCell('G2').value,123456);
  if(kind==='duties'){assert.equal(ws.getCell('D2').value,'2026-11-03T23:00');assert.equal(ws.getCell('E2').value,'2026-11-04T01:00');}
  if(kind==='reminders'){assert.equal(ws.getCell('E2').value,'0900000001');assert.equal(ws.getCell('F2').value,123456);}
  const trace=statements.slice(before);assert.equal(trace.filter(s=>s==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length,1);assert.equal(trace.filter(s=>s==='COMMIT').length,1);assert(!trace.some(s=>/INSERT|UPDATE|DELETE|ALTER/.test(s)));files[kind]=file;
 }
 checks.push('Seven exports use the actual mobile scope/permission readers and web mappings/builder, including all 53 rows across pages in one read-only snapshot; money/zero coordinates are numbers, phones/IMEI/leading zeros/formulas stay text, account secrets excluded');
 for(const [kind,query]of[['battery','all=1'],['accounts','store_id=23&store_id=24'],['gps','provider=unknown'],['shifts','status=unknown'],['duties','day=2026-02-30'],['reminders','search=QA']])await assert.rejects(()=>api.exportMobileList(admin,kind,req(query)),e=>e.status===400);
 await assert.rejects(()=>api.exportMobileList(admin,'unknown',req()),e=>e.status===404);
 await assert.rejects(()=>api.exportMobileList(admin,'battery',req('',{'Idempotency-Key':'forbidden'})),e=>e.status===400);
 duplicate=true;await assert.rejects(()=>api.exportMobileList(admin,'transfers',req(queries.transfers)),e=>e.code==='EXPORT_INCOMPLETE');duplicate=false;
 checks.push('Duplicate/missing pages, unknown or duplicate filters, bad status/day/kind and write keys fail closed; overnight duty overlaps and shift status match the list');
 expected=branch;
 for(const kind of ['battery','gps','transfers','shifts','duties','reminders'])await api.exportMobileList(branch,kind,req(queries[kind]));
 await assert.rejects(()=>api.exportMobileList(branch,'accounts',req(queries.accounts)),e=>e.status===403);
 expected={...branch,permissions:[]};for(const kind of ['battery','shifts','duties','reminders'])await assert.rejects(()=>api.exportMobileList(expected,kind,req(queries[kind])),e=>e.status===403);
 checks.push('Branch readers preserve actor/store/scope and fleet_read; account export enforces actual web account management rights; missing domain permissions are denied');
 const helper=load(path.join(root,'lib/server/mobile-filtered-workbook'));
 await assert.rejects(()=>helper.readAllExportRows(async page=>({page,size:1,total:page===1?2:3,rows:[{id:page}]}),r=>r.id),e=>e.code==='EXPORT_INCOMPLETE');
 const outputArg=process.argv.indexOf('--output');if(outputArg>=0){const output=path.resolve(process.argv[outputArg+1]);assert(output.startsWith(path.resolve('.backups')+path.sep)&&!fs.existsSync(output));fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'files.json'),JSON.stringify({fixtureOnly:true,files,queries},null,2));}
 console.log(JSON.stringify({ok:true,checks:checks.length,results:checks,productionWrites:0},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
