// Synthetic in-memory PostgreSQL only. Never load env files or contact services.
require('./lib/offline-tests.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {load,root}=require('./lib/load-typescript.cjs');
async function main(){
  const at=process.argv.indexOf('--pglite-path');if(at<0||!process.argv[at+1])throw Error('Provide an existing isolated PGlite installation; no live DB fallback');
  const sql=new(require(path.resolve(process.argv[at+1])).PGlite)();
  const db=load(path.join(root,'lib/server/himoto-database')),reports=load(path.join(root,'lib/server/mobile-reports')),exportsApi=load(path.join(root,'lib/server/mobile-report-export'));
  const {dataAccess}=load(path.join(root,'lib/server/access-context')),{withMobileData}=load(path.join(root,'lib/server/mobile-context'));
  const dto=load(path.resolve('shared/mobile-reports')),fileDto=load(path.resolve('shared/mobile-export'));
  const actor={id:7,name:'QA Report',access_role:'custom',role:'staff',store_id:23,scope_all:false,permissions:['contracts.read']};
  const entitled={...actor,id:145,access_role:'admin'},unauthorizedAdmin={...entitled,id:99};
  let expectedActor=actor,ownerConnections=0,ordinaryConnections=0;
  const originals=[db.himotoPool,db.ownerDatabase].map(pool=>({pool,descriptor:Object.getOwnPropertyDescriptor(pool,'connect')}));
  const query=async(text,values)=>{const r=await sql.query(text,values);return{rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};};
  for(const [pool,owner] of [[db.himotoPool,false],[db.ownerDatabase,true]])Object.defineProperty(pool,'connect',{configurable:true,value:async()=>{
    const scope=dataAccess.getStore();assert.equal(scope.id,expectedActor.id);assert.equal(scope.store_id,expectedActor.store_id);assert.equal(scope.scope_all,expectedActor.scope_all);assert.equal(scope.operation,'');
    if(owner){assert.equal(scope.id,145);assert.equal(scope.access_role,'admin');ownerConnections++;}else ordinaryConnections++;
    return{query,release(){}};
  }});
  const base={from:'2026-11-01',to:'2026-11-03',store_id:'23'},params=patch=>new URLSearchParams({...base,...patch});
  const get=(kind,patch={},user=actor)=>{expectedActor=user;return reports.readMobileSalesReport(user,kind,params(patch));};
  const checks=[];
  try{
    await sql.exec(`CREATE SCHEMA himoto;
      CREATE TABLE himoto.stores(id bigint PRIMARY KEY,store_name text);
      CREATE TABLE himoto.users(id bigint PRIMARY KEY,name text);
      CREATE TABLE himoto.customers(id bigint PRIMARY KEY,name text,phone text,id_card text);
      CREATE TABLE himoto.staff_profiles(id bigint PRIMARY KEY,full_name text,position text);
      CREATE TABLE himoto.vehicles(id bigint PRIMARY KEY,name text,license text,type text,year int,store_id bigint,current_store_id bigint,deleted_at timestamptz);
      CREATE FUNCTION himoto.vehicle_inventory() RETURNS SETOF himoto.vehicles LANGUAGE SQL AS 'SELECT * FROM himoto.vehicles';
      CREATE TABLE himoto.orders(id bigint PRIMARY KEY,customer_id bigint,customer_name text,store_id bigint,rent_at timestamptz,return_at timestamptz,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz,order_status text,order_type text,contract_number text,draft_reference text,draft_payload jsonb,total text,pid numeric,total_rental_fees numeric,first_deposit_amount numeric,additional_deposit_amount numeric,customer_source text);
      CREATE TABLE himoto.order_vehicle_details(id bigint PRIMARY KEY,order_id bigint,vehicle_id bigint,rent_at timestamptz,return_at timestamptz,completed_at timestamptz,deleted_at timestamptz,type text,hiring_fee numeric,handler_price numeric,total_money numeric,money_out_date numeric,total_renewal_amount numeric,substitute_unit_price numeric);
      CREATE TABLE himoto.transactions(id bigint PRIMARY KEY,order_id bigint,created_at timestamptz,type text,status text,value numeric,name text,"desc" text,note text,store_id bigint,user_id bigint,order_item_id bigint,payment_method int,bank_owner_type text,bank_id bigint,cash_id bigint,object_type text,object_id bigint);
      CREATE TABLE himoto.banks(id bigint PRIMARY KEY,bank_name text,owner_name text,account_number text);
      CREATE TABLE himoto.cash(id bigint PRIMARY KEY,name text);
      CREATE TABLE himoto.battery_contracts(id bigint PRIMARY KEY,code text);
      CREATE TABLE himoto.management_contract_payments(transaction_id bigint,renewal_payload jsonb);
      INSERT INTO himoto.stores VALUES(23,'Cơ sở QA'),(24,'Kho QA khác');INSERT INTO himoto.users VALUES(7,'QA Quản lý');
      INSERT INTO himoto.staff_profiles VALUES(501,'NVKD QA','NVKD'),(502,'TLS QA','TLS');
      INSERT INTO himoto.customers VALUES(201,'Khách báo cáo QA','0000000001','QA-REPORT-1'),(202,'Khách cơ sở24 QA','0000000002','QA-REPORT-2'),(203,'Khách chưa ghi nguồn QA','0000000003','QA-REPORT-3');
      INSERT INTO himoto.cash VALUES(1,'Két báo cáo QA');INSERT INTO himoto.banks VALUES(1,'Bank QA','Company QA','QA001'),(2,'Bank QA','Personal QA','QA002');`);
    for(let i=301;i<=312;i++)await query('INSERT INTO himoto.vehicles VALUES($1,$2,$3,$4,2026,23,$5,NULL)',[i,i===312?'=QA Formula':'Xe báo cáo QA '+(i-300),'QA-REPORT-'+i,'xeso',i===302?24:23]);
    for(const [id,customer,store,start,fee,total,pid,source] of [[101,201,23,'2026-11-01T02:00:00Z',3000,'3820',2820,'TLS'],[102,202,24,'2026-11-02T02:00:00Z',2000,'2000',0,''],[103,203,23,'2026-11-03T02:00:00Z',1000,'1000',0,'']]){
      const draft={management_composer:{rental_type:'day',draft:{total_amount:String(fee+(id===101?300:0)),start_date:start.slice(0,16),end_date:'2026-11-04T09:00',sales_staff_id:id===101?'501':'',tls_staff_id:id===101?'502':'',extra_charges:id===101?[{amount:300}]:[]},sales_attribution:{NVKD:{name:'NVKD QA'}}}};
      if(id===101)draft.management_composer.return_adjustments=[{item_id:'501',late_fee:100,early_discount:200,repair_fee:50}];
      await query(`INSERT INTO himoto.orders VALUES($1,$2,$3,$4,$5,'2026-11-04T02:00:00Z',$5,now(),NULL,'renting','day',$6,NULL,$7,$8,$9,$10,$11,0,$12)`,[id,customer,'Khách báo cáo QA '+id,store,start,'REPORT-'+id,JSON.stringify(draft),total,pid,fee,id===101?1000:0,source]);
      await query(`INSERT INTO himoto.order_vehicle_details VALUES($1,$2,$3,$4,'2026-11-04T02:00:00Z',NULL,NULL,'day',1000,$5,$5,0,$6,0)`,[id+400,id,id+200,start,fee,id===101?500:0]);
    }
    const receipts=[[1001,'2026-11-01T03:00:00Z','in','order:payment',1300,1,'',null,1],[1002,'2026-11-02T03:00:00Z','addon','addon',500,3,'',null,null],[1003,'2026-11-02T03:10:00Z','in','order:return_late',100,2,'company',1,null],[1004,'2026-11-03T03:00:00Z','out','order:rental_refund',200,1,'',null,1],[1005,'2026-11-01T03:01:00Z','in','order:deposit',1000,1,'',null,1],[1006,'2026-11-03T03:30:00Z','out','order:deposit_refund',300,2,'personal',2,null],[1007,'2026-11-03T04:00:00Z','in','order:return_repair',50,1,'',null,1],[1008,'2026-11-03T05:00:00Z','in','order:extra',70,2,'',null,null]];
    for(const [id,at,type,name,value,method,owner,bank,cash] of receipts)await query(`INSERT INTO himoto.transactions VALUES($1,101,$2,$3,'approved',$4,$5,NULL,$6,23,7,501,$7,$8,$9,$10,NULL,NULL)`,[id,at,type,value,name,id===1008?'=SUM(1,2)':'Ghi chú QA',method,owner,bank,cash]);
    const snapshot=async()=>JSON.stringify((await query(`SELECT jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM himoto.orders o),'lines',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM himoto.order_vehicle_details d),'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM himoto.transactions t)) AS snapshot`)).rows[0].snapshot);
    const before=await snapshot();
    if(process.argv.includes('--dashboard-only'))return await require('./lib/mobile_dashboard_sql.cjs')({sql,query,load,root,actor,params,snapshot,before,setExpected:user=>{expectedActor=user;},connections:()=>({ownerConnections,ordinaryConnections})});
    expectedActor=actor;const options=await reports.readMobileReportOptions(actor);assert(dto.isSalesReportOptions(options));assert.equal(options.canViewFleet,false);assert.equal(ownerConnections,0);
    const actual=await get('actual');assert(dto.isMobileSalesReport(actual));assert.equal(actual.metrics.find(row=>row.label==='Doanh thu').value,1300);
    const webRental=load(path.join(root,'lib/server/rental-revenue')),webEstimate=load(path.join(root,'lib/server/estimated-sales'));
    const direct=await withMobileData(actor,'',()=>webRental.rentalRevenue({query},base.from,base.to,23,'contracts'));
    assert.equal(direct.total.late,100);assert.equal(direct.company_fees,520);
    const estimate=await withMobileData(actor,'',()=>webEstimate.estimatedSales({query},base.from,base.to,23));
    assert.equal(actual.metrics.find(row=>row.label==='Doanh thu').value,direct.total.revenue);assert.equal(actual.metrics.find(row=>row.label==='Doanh số').value,estimate.sales);
    const summary=await get('contracts');assert.equal(summary.metrics.find(row=>row.label==='Hợp đồng').value,2);
    checks.push('Actual rental receipts, estimated day-vehicle sales and contract debt/KPIs use the exact web readers in one unchanged scoped read-only context; rental revenue is1300, late fees are accounted to company fees, and contracts include both in-period customers');
    const ledger=await get('ledger',{side:'in',size:'1'}),expense=await get('ledger',{side:'out',size:'1'});assert(dto.isMobileSalesReport(ledger)&&dto.isMobileSalesReport(expense));
    assert.equal(ledger.metrics.find(row=>row.label==='Tổng thu').value,3020);assert.equal(ledger.metrics.find(row=>row.label==='Tổng chi').value,500);assert.equal(ledger.metrics.find(row=>row.label==='Tính doanh thu').value,1300);
    assert.equal(expense.metrics.find(row=>row.label==='Tính doanh thu').value,1300);assert.equal(ledger.sections[0].rows.length,1);
    const first=await get('vehicles',{size:'1'}),second=await get('vehicles',{size:'1',page:'2'});assert(first.sections[0].paging.total===11);assert.notEqual(first.sections[0].rows[0].key,second.sections[0].rows[0].key);
    const vehicleDetail=await get('vehicles',{vehicle_id:'301'});assert.equal(vehicleDetail.sections[0].rows[0].action.query,'id=101');assert.equal(vehicleDetail.sections[0].rows[0].values.at(-1),3300);
    const stores=await get('overview',{view:'stores'}),days=await get('overview',{view:'days'});assert.deepEqual(stores.metrics,days.metrics);assert(stores.sections[0].rows[0].action.query.includes('view=days'));
    checks.push('Ledger shows the combined two-side totals while paging each side independently; vehicle paging/details and store-to-day drilldowns reconcile to actual web amounts without guessing mixed payment allocation');
    for(const kind of ['by-staff','by-store','assigned','new-customers'])assert(dto.isMobileSalesReport(await get(kind)));
    const customers=await get('new-customers');assert.equal(customers.metrics[0].value,2);assert.equal(customers.metrics[2].value,1);assert(customers.metrics[2].action.query.includes('sourcePresence=without'));
    const missing=await get('new-customers',{sourcePresence:'without',detail:'1'});assert.equal(missing.sections[0].rows.length,1);assert.equal(missing.sections[0].rows[0].key,'203');
    const staff=await get('by-staff');assert(staff.sections[0].rows.some(row=>row.series.values.length>0));
    checks.push('Contract summaries, cumulative daily staff/store progress, assigned NVKD/TLS and first-customer source filters/with-without drilldowns use the same web domains and preserve unassigned groups');
    const beforeOwner=ownerConnections;await assert.rejects(get('fleet',{},unauthorizedAdmin),e=>e.status===403);assert.equal(ownerConnections,beforeOwner);
    const fleet=await get('fleet',{},entitled);assert(dto.isMobileSalesReport(fleet));assert.equal(fleet.metrics.find(row=>row.label==='Tổng xe').value,12);assert.equal(fleet.metrics.find(row=>row.label==='Cho cơ sở khác mượn').value,2000);
    const fleetDetail=await get('fleet',{view:'vehicles',size:'10'},entitled);assert.equal(fleetDetail.sections[0].paging.total,12);assert(ownerConnections>beforeOwner);
    for(const patch of [{from:'2026-02-30'},{from:base.to,to:base.from},{user_id:'145'},{store_id:'-1'}])await assert.rejects(get('actual',patch),e=>e.status===400);
    await assert.rejects(get('actual',{}, {...actor,permissions:[]}),e=>e.status===403);
    expectedActor=actor;await assert.rejects(reports.readMobileSalesReport(actor,'actual',new URLSearchParams('from=2026-11-01&from=2026-11-02&to=2026-11-03')),e=>e.status===400);
    checks.push('Only explicit entitled admin145 may use the separate read-only owner fleet query; another admin99 is denied before connecting, normal reports do not widen actor/store/operation, and injected/duplicate/date/permission inputs reject');
    const exported={};for(const kind of ['vehicles','overview','by-staff','by-store','assigned','new-customers','ledger']){expectedActor=actor;const file=await exportsApi.exportMobileSalesReport(actor,kind,params({}));assert(fileDto.isMobileFileExport(file));exported[kind]=file;}
    assert.equal(exported.vehicles.rowCount,11);assert(exported.vehicles.content.includes("'\u003dQA Formula"));assert(exported['new-customers'].content.includes('Khách hàng","Điện thoại","CCCD"'));
    const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(exported.ledger.contentBase64,'base64'));assert.deepEqual(book.worksheets.map(sheet=>sheet.name),['Phiếu thu','Phiếu chi']);
    assert.equal(book.worksheets[0].getRow(4).getCell(16).value,'Ghi chú');assert.equal(book.worksheets[0].lastRow.getCell(9).value,2350);assert.equal(book.worksheets[1].lastRow.getCell(9).value,-200);assert.equal(book.worksheets[0].lastRow.getCell(13).value+book.worksheets[1].lastRow.getCell(13).value,1300);
    assert(book.worksheets[0].getRows(5,6).some(row=>row.getCell(16).value==='=SUM(1,2)'));assert.equal(exported.ledger.rowCount,8);
    assert.equal(await snapshot(),before);checks.push('CSV exports the complete filtered rows with escaped formulas; shared web/mobile Excel builder produces both16-column sheets, signed payment amounts, totals and text-only note cells; all business tables remain unchanged');
    const outAt=process.argv.indexOf('--fixture-output');if(outAt>=0){
      const destination=path.resolve(process.argv[outAt+1]);assert(destination.startsWith(path.resolve('.backups')+path.sep));assert(!fs.existsSync(destination));
      const catalogue={fixtureOnly:true,options,entries:{},exports:{},source:'Actual web domain + mobile report projection on isolated PGlite; synthetic portfolio only'};
      const canonical=(kind,p)=>{const q=reports.reportQuery(kind,p);for(const[k,v]of [...q])if((kind==='vehicles'&&(k==='sort'&&v==='revenue'||k==='direction'&&v==='desc'))||(kind==='overview'&&k==='view'&&v==='stores')||(kind==='ledger'&&k==='side'&&v==='in'))q.delete(k);return kind+'?'+[...q].filter(([k,v])=>v&&k!=='page'&&k!=='size').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');};
      async function save(kind,patch={}){const q=params({...patch,...(kind==='vehicles'?{size:'50'}:kind==='ledger'?{size:'100'}:{})});expectedActor=actor;const data=await reports.readMobileSalesReport(actor,kind,q);const key=canonical(kind,q);catalogue.entries[key]=data;if(data.canExport)catalogue.exports[key]=await exportsApi.exportMobileSalesReport(actor,kind,q);}
      for(const preset of dto.REPORT_PRESETS){const[from,to]=dto.salesReportPeriod(preset.value,'2026-11-03');for(const {value:kind}of dto.SALES_REPORTS)if(kind!=='fleet')await save(kind,{from,to,...(kind==='ledger'?{side:'in'}:kind==='overview'?{view:'stores'}:{})});}
      for(const side of ['in','out'])for(const category of options.ledgerCategories.map(row=>row.value))await save('ledger',{side,category});
      for(const side of ['in','out'])for(const method of options.ledgerMethods.map(row=>row.value))await save('ledger',{side,method});
      for(const view of ['stores','days'])await save('overview',{view});await save('overview',{view:'days',detail:'1'});
      for(const sort of ['revenue','license','rentals'])for(const direction of ['asc','desc'])await save('vehicles',{sort,direction});
      for(const vehicle_id of ['301','303'])await save('vehicles',{sort:'revenue',direction:'desc',vehicle_id});
      for(const sourcePresence of ['','with','without']){await save('new-customers',{sourcePresence});await save('new-customers',{sourcePresence,detail:'1'});}
      await save('new-customers',{source:'TLS',detail:'1'});for(const department of ['NVKD','TLS'])await save('assigned',{department});
      for(const search of ['301','303'])await save('vehicles',{search,sort:'revenue',direction:'desc'});
      fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(catalogue,null,2));
    }
    console.log(JSON.stringify({passed:checks.length,checks,ordinaryConnections,ownerConnections,operationalWrites:0,database:'isolated in-memory PGlite; no deployed RLS or multi-session/native acceptance'},null,2));
  }finally{for(const{pool,descriptor}of originals){if(descriptor)Object.defineProperty(pool,'connect',descriptor);else delete pool.connect;}await sql.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
